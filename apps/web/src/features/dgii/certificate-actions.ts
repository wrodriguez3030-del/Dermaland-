"use server";

import { getSession } from "@/server/auth/context";
import { canConfigureDgiiEnvironment } from "@/features/billing/permissions";
import { isCertificateUploadEnabled } from "@/lib/env";
import {
  buildAlias,
  parsePkcs12,
  CertificateServiceError,
} from "@/server/services/certificate-service";
import {
  CertificateStorageError,
  getActiveCertificate,
  logCertificateUploadAudit,
  persistCertificate,
  type StoredCertificate,
} from "@/server/services/certificate-storage";

/**
 * Server actions del flujo de certificado DGII (Fase F).
 *
 * Reglas:
 *  - Toda esta lógica corre server-side. El form del cliente envía
 *    `FormData` por POST → server action → `parsePkcs12` →
 *    `persistCertificate`.
 *  - La contraseña se procesa en memoria server y se almacena cifrada.
 *  - El response al cliente NUNCA incluye el blob, la password ni la
 *    clave privada. Solo metadata segura (sujeto, emisor, fingerprint
 *    parcial, fechas).
 */

const MAX_BYTES = 65_536; // 64 KB suficiente para un .p12 estándar.

export interface UploadResult {
  ok: boolean;
  enabled: boolean;
  status: "valid" | "expired" | "invalid" | "rejected";
  error?: string;
  certificate?: PublicCertificate;
}

export interface PublicCertificate {
  id: string;
  alias: string;
  subjectDn: string;
  issuerDn: string;
  serialNumber: string;
  fingerprintShort: string;
  validFrom: string;
  validTo: string;
  validity: "valid" | "expired" | "invalid";
  rncEmisor?: string;
  uploadedAt: string;
}

function toPublic(stored: StoredCertificate): PublicCertificate {
  return {
    id: stored.id,
    alias: stored.alias,
    subjectDn: stored.subjectDn,
    issuerDn: stored.issuerDn,
    serialNumber: stored.serialNumber,
    fingerprintShort: stored.fingerprintSha256Short,
    validFrom: stored.validFrom,
    validTo: stored.validTo,
    validity: stored.validity,
    rncEmisor: stored.rncEmisor,
    uploadedAt: stored.uploadedAt,
  };
}

/**
 * Upload del .p12/.pfx + password. Es invocado desde `<form action={...}>`.
 *
 * Validaciones:
 *  1. Sesión autenticada.
 *  2. `isCertificateUploadEnabled()` true (sino devuelve `enabled:false`).
 *  3. Extensión .p12/.pfx, MIME plausible, tamaño <= 64 KB.
 *  4. Contraseña >= 4 caracteres (no la mostramos, solo length check).
 *  5. `parsePkcs12` no rompe (password correcta, formato válido).
 */
export async function uploadCertificateAction(
  formData: FormData,
): Promise<UploadResult> {
  if (!isCertificateUploadEnabled()) {
    return {
      ok: false,
      enabled: false,
      status: "rejected",
      error:
        "Fase F deshabilitada en este entorno (modo mock o falta DGII_CERT_ENCRYPTION_KEY).",
    };
  }
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      enabled: true,
      status: "rejected",
      error: "Sesión no autenticada.",
    };
  }
  // SEC-007: subir/reemplazar el certificado de firma fiscal (.p12) es
  // operación de administrador.
  if (!canConfigureDgiiEnvironment(session.user.role)) {
    return {
      ok: false,
      enabled: true,
      status: "rejected",
      error: "No tienes permiso para configurar el certificado fiscal.",
    };
  }

  const file = formData.get("file");
  const passwordRaw = formData.get("password");
  if (!(file instanceof Blob)) {
    return {
      ok: false,
      enabled: true,
      status: "rejected",
      error: "Falta el archivo (.p12/.pfx).",
    };
  }
  const password = typeof passwordRaw === "string" ? passwordRaw : "";
  if (password.length < 4) {
    return {
      ok: false,
      enabled: true,
      status: "rejected",
      error: "Contraseña inválida (mínimo 4 caracteres).",
    };
  }

  const filename =
    (file as File).name?.toLowerCase() ?? "";
  if (!/\.(p12|pfx)$/.test(filename)) {
    return {
      ok: false,
      enabled: true,
      status: "rejected",
      error: "Extensión no permitida. Solo .p12 o .pfx.",
    };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      enabled: true,
      status: "rejected",
      error: `Archivo demasiado grande (${file.size} bytes; máx ${MAX_BYTES}).`,
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (err) {
    return {
      ok: false,
      enabled: true,
      status: "rejected",
      error: "No pude leer el archivo.",
    };
  }

  let parsed: ReturnType<typeof parsePkcs12>;
  try {
    parsed = parsePkcs12(bytes, password);
  } catch (err) {
    if (err instanceof CertificateServiceError) {
      if (err.code === "WRONG_PASSWORD") {
        return {
          ok: false,
          enabled: true,
          status: "rejected",
          error: "Contraseña incorrecta para este certificado.",
        };
      }
      return {
        ok: false,
        enabled: true,
        status: "rejected",
        error: `Archivo inválido (${err.code}).`,
      };
    }
    throw err;
  }

  const alias = buildAlias(parsed.metadata);

  let stored: StoredCertificate;
  try {
    stored = await persistCertificate({
      businessId: session.businessId,
      uploadedBy: session.user.id,
      alias,
      metadata: parsed.metadata,
      p12Bytes: bytes,
      password,
    });
  } catch (err) {
    if (err instanceof CertificateStorageError) {
      return {
        ok: false,
        enabled: true,
        status: "rejected",
        error: `Persistencia falló (${err.code}).`,
      };
    }
    throw err;
  } finally {
    // Wipe best-effort: sobreescribir el CONTENIDO del buffer (no solo la
    // referencia) antes de soltarlo al GC. NO loggear nada.
    bytes.fill(0);
    bytes = new Uint8Array(0);
  }

  // Audit (best-effort).
  await logCertificateUploadAudit({
    businessId: session.businessId,
    userId: session.user.id,
    userName: session.user.fullName,
    certId: stored.id,
    fingerprintShort: parsed.metadata.fingerprintSha256Short,
    validity: parsed.metadata.validity,
    alias,
  });

  // Reescribimos fingerprint completo en el response (no se guarda en DB,
  // pero es info pública útil para UI).
  return {
    ok: true,
    enabled: true,
    status: parsed.metadata.validity,
    certificate: {
      ...toPublic(stored),
      fingerprintShort: parsed.metadata.fingerprintSha256Short,
    },
  };
}

/**
 * Lee el certificado activo del business actual. Devuelve null si no hay
 * o si Fase F no está habilitada (la UI cae al certificate-status-store).
 */
export async function loadActiveCertificateAction(): Promise<PublicCertificate | null> {
  if (!isCertificateUploadEnabled()) return null;
  const session = await getSession();
  if (!session) return null;
  const cert = await getActiveCertificate(session.businessId);
  if (!cert) return null;
  return toPublic(cert);
}
