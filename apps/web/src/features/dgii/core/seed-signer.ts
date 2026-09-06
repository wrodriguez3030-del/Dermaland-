/**
 * Firma XMLDSig enveloped de la Semilla DGII (Fase G2A) — local, sin DGII.
 *
 * - XMLDSig enveloped, RSA-SHA256, Digest SHA256, c14n 2001/03/15, Reference URI="".
 * - <Signature> como hijo del elemento raíz de la semilla (root genérico, no <ECF>).
 * - KeyInfo con <X509Certificate> base64 (sin headers PEM).
 * - Sin fetch/DB/FS/env. No persiste/loguea la private key ni la semilla firmada.
 * - No acepta paths de archivo ni .p12/password. Reutiliza helpers PEM del e-CF signer.
 */
import { SignedXml } from "xml-crypto";
import { DOMParser } from "@xmldom/xmldom";
import {
  CANONICALIZATION_ALGORITHM,
  DIGEST_ALGORITHM,
  ENVELOPED_TRANSFORM,
  SIGNATURE_ALGORITHM,
} from "./signer-types";
import { extractCertificateInfo, normalizePemCertificate, normalizePemPrivateKey } from "./signer";
import { stripInsignificantXmlWhitespace } from "./xml-utils";
import {
  SeedSignerError,
  SeedSignerInvalidInput,
  type SignDgiiSeedXmlInput,
  type SignDgiiSeedXmlResult,
  type VerifyDgiiSeedSignatureInput,
  type VerifyDgiiSeedSignatureResult,
} from "./seed-signer-types";

const DSIG_NS = "http://www.w3.org/2000/09/xmldsig#";
const NCNAME_RE = /^[A-Za-z_][\w.-]*$/;

/** Local-name del elemento raíz (validado como NCName para usar en el xpath). */
function rootLocalName(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const root = doc.documentElement;
  if (!root) throw new SeedSignerInvalidInput("Semilla XML malformado.");
  const name = (root.localName || root.nodeName).replace(/^.*:/, "");
  if (!NCNAME_RE.test(name)) throw new SeedSignerInvalidInput("Nombre de raíz de semilla inválido.");
  return name;
}

export function signDgiiSeedXml(input: SignDgiiSeedXmlInput): SignDgiiSeedXmlResult {
  if (typeof input.seedXml !== "string" || input.seedXml.trim() === "") {
    throw new SeedSignerInvalidInput("Semilla vacía.");
  }
  if (input.seedXml.charCodeAt(0) === 0xfeff) throw new SeedSignerInvalidInput("La semilla no debe tener BOM.");

  const certPem = normalizePemCertificate(input.certificatePem);
  const keyPem = normalizePemPrivateKey(input.privateKeyPem);
  const info = extractCertificateInfo(certPem);
  const now = new Date();
  if (new Date(info.validTo) < now) throw new SeedSignerInvalidInput("El certificado está vencido.");
  if (new Date(info.validFrom) > now) throw new SeedSignerInvalidInput("El certificado aún no es vigente.");

  if (/<(?:\w+:)?Signature\b/.test(input.seedXml)) {
    throw new SeedSignerInvalidInput("La semilla ya contiene una firma.");
  }

  // v376 — preserveWhiteSpace=false (perfil oficial DGII "Firmado de e-CF"): se
  // firma el documento SIN el whitespace insignificante entre elementos, de modo
  // que el DigestValue coincida con el que DGII recalcula al validar. Sin esto,
  // un XML indentado (p. ej. la postulación que genera el Portal) firma y verifica
  // localmente pero DGII lo rechaza con "Firma Inválida" (causa raíz demostrada,
  // incidente 2026-07-16). Idempotente sobre un XML ya compacto (semilla/ARECF).
  const seedXml = stripInsignificantXmlWhitespace(input.seedXml);

  let root: string;
  try {
    root = rootLocalName(seedXml);
  } catch (e) {
    if (e instanceof SeedSignerInvalidInput) throw e;
    throw new SeedSignerInvalidInput("Semilla XML malformado.");
  }

  let sig: SignedXml;
  try {
    sig = new SignedXml({
      privateKey: keyPem,
      publicCert: certPem,
      signatureAlgorithm: SIGNATURE_ALGORITHM,
      canonicalizationAlgorithm: CANONICALIZATION_ALGORITHM,
    });
    sig.addReference({
      xpath: `//*[local-name(.)='${root}']`,
      transforms: [ENVELOPED_TRANSFORM, CANONICALIZATION_ALGORITHM],
      digestAlgorithm: DIGEST_ALGORITHM,
      isEmptyUri: true,
    });
    sig.getKeyInfoContent = SignedXml.getKeyInfoContent;
    sig.computeSignature(seedXml, { location: { reference: `//*[local-name(.)='${root}']`, action: "append" } });
  } catch (e) {
    throw new SeedSignerError(`No se pudo firmar la semilla: ${e instanceof Error ? e.name : "error"}.`);
  }

  let signedSeedXml = sig.getSignedXml();
  if (signedSeedXml.charCodeAt(0) === 0xfeff) signedSeedXml = signedSeedXml.slice(1);

  return {
    signedSeedXml,
    certificateFingerprintSha256: info.fingerprintSha256,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    digestAlgorithm: DIGEST_ALGORITHM,
    canonicalizationAlgorithm: CANONICALIZATION_ALGORITHM,
    warnings: [],
  };
}

export function verifyDgiiSeedSignature(input: VerifyDgiiSeedSignatureInput): VerifyDgiiSeedSignatureResult {
  const errors: string[] = [];
  if (typeof input.signedSeedXml !== "string" || input.signedSeedXml.trim() === "") {
    return { ok: false, errors: ["Semilla firmada vacía."] };
  }

  let signatureNode: Node | null = null;
  try {
    const doc = new DOMParser().parseFromString(input.signedSeedXml, "text/xml");
    const list = doc.getElementsByTagNameNS(DSIG_NS, "Signature");
    if (!list || list.length === 0) return { ok: false, errors: ["No se encontró <Signature> en la semilla."] };
    if (list.length > 1) return { ok: false, errors: ["La semilla contiene más de una firma."] };
    signatureNode = list[0] as unknown as Node;
  } catch {
    return { ok: false, errors: ["Semilla mal formada."] };
  }

  let fingerprint: string | undefined;
  try {
    const sig = new SignedXml();
    let certPem = input.certificatePem ? normalizePemCertificate(input.certificatePem) : undefined;
    if (!certPem) {
      const m = input.signedSeedXml.match(/<(?:\w+:)?X509Certificate>([\s\S]*?)<\/(?:\w+:)?X509Certificate>/);
      if (!m) return { ok: false, errors: ["No hay certificatePem ni X509Certificate embebido."] };
      const b64 = m[1]!.replace(/\s+/g, "");
      certPem = `-----BEGIN CERTIFICATE-----\n${b64.replace(/(.{64})/g, "$1\n").trimEnd()}\n-----END CERTIFICATE-----\n`;
    }
    sig.publicCert = certPem;
    fingerprint = extractCertificateInfo(certPem).fingerprintSha256;
    sig.loadSignature(signatureNode);
    const ok = sig.checkSignature(input.signedSeedXml);
    if (!ok) errors.push("La firma de la semilla no es válida.");
    return { ok, errors, certificateFingerprintSha256: fingerprint };
  } catch (e) {
    errors.push(`Verificación fallida: ${e instanceof Error ? e.name : "error"}.`);
    return { ok: false, errors, certificateFingerprintSha256: fingerprint };
  }
}
