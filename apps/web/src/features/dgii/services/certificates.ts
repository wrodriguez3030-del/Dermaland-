import "server-only";

/**
 * Certificado fiscal (.p12) del negocio — lectura y guardado.
 *
 * Portado de `~/Projects/agendapp/src/lib/dgii/certificate-storage.ts`
 * (SOLO LECTURA, no se modifica). Cambios respecto al original, documentados
 * aquí porque el pliego no puede saberlos de antemano:
 *
 * 1. **Prisma → repositorio Supabase.** `prisma.dgiiCertificate` se
 *    reemplaza por `crearRepositorioConfiguracion` de
 *    `server/repositories/supabase/dgii-settings.ts`, sobre la tabla
 *    `dgii_certificates` de la fase 2 (columnas `pkcs12_encrypted_blob` +
 *    `password_secret_ref`; NO `pkcs12_storage_bucket`/`pkcs12_storage_path`/
 *    `iv`/`tag`, que son de la tabla vieja).
 * 2. **Se sella el `.p12` completo, no el par PEM.** agendapp sella
 *    `{certPem, keyPem}` (JSON) porque solo necesita firmar. Aquí el sobre
 *    guarda los bytes ORIGINALES del `.p12` (`sealBytesAesGcm`), porque la
 *    interfaz pedida por esta fase (`obtenerCertificadoActivo` →
 *    `p12: Buffer`) devuelve el archivo tal cual se subió, no sus partes ya
 *    separadas. Esto es intencional, no un descuido: lo dice el nombre de
 *    la columna (`pkcs12_encrypted_blob`) y el tipo `CertificadoActivo`.
 * 3. **Siempre `service-role`, nunca el cliente de sesión.** Aquí se usa
 *    `createServiceRoleClient()` en todo momento — las tablas de la fase 2
 *    tienen RLS pensado para `service_role`; con el cliente de sesión estas
 *    consultas fallarían con un error de permiso.
 * 4. **`p12_invalido` vs `clave_incorrecta`.** El parser del núcleo (fase 1,
 *    no se toca) lanza el MISMO error para "archivo corrupto" y "contraseña
 *    incorrecta" — forge combina ambos casos en un único catch. Aquí se
 *    distinguen sin tocar el núcleo: si los bytes ni siquiera son una
 *    estructura ASN.1/DER válida, es `p12_invalido`; si la estructura es
 *    válida pero forge no logra abrir el sobre PKCS12 con la contraseña
 *    dada, es `clave_incorrecta`. Verificado empíricamente (ver
 *    task-2-report.md) contra los tres casos de entrada corrupta y un `.p12`
 *    real con contraseña equivocada.
 * 5. **Auditoría con `auditRepository` (ronda de corrección 1).** agendapp
 *    llama `recordAudit(...)` en cada operación sobre el certificado; la
 *    primera versión de este archivo lo dejó fuera porque la interfaz
 *    pedida no lo mencionaba. Es una regresión real, no un detalle: el
 *    `.p12` es el material con el que se firman comprobantes ante la DGII,
 *    y no saber quién lo subió ni cuándo es un hueco de cumplimiento. Se usa
 *    el `auditRepository` que ya existe en
 *    `server/repositories/supabase/audit.ts` (acción
 *    `"dgii_certificate_upload"`, igual que agendapp) y `guardarCertificado`
 *    ahora recibe `userId` y lo escribe en `uploaded_by`. La entrada de
 *    auditoría lleva SOLO alias, huella (`fingerprintSha256`) y fechas de
 *    vigencia — nunca el `.p12`, la contraseña, ni el sobre cifrado.
 *
 * Regla dura de toda la fase: el `.p12` NUNCA se guarda ni se registra en
 * claro — ni en la base, ni en un log, ni en un mensaje de error.
 */
import { createServiceRoleClient } from "@/lib/supabase/server";
import { crearRepositorioConfiguracion } from "@/server/repositories/supabase/dgii-settings";
import { auditRepository } from "@/server/repositories/supabase/audit";
import * as forge from "node-forge";
import {
  getDgiiEncryptionKeyFromEnv,
  openBytesAesGcm,
  openTextAesGcm,
  sealBytesAesGcm,
  sealTextAesGcm,
  type SealedSecret,
} from "../core/certificate-encryption";
import { parsePkcs12Certificate, type ParsedDgiiCertificate } from "../core/certificate-parser";

/**
 * Los cuatro casos que la pantalla tiene que poder distinguir con un mensaje
 * propio. "Todos los errores dicen «no se pudo leer el certificado»" es
 * exactamente lo que esto existe para evitar.
 */
export type CodigoErrorCertificado =
  | "sin_certificado"
  | "vencido"
  | "p12_invalido"
  | "clave_incorrecta";

/** Error del dominio "certificado fiscal". Nunca lleva el `.p12` ni la password en el mensaje. */
export class ErrorCertificado extends Error {
  constructor(
    message: string,
    public codigo: CodigoErrorCertificado,
  ) {
    super(message);
    this.name = "ErrorCertificado";
  }
}

/** Certificado activo, descifrado en memoria. NUNCA debe salir de un contexto server-only. */
export interface CertificadoActivo {
  id: string;
  alias: string | null;
  subjectDn: string | null;
  /** ISO 8601. */
  validFrom: string;
  /** ISO 8601. */
  validTo: string;
  /** Bytes originales del `.p12` subido, descifrados en memoria. */
  p12: Buffer;
  password: string;
}

export interface ArgsGuardarCertificado {
  /** Bytes originales del archivo `.p12`/`.pfx` subido. */
  pkcs12: Buffer;
  password: string;
  alias?: string | null;
  /** Quién sube el certificado — se escribe en `uploaded_by` y en la auditoría. */
  userId: string;
  /** Para la entrada de auditoría (`AuditLog.userName` es obligatorio ahí). */
  userName?: string;
}

function obtenerClienteOFallar() {
  const cliente = createServiceRoleClient();
  if (!cliente) {
    throw new Error(
      "Supabase no configurado (faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  return cliente;
}

/**
 * `true` si `bytes` es sintácticamente una estructura ASN.1/DER (paso previo
 * e independiente de la contraseña). Sirve solo para distinguir "el archivo
 * no es un PKCS12" de "el archivo lo es, pero la contraseña no abre su MAC" —
 * el parser del núcleo junta ambos casos en un solo error y aquí hace falta
 * separarlos sin tocarlo.
 */
function tieneEstructuraPkcs12(pkcs12Bytes: Uint8Array): boolean {
  try {
    const binary = Buffer.from(pkcs12Bytes).toString("binary");
    forge.asn1.fromDer(forge.util.createBuffer(binary));
    return true;
  } catch {
    return false;
  }
}

/**
 * Envuelve `parsePkcs12Certificate` (núcleo, fase 1) traduciendo su fallo al
 * código de `ErrorCertificado` que corresponda, y rechaza los certificados
 * vencidos. La usan tanto `guardarCertificado` (con la contraseña que
 * escribió el usuario) como `obtenerCertificadoActivo` (con la contraseña ya
 * descifrada) — mismo criterio en los dos sentidos.
 */
function leerOFallar(pkcs12Bytes: Uint8Array, password: string): ParsedDgiiCertificate {
  let parsed: ParsedDgiiCertificate;
  try {
    parsed = parsePkcs12Certificate({ pkcs12Bytes, password });
  } catch {
    if (!tieneEstructuraPkcs12(pkcs12Bytes)) {
      throw new ErrorCertificado(
        "El archivo no es un certificado .p12/.pfx válido.",
        "p12_invalido",
      );
    }
    throw new ErrorCertificado(
      "La contraseña del certificado es incorrecta.",
      "clave_incorrecta",
    );
  }
  if (parsed.expired) {
    throw new ErrorCertificado(
      "El certificado está fuera de su período de vigencia.",
      "vencido",
    );
  }
  return parsed;
}

/**
 * Certificado fiscal activo del negocio, descifrado en memoria listo para
 * firmar. `null` si el negocio nunca cargó uno — eso NO es un
 * `ErrorCertificado`, es un resultado legítimo que decide quien llama (por
 * ejemplo, para mostrar "sin_certificado" en su propio contexto).
 *
 * Lanza `ErrorCertificado` si el que hay está vencido o si el material
 * almacenado no se puede descifrar/leer (dato corrupto, clave de cifrado
 * rotada sin re-cifrar, etc.) — nunca se devuelve un certificado que no sirva
 * para firmar.
 */
export async function obtenerCertificadoActivo(
  businessId: string,
): Promise<CertificadoActivo | null> {
  const cliente = obtenerClienteOFallar();
  const repo = crearRepositorioConfiguracion(cliente, businessId);
  const fila = await repo.leerCertificadoActivo();
  if (!fila) return null;

  // Atajo barato con la metadata en claro: si ya venció, ni se descifra.
  const ahora = new Date();
  if (fila.valid_to && new Date(fila.valid_to) < ahora) {
    throw new ErrorCertificado("El certificado está fuera de su período de vigencia.", "vencido");
  }
  if (fila.valid_from && new Date(fila.valid_from) > ahora) {
    throw new ErrorCertificado("El certificado está fuera de su período de vigencia.", "vencido");
  }

  const { pkcs12_encrypted_blob: blobP12, password_secret_ref: refPassword } = fila;
  if (!blobP12 || !refPassword) {
    throw new ErrorCertificado(
      "El certificado activo no tiene material almacenado.",
      "p12_invalido",
    );
  }

  const key = getDgiiEncryptionKeyFromEnv();
  let p12: Buffer;
  let password: string;
  try {
    const sobreP12 = JSON.parse(blobP12.toString("utf8")) as SealedSecret;
    p12 = Buffer.from(openBytesAesGcm(sobreP12, key));
    const sobrePassword = JSON.parse(refPassword) as SealedSecret;
    password = openTextAesGcm(sobrePassword, key);
  } catch {
    // Nunca reveles el contenido del sobre ni la clave en el mensaje.
    throw new ErrorCertificado(
      "No se pudo descifrar el material del certificado almacenado.",
      "p12_invalido",
    );
  }

  // Reconfirma que lo descifrado abre de verdad (defensa en profundidad: si
  // algún día los dos sobres quedan inconsistentes entre sí, esto lo atrapa
  // aquí y no en mitad de una firma real).
  leerOFallar(p12, password);

  return {
    id: fila.id,
    alias: fila.alias,
    subjectDn: fila.subject_dn,
    validFrom: fila.valid_from ?? "",
    validTo: fila.valid_to ?? "",
    p12,
    password,
  };
}

/**
 * Guarda un certificado nuevo cifrado (sobre AES-256-GCM) y lo activa,
 * desactivando el anterior en la misma llamada. Rechaza `.p12` inválidos,
 * con contraseña incorrecta, o ya vencidos — nunca llega a la base un
 * certificado que no sirva.
 */
export async function guardarCertificado(
  businessId: string,
  args: ArgsGuardarCertificado,
): Promise<{ id: string }> {
  const parsed = leerOFallar(args.pkcs12, args.password);

  const key = getDgiiEncryptionKeyFromEnv();
  const sobreP12 = sealBytesAesGcm(args.pkcs12, key);
  const sobrePassword = sealTextAesGcm(args.password, key);

  const cliente = obtenerClienteOFallar();
  const repo = crearRepositorioConfiguracion(cliente, businessId);

  // Un solo activo por negocio (índice único parcial en la tabla): se
  // desactivan los anteriores ANTES de insertar el nuevo.
  await repo.desactivarCertificados();
  const { id } = await repo.insertarCertificado({
    alias: args.alias ?? null,
    subject_dn: parsed.metadata.subject,
    issuer_dn: parsed.metadata.issuer,
    // La columna es varchar(128); el serial de forge no tiene tope conocido.
    serial_number: parsed.metadata.serialNumber.slice(0, 128),
    valid_from: parsed.metadata.validFrom,
    valid_to: parsed.metadata.validTo,
    pkcs12_encrypted_blob: Buffer.from(JSON.stringify(sobreP12), "utf8"),
    password_secret_ref: JSON.stringify(sobrePassword),
    uploaded_by: args.userId,
  });

  // Auditoría: SOLO metadata pública del certificado (alias, huella, fechas).
  // Nunca el .p12, la contraseña, ni el sobre cifrado. `auditRepository.log`
  // nunca lanza (ver server/repositories/supabase/audit.ts) — un fallo de
  // auditoría no puede tumbar la subida del certificado.
  await auditRepository.log(
    { businessId },
    {
      businessId,
      userId: args.userId,
      userName: args.userName ?? "",
      action: "dgii_certificate_upload",
      entity: "dgii_certificates",
      entityId: id,
      metadata: {
        alias: args.alias ?? null,
        fingerprint_sha256: parsed.metadata.fingerprintSha256,
        valid_from: parsed.metadata.validFrom,
        valid_to: parsed.metadata.validTo,
      },
    },
  );

  return { id };
}
