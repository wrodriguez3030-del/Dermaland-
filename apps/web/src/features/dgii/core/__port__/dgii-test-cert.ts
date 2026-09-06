// Portada de agendapp: tests/helpers/dgii-test-cert.ts (2026-09-05), sin cambios.
// Genera certificados autofirmados EN MEMORIA para las pruebas de firma:
// no hay ni un certificado real en el repositorio.
/**
 * Helper SOLO PARA TESTS: genera un certificado self-signed DUMMY en memoria con
 * node-forge. NO escribe archivos, NO usa certificados reales, NO se commitea
 * ningún .pem/.key. Datos ficticios. La private key vive solo en memoria del test.
 */
import { createHash } from "node:crypto";
import * as forge from "node-forge";

export type DummyCert = {
  certificatePem: string;
  privateKeyPem: string;
  fingerprintSha256: string;
};

function makeCert(notBefore: Date, notAfter: Date): DummyCert {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "0123456789ABCDEF";
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;
  // Datos ficticios (RNC dummy). NO son reales.
  const attrs = [
    { name: "commonName", value: "DUMMY ECF TEST" },
    { name: "organizationName", value: "Negocio Dummy SRL" },
    { shortName: "OU", value: "RNC 130000000" },
    { name: "countryName", value: "DO" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs); // self-signed
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const certificatePem = forge.pki.certificateToPem(cert);
  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const fingerprintSha256 = createHash("sha256").update(Buffer.from(der, "binary")).digest("hex");
  return { certificatePem, privateKeyPem, fingerprintSha256 };
}

// Generación costosa (RSA 2048) → memoizar un cert válido reutilizable.
let cached: DummyCert | null = null;

/** Cert dummy VÁLIDO (2020–2035), reutilizado entre tests para velocidad. */
export function getDummyCert(): DummyCert {
  if (!cached) {
    cached = makeCert(new Date("2020-01-01T00:00:00Z"), new Date("2035-01-01T00:00:00Z"));
  }
  return cached;
}

/** Cert dummy VENCIDO (para probar el rechazo por expiración). */
export function getExpiredDummyCert(): DummyCert {
  return makeCert(new Date("2019-01-01T00:00:00Z"), new Date("2021-01-01T00:00:00Z"));
}

// ── PKI dummy (v327 — trust-store tests) ─────────────────────────────────────

export type DummyCa = { cert: forge.pki.Certificate; pem: string; keys: forge.pki.rsa.KeyPair };

export type DummyLeafOptions = {
  subjectAttrs?: forge.pki.CertificateField[];
  notBefore?: Date;
  notAfter?: Date;
  ocspUrl?: string | null;
  crlUrl?: string | null;
  /** null = OMITIR la extensión keyUsage (para probar el fail-closed). */
  keyUsage?: { digitalSignature?: boolean; nonRepudiation?: boolean } | null;
  serialNumber?: string;
};

const OID_AIA = "1.3.6.1.5.5.7.1.1";
const OID_OCSP = "1.3.6.1.5.5.7.48.1";
const OID_CRLDP = "2.5.29.31";
const URI_TAG = 6; // GeneralName [6] uniformResourceIdentifier

function aiaOcspDer(url: string): string {
  const { asn1 } = forge;
  const seq = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(OID_OCSP).getBytes()),
      asn1.create(asn1.Class.CONTEXT_SPECIFIC, URI_TAG, false, url),
    ]),
  ]);
  return asn1.toDer(seq).getBytes();
}

function crlDpDer(url: string): string {
  const { asn1 } = forge;
  const seq = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
        asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
          asn1.create(asn1.Class.CONTEXT_SPECIFIC, URI_TAG, false, url),
        ]),
      ]),
    ]),
  ]);
  return asn1.toDer(seq).getBytes();
}

function makeCa(cn: string, issuer: DummyCa | null, serial: string): DummyCa {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = serial;
  cert.validity.notBefore = new Date("2020-01-01T00:00:00Z");
  cert.validity.notAfter = new Date("2040-01-01T00:00:00Z");
  const attrs = [
    { name: "commonName", value: cn },
    { name: "organizationName", value: "DUMMY PKI" },
    { name: "countryName", value: "DO" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(issuer ? issuer.cert.subject.attributes : attrs);
  cert.setExtensions([
    { name: "basicConstraints", cA: true, critical: true },
    { name: "keyUsage", keyCertSign: true, cRLSign: true, critical: true },
  ]);
  cert.sign(issuer ? issuer.keys.privateKey : keys.privateKey, forge.md.sha256.create());
  return { cert, pem: forge.pki.certificateToPem(cert), keys };
}

let cachedPki: { root: DummyCa; intermediate: DummyCa; leafKeys: forge.pki.rsa.KeyPair } | null = null;

/** Root CA + intermedia dummy memoizadas (RSA es costoso); las leaf se emiten por opciones. */
export function getDummyPkiCas(): { root: DummyCa; intermediate: DummyCa } {
  if (!cachedPki) {
    const root = makeCa("DUMMY ROOT CA", null, "01");
    const intermediate = makeCa("DUMMY ISSUING CA", root, "02");
    cachedPki = { root, intermediate, leafKeys: forge.pki.rsa.generateKeyPair(2048) };
  }
  return { root: cachedPki.root, intermediate: cachedPki.intermediate };
}

/** Emite una leaf dummy desde la intermedia memoizada (keypair de leaf reutilizado). */
export function makeDummyLeaf(opts: DummyLeafOptions = {}): { cert: forge.pki.Certificate; pem: string; keys: forge.pki.rsa.KeyPair } {
  getDummyPkiCas();
  const { intermediate, leafKeys } = cachedPki!;
  const cert = forge.pki.createCertificate();
  cert.publicKey = leafKeys.publicKey;
  cert.serialNumber = opts.serialNumber ?? "1a2b3c4d";
  cert.validity.notBefore = opts.notBefore ?? new Date("2024-01-01T00:00:00Z");
  cert.validity.notAfter = opts.notAfter ?? new Date("2034-01-01T00:00:00Z");
  cert.setSubject(
    opts.subjectAttrs ?? [
      { name: "commonName", value: "FULANO DE TAL DUMMY" },
      { name: "countryName", value: "DO" },
    ],
  );
  cert.setIssuer(intermediate.cert.subject.attributes);
  const exts: object[] = [{ name: "basicConstraints", cA: false }];
  if (opts.keyUsage !== null) {
    exts.push({ name: "keyUsage", ...(opts.keyUsage ?? { digitalSignature: true }) });
  }
  if (opts.ocspUrl !== null) {
    exts.push({ id: OID_AIA, value: aiaOcspDer(opts.ocspUrl ?? "http://ocsp.dummy.test/ocsp") });
  }
  if (opts.crlUrl !== null) {
    exts.push({ id: OID_CRLDP, value: crlDpDer(opts.crlUrl ?? "http://crl.dummy.test/ca.crl") });
  }
  cert.setExtensions(exts as forge.pki.CertificateField[]);
  cert.sign(intermediate.keys.privateKey, forge.md.sha256.create());
  return { cert, pem: forge.pki.certificateToPem(cert), keys: leafKeys };
}

export type DummyPkcs12 = {
  pkcs12Bytes: Uint8Array;
  password: string;
  certificatePem: string;
  privateKeyPem: string;
  fingerprintSha256: string;
};

/**
 * Genera un .p12 DUMMY en memoria (datos ficticios) con la contraseña dada.
 * No escribe archivos. No usar certificados reales.
 */
export function makeDummyPkcs12(password = "test-pass-1234", expired = false): DummyPkcs12 {
  const base = expired
    ? makeCert(new Date("2019-01-01T00:00:00Z"), new Date("2021-01-01T00:00:00Z"))
    : makeCert(new Date("2020-01-01T00:00:00Z"), new Date("2035-01-01T00:00:00Z"));
  const cert = forge.pki.certificateFromPem(base.certificatePem);
  const key = forge.pki.privateKeyFromPem(base.privateKeyPem);
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(key, [cert], password, { algorithm: "3des" });
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  const pkcs12Bytes = Uint8Array.from(Buffer.from(der, "binary"));
  return {
    pkcs12Bytes,
    password,
    certificatePem: base.certificatePem,
    privateKeyPem: base.privateKeyPem,
    fingerprintSha256: base.fingerprintSha256,
  };
}
