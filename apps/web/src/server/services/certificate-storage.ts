import "server-only";
import { env, isCertificateUploadEnabled } from "@/lib/env";
import { createServer, createServiceRoleClient } from "@/lib/supabase/server";
import {
  deserializeBlob,
  openString,
  sealBytes,
  sealString,
  serializeBlob,
} from "@/server/crypto/cert-cipher";
import type { CertificateMetadata } from "./certificate-service";

/**
 * Persistencia y lectura de certificados DGII reales (Fase F).
 *
 * El blob `.p12` y la password se cifran con AES-256-GCM
 * (`DGII_CERT_ENCRYPTION_KEY`) antes de tocar Postgres. La metadata
 * (sujeto, emisor, fingerprint, fechas) viaja en columnas planas
 * porque ya es información pública del cert.
 *
 * Las RLS de `dgii_certificates` filtran por `business_id =
 * auth_business_id()`, así que el cliente normal (server cookies) es
 * suficiente para INSERT. Solo usamos service-role para limpiar la
 * fila si hay rollback parcial.
 */

export interface StoredCertificate {
  id: string;
  businessId: string;
  alias: string;
  subjectDn: string;
  issuerDn: string;
  serialNumber: string;
  fingerprintSha256: string;
  fingerprintSha256Short: string;
  validFrom: string;
  validTo: string;
  validity: "valid" | "expired" | "invalid";
  rncEmisor?: string;
  isActive: boolean;
  uploadedAt: string;
}

export class CertificateStorageError extends Error {
  readonly code:
    | "FEATURE_DISABLED"
    | "NO_SESSION"
    | "DB_ERROR"
    | "ENCRYPT_ERROR"
    | "NOT_FOUND";
  constructor(
    code: CertificateStorageError["code"],
    message: string,
    cause?: unknown,
  ) {
    super(`CertificateStorage[${code}]: ${message}`);
    this.name = "CertificateStorageError";
    this.code = code;
    if (cause !== undefined)
      (this as Error & { cause?: unknown }).cause = cause;
  }
}

function requireEnabled(): string {
  if (!isCertificateUploadEnabled() || !env.DGII_CERT_ENCRYPTION_KEY) {
    throw new CertificateStorageError(
      "FEATURE_DISABLED",
      "Fase F no habilitada en este entorno (faltan env vars o DATA_SOURCE != supabase)",
    );
  }
  return env.DGII_CERT_ENCRYPTION_KEY;
}

/**
 * Guarda un certificado nuevo y lo marca como activo. Desactiva el
 * activo anterior si existía (constraint `dgii_certificates_one_active`
 * lo previene server-side, pero hacemos UPDATE explícito antes).
 */
export async function persistCertificate(args: {
  businessId: string;
  uploadedBy: string;
  alias: string;
  metadata: CertificateMetadata;
  p12Bytes: Uint8Array;
  password: string;
}): Promise<StoredCertificate> {
  const key = requireEnabled();
  const sb = await createServer();
  if (!sb) {
    throw new CertificateStorageError("NO_SESSION", "supabase no disponible");
  }

  // Cifrado del blob y de la password.
  let p12Blob: string;
  let pwdBlob: string;
  try {
    p12Blob = serializeBlob(await sealBytes(args.p12Bytes, key));
    pwdBlob = serializeBlob(await sealString(args.password, key));
  } catch (err) {
    throw new CertificateStorageError(
      "ENCRYPT_ERROR",
      "no pude cifrar el material sensible",
      err,
    );
  }

  // Desactivar anteriores (un solo activo por business — constraint exclude).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = sb as any;
  const { error: deactivateErr } = await client
    .from("dgii_certificates")
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq("business_id", args.businessId)
    .eq("is_active", true);
  if (deactivateErr) {
    // No es fatal; la constraint atrapará duplicados.
    console.warn(
      "[certificate-storage] desactivar previo falló:",
      deactivateErr.message,
    );
  }

  // INSERT.
  const { data, error } = await client
    .from("dgii_certificates")
    .insert({
      business_id: args.businessId,
      alias: args.alias,
      subject_dn: args.metadata.subjectDn,
      issuer_dn: args.metadata.issuerDn,
      serial_number: args.metadata.serialNumber,
      valid_from: args.metadata.validFrom,
      valid_to: args.metadata.validTo,
      pkcs12_storage_bucket: null,
      pkcs12_storage_path: null,
      pkcs12_encrypted_blob: Buffer.from(p12Blob, "utf8"),
      kdf: "AES-256-GCM",
      iv: null,
      tag: null,
      password_secret_ref: pwdBlob,
      is_active: args.metadata.validity === "valid",
      uploaded_by: args.uploadedBy,
    })
    .select("id, business_id, created_at, is_active")
    .single();
  if (error || !data) {
    throw new CertificateStorageError(
      "DB_ERROR",
      `INSERT dgii_certificates falló: ${error?.message ?? "sin data"}`,
      error,
    );
  }

  return {
    id: data.id,
    businessId: data.business_id,
    alias: args.alias,
    subjectDn: args.metadata.subjectDn,
    issuerDn: args.metadata.issuerDn,
    serialNumber: args.metadata.serialNumber,
    fingerprintSha256: args.metadata.fingerprintSha256,
    fingerprintSha256Short: args.metadata.fingerprintSha256Short,
    validFrom: args.metadata.validFrom,
    validTo: args.metadata.validTo,
    validity: args.metadata.validity,
    rncEmisor: args.metadata.rncEmisor,
    isActive: data.is_active,
    uploadedAt: data.created_at,
  };
}

/**
 * Lee el certificado activo del business (solo metadata; nunca devuelve
 * el blob descifrado).
 */
export async function getActiveCertificate(
  businessId: string,
): Promise<StoredCertificate | null> {
  if (!isCertificateUploadEnabled()) {
    // En modo mock no hay registro real; devolver null y dejar que la UI
    // use el certificate-status-store.
    return null;
  }
  const sb = await createServer();
  if (!sb) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = sb as any;
  const { data, error } = await client
    .from("dgii_certificates")
    .select(
      "id, business_id, alias, subject_dn, issuer_dn, serial_number, valid_from, valid_to, is_active, created_at",
    )
    .eq("business_id", businessId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new CertificateStorageError(
      "DB_ERROR",
      `SELECT activo falló: ${error.message}`,
      error,
    );
  }
  if (!data) return null;

  const now = Date.now();
  const validity =
    now > new Date(data.valid_to).getTime()
      ? "expired"
      : now < new Date(data.valid_from).getTime()
        ? "invalid"
        : "valid";

  return {
    id: data.id,
    businessId: data.business_id,
    alias: data.alias,
    subjectDn: data.subject_dn ?? "",
    issuerDn: data.issuer_dn ?? "",
    serialNumber: data.serial_number ?? "",
    fingerprintSha256: "",
    fingerprintSha256Short: "",
    validFrom: data.valid_from,
    validTo: data.valid_to,
    validity,
    isActive: data.is_active,
    uploadedAt: data.created_at,
  };
}

/**
 * Audit log opcional. Si `service_role` no está configurada, no falla,
 * solo emite warning. Nunca registra password ni blob.
 */
export async function logCertificateUploadAudit(args: {
  businessId: string;
  userId: string;
  userName?: string;
  certId: string;
  fingerprintShort: string;
  validity: string;
  alias: string;
}): Promise<void> {
  const adminSb = createServiceRoleClient();
  if (!adminSb) {
    console.warn(
      "[certificate-storage] SERVICE_ROLE_KEY no disponible; skip audit log",
    );
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = adminSb as any;
  const { error } = await client.from("audit_logs").insert({
    business_id: args.businessId,
    user_id: args.userId,
    user_name: args.userName ?? null,
    action: "dgii_certificate_upload",
    entity: "dgii_certificates",
    entity_id: args.certId,
    metadata: {
      fingerprint_short: args.fingerprintShort,
      validity: args.validity,
      alias: args.alias,
    },
  });
  if (error) {
    console.warn("[certificate-storage] audit INSERT falló:", error.message);
  }
}

/**
 * Resuelve la pareja `<p12 bytes, password>` para Fase G (envío real).
 * NO se usa en Fase F. Sigue aquí porque la responsabilidad pertenece
 * a este módulo. Cuando Fase G se autorice, la Edge Function la llama.
 */
export async function resolveSigningMaterial(args: {
  businessId: string;
}): Promise<{ p12Bytes: Uint8Array; password: string } | null> {
  const key = requireEnabled();
  const adminSb = createServiceRoleClient();
  if (!adminSb) {
    throw new CertificateStorageError(
      "FEATURE_DISABLED",
      "Fase G requiere SUPABASE_SERVICE_ROLE_KEY (no autorizada todavía)",
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = adminSb as any;
  const { data, error } = await client
    .from("dgii_certificates")
    .select(
      "pkcs12_encrypted_blob, password_secret_ref",
    )
    .eq("business_id", args.businessId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new CertificateStorageError(
      "DB_ERROR",
      `SELECT blob falló: ${error.message}`,
      error,
    );
  }
  if (!data) return null;
  const blobBytes = Buffer.from(data.pkcs12_encrypted_blob).toString("utf8");
  const p12Bytes = await (async () => {
    const blob = deserializeBlob(blobBytes);
    const { openBytes } = await import("@/server/crypto/cert-cipher");
    return openBytes(blob, key);
  })();
  const passwordBlob = deserializeBlob(data.password_secret_ref);
  const password = await openString(passwordBlob, key);
  return { p12Bytes, password };
}
