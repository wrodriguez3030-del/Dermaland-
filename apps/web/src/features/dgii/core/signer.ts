/**
 * Firma XMLDSig enveloped para e-CF (Fase 6) — local, sin DGII.
 *
 * - XMLDSig enveloped, RSA-SHA256, Digest SHA256, c14n 2001/03/15, Reference URI="".
 * - <Signature> como ÚLTIMO hijo de <ECF>. Sin Id en el root ECF.
 * - KeyInfo con <X509Certificate> en base64 (sin headers PEM).
 * - Sin fetch/DB/FS/env/logging. No persiste private keys. No acepta .p12/password.
 * - El XML firmado vuelve a pasar el XSD oficial (la firma ocupa el xs:any final).
 */
import { createHash } from "node:crypto";
import { SignedXml } from "xml-crypto";
import { DOMParser } from "@xmldom/xmldom";
import * as forge from "node-forge";
import {
  CANONICALIZATION_ALGORITHM,
  DIGEST_ALGORITHM,
  ENVELOPED_TRANSFORM,
  SIGNATURE_ALGORITHM,
  EcfSignerInvalidInput,
  EcfSignerError,
  type CertificateInfo,
  type SignEcfXmlInput,
  type SignEcfXmlResult,
  type VerifyEcfSignatureInput,
  type VerifyEcfSignatureResult,
} from "./signer-types";
import { XML_DECLARATION, stripInsignificantXmlWhitespace } from "./xml-utils";

const DSIG_NS = "http://www.w3.org/2000/09/xmldsig#";

// ── PEM helpers ────────────────────────────────────────────────────────────
export function normalizePemCertificate(pem: string): string {
  if (typeof pem !== "string" || !pem.includes("BEGIN CERTIFICATE")) {
    throw new EcfSignerInvalidInput("Certificado PEM inválido.");
  }
  return pem.replace(/\r\n/g, "\n").trim() + "\n";
}

export function normalizePemPrivateKey(pem: string): string {
  if (typeof pem !== "string" || !/BEGIN (?:RSA |EC )?PRIVATE KEY/.test(pem)) {
    throw new EcfSignerInvalidInput("Private key PEM inválida.");
  }
  return pem.replace(/\r\n/g, "\n").trim() + "\n";
}

/** DER (binary string) del certificado a partir del PEM. */
function certDer(pem: string): forge.pki.Certificate {
  try {
    return forge.pki.certificateFromPem(pem);
  } catch {
    throw new EcfSignerInvalidInput("No se pudo parsear el certificado.");
  }
}

export function extractCertificateInfo(pem: string): CertificateInfo {
  const cert = certDer(normalizePemCertificate(pem));
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const fingerprint = createHash("sha256").update(Buffer.from(der, "binary")).digest("hex");
  const attrsToStr = (attrs: forge.pki.CertificateField[]) =>
    attrs.map((a) => `${a.shortName ?? a.name}=${String(a.value)}`).join(",");
  return {
    subject: attrsToStr(cert.subject.attributes),
    issuer: attrsToStr(cert.issuer.attributes),
    serialNumber: cert.serialNumber,
    validFrom: cert.validity.notBefore.toISOString(),
    validTo: cert.validity.notAfter.toISOString(),
    fingerprintSha256: fingerprint,
  };
}

// ── Strip de placeholder <Signature> (Fase 5) ───────────────────────────────
const EMPTY_SIGNATURE_RE = /<(?:\w+:)?Signature\b[^>]*?\/>|<(?:\w+:)?Signature\b[^>]*?>\s*<\/(?:\w+:)?Signature>/g;

function countSignatures(xml: string): number {
  const m = xml.match(/<(?:\w+:)?Signature\b/g);
  return m ? m.length : 0;
}

// ── Firma ────────────────────────────────────────────────────────────────
export function signEcfXml(input: SignEcfXmlInput): SignEcfXmlResult {
  const opts = input.options ?? {};
  const includeKeyInfo = opts.includeKeyInfo !== false;
  const validateBeforeSign = opts.validateBeforeSign !== false;

  if (typeof input.xml !== "string" || input.xml.trim() === "") {
    throw new EcfSignerInvalidInput("XML vacío.");
  }
  if (input.xml.charCodeAt(0) === 0xfeff) {
    throw new EcfSignerInvalidInput("El XML no debe tener BOM.");
  }
  if (validateBeforeSign && !/<(?:\w+:)?ECF\b/.test(input.xml)) {
    throw new EcfSignerInvalidInput("El XML no tiene elemento raíz <ECF>.");
  }

  const certPem = normalizePemCertificate(input.certificatePem);
  const keyPem = normalizePemPrivateKey(input.privateKeyPem);
  // Valida que cert/clave parseen (sin exponer material en errores).
  const info = extractCertificateInfo(certPem);
  // Rechazo local por vigencia (no vencido / ya vigente).
  const now = new Date();
  if (new Date(info.validTo) < now) {
    throw new EcfSignerInvalidInput("El certificado está vencido.");
  }
  if (new Date(info.validFrom) > now) {
    throw new EcfSignerInvalidInput("El certificado aún no es vigente.");
  }

  // Remover placeholder(s) de firma vacíos (Fase 5). Si queda una firma real → rechazar.
  const stripped = input.xml.replace(EMPTY_SIGNATURE_RE, "");
  if (countSignatures(stripped) > 0) {
    throw new EcfSignerInvalidInput("El XML ya contiene una firma; no se vuelve a firmar.");
  }
  // v376 — preserveWhiteSpace=false (perfil oficial DGII): firmar sin whitespace
  // insignificante para que el DigestValue coincida con la validación de DGII.
  // Idempotente sobre los e-CF que genera el builder (ya compactos).
  const xml = stripInsignificantXmlWhitespace(stripped);

  let sig: SignedXml;
  try {
    sig = new SignedXml({
      privateKey: keyPem,
      publicCert: certPem,
      signatureAlgorithm: SIGNATURE_ALGORITHM,
      canonicalizationAlgorithm: CANONICALIZATION_ALGORITHM,
    });
    sig.addReference({
      xpath: "//*[local-name(.)='ECF']",
      transforms: [ENVELOPED_TRANSFORM, CANONICALIZATION_ALGORITHM],
      digestAlgorithm: DIGEST_ALGORITHM,
      isEmptyUri: true,
    });
    if (includeKeyInfo) {
      // KeyInfo con <X509Data><X509Certificate>base64</X509Certificate></X509Data>.
      sig.getKeyInfoContent = SignedXml.getKeyInfoContent;
    }
    // <Signature> como último hijo de <ECF>.
    sig.computeSignature(xml, {
      location: { reference: "//*[local-name(.)='ECF']", action: "append" },
    });
  } catch (e) {
    throw new EcfSignerError(`No se pudo firmar el XML: ${e instanceof Error ? e.name : "error"}.`);
  }

  let signedXml = sig.getSignedXml();
  // Garantizar declaración XML y sin BOM.
  if (!signedXml.startsWith("<?xml")) {
    signedXml = `${XML_DECLARATION}\n${signedXml}`;
  }
  if (signedXml.charCodeAt(0) === 0xfeff) signedXml = signedXml.slice(1);

  return {
    signedXml,
    certificateFingerprintSha256: info.fingerprintSha256,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    digestAlgorithm: DIGEST_ALGORITHM,
    canonicalizationAlgorithm: CANONICALIZATION_ALGORITHM,
    warnings: [],
  };
}

// ── Verificación ──────────────────────────────────────────────────────────
export function verifyEcfSignature(input: VerifyEcfSignatureInput): VerifyEcfSignatureResult {
  const errors: string[] = [];
  if (typeof input.signedXml !== "string" || input.signedXml.trim() === "") {
    return { ok: false, errors: ["XML vacío."] };
  }

  let signatureNode: Node | null = null;
  try {
    const doc = new DOMParser().parseFromString(input.signedXml, "text/xml");
    const list = doc.getElementsByTagNameNS(DSIG_NS, "Signature");
    if (!list || list.length === 0) {
      return { ok: false, errors: ["No se encontró <Signature> en el XML."] };
    }
    if (list.length > 1) {
      return { ok: false, errors: ["El XML contiene más de una firma."] };
    }
    signatureNode = list[0] as unknown as Node;
  } catch {
    return { ok: false, errors: ["XML mal formado."] };
  }

  let fingerprint: string | undefined;
  try {
    const sig = new SignedXml();
    let certPem = input.certificatePem ? normalizePemCertificate(input.certificatePem) : undefined;
    // Si no se pasó cert, extraer el embebido en KeyInfo/X509Certificate.
    if (!certPem) {
      const m = input.signedXml.match(/<(?:\w+:)?X509Certificate>([\s\S]*?)<\/(?:\w+:)?X509Certificate>/);
      if (!m) return { ok: false, errors: ["No hay certificatePem ni X509Certificate embebido."] };
      const b64 = m[1]!.replace(/\s+/g, "");
      certPem = `-----BEGIN CERTIFICATE-----\n${b64.replace(/(.{64})/g, "$1\n").trimEnd()}\n-----END CERTIFICATE-----\n`;
    }
    sig.publicCert = certPem;
    fingerprint = extractCertificateInfo(certPem).fingerprintSha256;
    sig.loadSignature(signatureNode);
    const ok = sig.checkSignature(input.signedXml);
    if (!ok) errors.push("La firma no es válida (digest o signature value no coincide).");
    return { ok, errors, certificateFingerprintSha256: fingerprint };
  } catch (e) {
    errors.push(`Verificación fallida: ${e instanceof Error ? e.name : "error"}.`);
    return { ok: false, errors, certificateFingerprintSha256: fingerprint };
  }
}
