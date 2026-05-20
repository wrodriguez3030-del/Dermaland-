import "server-only";
import forge from "node-forge";

/**
 * Servicio de parseo y validación de certificados PKCS#12 (.p12/.pfx).
 *
 * Reglas críticas de seguridad:
 *  - El contenido del .p12 SOLO se procesa server-side.
 *  - La contraseña se recibe en memoria, se usa para verificar y se
 *    descarta. Nunca se imprime, nunca se loguea.
 *  - La metadata extraída (sujeto, emisor, serial, fingerprint, fechas)
 *    es información ya pública del certificado y se puede mostrar en UI.
 *  - La clave privada NUNCA se devuelve hacia el cliente. Solo el blob
 *    cifrado se persiste; descifrado solo en server / Edge Function.
 */

export type CertValidity = "valid" | "expired" | "invalid";

export interface CertificateMetadata {
  subjectDn: string;
  issuerDn: string;
  serialNumber: string;
  /** SHA-256 del DER del certificado, hex con separadores `:`. */
  fingerprintSha256: string;
  fingerprintSha256Short: string;
  validFrom: string;
  validTo: string;
  validity: CertValidity;
  /** RNC extraído del subject si está presente (DGII suele usarlo en serialNumber/OU). */
  rncEmisor?: string;
  /** Si tiene clave privada asociada (debería ser true para .p12 válido). */
  hasPrivateKey: boolean;
}

export class CertificateServiceError extends Error {
  readonly code:
    | "INVALID_PKCS12"
    | "WRONG_PASSWORD"
    | "NO_CERTIFICATE_BAG"
    | "NO_PRIVATE_KEY_BAG"
    | "MALFORMED_CERTIFICATE";
  constructor(
    code: CertificateServiceError["code"],
    message: string,
    cause?: unknown,
  ) {
    super(`CertificateService[${code}]: ${message}`);
    this.name = "CertificateServiceError";
    this.code = code;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

function attributesToDn(
  attrs: forge.pki.CertificateField[] | undefined,
): string {
  if (!attrs || attrs.length === 0) return "";
  return attrs
    .map((a) => {
      const name = a.shortName ?? a.name ?? "?";
      const value = a.value ?? "";
      return `${name}=${value}`;
    })
    .join(", ");
}

function pickRnc(
  cert: forge.pki.Certificate,
): string | undefined {
  // Heurística amplia: buscar en cualquier atributo del subject un
  // número de 9 a 11 dígitos. DGII usa serialNumber, OU u organization
  // dependiendo del emisor.
  for (const a of cert.subject.attributes ?? []) {
    const v = String(a.value ?? "");
    const match = v.match(/\b(\d{9,11})\b/);
    if (match) return match[1];
  }
  return undefined;
}

function fingerprintHex(der: string): {
  full: string;
  short: string;
} {
  const md = forge.md.sha256.create();
  md.update(der);
  const digest = md.digest().toHex().toUpperCase();
  const grouped = (digest.match(/.{2}/g) ?? []).join(":");
  const short = digest.slice(0, 8) + "…" + digest.slice(-8);
  return { full: grouped, short };
}

/**
 * Parsea el .p12 y devuelve metadata. Si la contraseña es incorrecta o
 * el formato no es válido, lanza `CertificateServiceError`.
 *
 * @param p12Buffer  bytes crudos del archivo .p12 / .pfx
 * @param password   contraseña del archivo. Solo en memoria.
 */
export function parsePkcs12(
  p12Buffer: Uint8Array,
  password: string,
): { metadata: CertificateMetadata; pemCertificate: string } {
  // node-forge requiere binary string para parsear ASN.1.
  const binary = forge.util.binary.raw.encode(p12Buffer);
  let asn1: forge.asn1.Asn1;
  try {
    asn1 = forge.asn1.fromDer(binary);
  } catch (err) {
    throw new CertificateServiceError(
      "INVALID_PKCS12",
      "archivo no parece un .p12/.pfx válido",
      err,
    );
  }

  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, /* strict */ false, password);
  } catch (err) {
    // node-forge tira distintos errores según el caso. Tratamos los
    // errores de password como WRONG_PASSWORD; otros como INVALID_PKCS12.
    const msg = String((err as Error)?.message ?? err);
    if (/MAC|password|incorrect/i.test(msg)) {
      throw new CertificateServiceError(
        "WRONG_PASSWORD",
        "contraseña incorrecta o el .p12 no incluye MAC integrity",
        err,
      );
    }
    throw new CertificateServiceError(
      "INVALID_PKCS12",
      "no pude decodificar el .p12",
      err,
    );
  }

  // Buscar certBag y keyBag.
  const certBagOid = forge.pki.oids.certBag as string;
  const keyBagOid = forge.pki.oids.pkcs8ShroudedKeyBag as string;
  const certBags = p12.getBags({ bagType: certBagOid });
  const keyBags = p12.getBags({ bagType: keyBagOid });
  const cert = certBags[certBagOid]?.[0]?.cert;
  const hasKey = Boolean(keyBags[keyBagOid]?.[0]?.key);

  if (!cert) {
    throw new CertificateServiceError(
      "NO_CERTIFICATE_BAG",
      "el .p12 no contiene certificado",
    );
  }

  const subjectDn = attributesToDn(cert.subject.attributes);
  const issuerDn = attributesToDn(cert.issuer.attributes);
  const serialNumber = (cert.serialNumber ?? "").toUpperCase();

  let der: string;
  let pem: string;
  try {
    der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    pem = forge.pki.certificateToPem(cert);
  } catch (err) {
    throw new CertificateServiceError(
      "MALFORMED_CERTIFICATE",
      "no pude serializar el certificado",
      err,
    );
  }
  const fp = fingerprintHex(der);

  const validFrom = cert.validity.notBefore.toISOString();
  const validTo = cert.validity.notAfter.toISOString();
  const now = Date.now();
  const validity: CertValidity =
    now < cert.validity.notBefore.getTime()
      ? "invalid"
      : now > cert.validity.notAfter.getTime()
        ? "expired"
        : "valid";

  return {
    metadata: {
      subjectDn,
      issuerDn,
      serialNumber,
      fingerprintSha256: fp.full,
      fingerprintSha256Short: fp.short,
      validFrom,
      validTo,
      validity,
      rncEmisor: pickRnc(cert),
      hasPrivateKey: hasKey,
    },
    pemCertificate: pem,
  };
}

/**
 * Helper para generar un alias seguro a partir del subject (sin PII
 * adicional).
 */
export function buildAlias(meta: CertificateMetadata): string {
  // Toma el CN si existe, sino primera parte del subject.
  const cn = meta.subjectDn
    .split(",")
    .map((s) => s.trim())
    .find((s) => s.toLowerCase().startsWith("cn="));
  if (cn) return cn.replace(/^cn=/i, "").trim();
  return meta.subjectDn.split(",")[0]?.trim() ?? "Certificado";
}
