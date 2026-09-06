/**
 * Parser de PKCS#12 (.p12/.pfx) para DGII (Fase 7) — server-side, en memoria.
 *
 * Extrae certificado público + private key (PEM) y metadata. Sin escribir archivos,
 * sin loguear el certificado/clave completos, sin red. Rechaza password incorrecto,
 * archivo corrupto, o ausencia de cert/clave.
 */
import * as forge from "node-forge";
import { extractCertificateInfo } from "./signer";
import type { CertificateInfo } from "./signer-types";

export type ParsedDgiiCertificate = {
  certificatePem: string;
  privateKeyPem: string;
  metadata: CertificateInfo;
  /** true si el cert está fuera de su período de validez (vencido o no vigente). */
  expired: boolean;
};

export class EcfCertificateParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EcfCertificateParseError";
  }
}

/** Re-exporta el cálculo de fingerprint a partir de un PEM. */
export function fingerprintCertificateSha256(certificatePem: string): string {
  return extractCertificateInfo(certificatePem).fingerprintSha256;
}

export function extractCertificateMetadata(certificatePem: string): CertificateInfo {
  return extractCertificateInfo(certificatePem);
}

export function parsePkcs12Certificate(input: {
  pkcs12Bytes: Uint8Array;
  password: string;
}): ParsedDgiiCertificate {
  if (!input || !(input.pkcs12Bytes instanceof Uint8Array) || input.pkcs12Bytes.length === 0) {
    throw new EcfCertificateParseError("Archivo de certificado vacío o inválido.");
  }
  if (typeof input.password !== "string") {
    throw new EcfCertificateParseError("Password requerido.");
  }

  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const binary = Buffer.from(input.pkcs12Bytes).toString("binary");
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(binary));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, input.password);
  } catch {
    // Password incorrecto o archivo corrupto. Sin detalle sensible.
    throw new EcfCertificateParseError("No se pudo abrir el .p12/.pfx (password incorrecto o archivo inválido).");
  }

  // Certificado público.
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag!];
  const certBag = certBags && certBags[0];
  if (!certBag || !certBag.cert) {
    throw new EcfCertificateParseError("El archivo no contiene un certificado.");
  }
  const certificatePem = forge.pki.certificateToPem(certBag.cert);

  // Private key (pkcs8 shrouded o keyBag).
  const shrouded = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag!];
  const plain = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag!];
  const keyBag = (shrouded && shrouded[0]) || (plain && plain[0]);
  if (!keyBag || !keyBag.key) {
    throw new EcfCertificateParseError("El archivo no contiene una private key.");
  }
  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key as forge.pki.PrivateKey);

  const metadata = extractCertificateInfo(certificatePem);
  const now = new Date();
  const expired = new Date(metadata.validTo) < now || new Date(metadata.validFrom) > now;

  return { certificatePem, privateKeyPem, metadata, expired };
}
