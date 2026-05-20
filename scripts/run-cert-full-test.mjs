#!/usr/bin/env node
/**
 * Ejecuta el flujo COMPLETO de Fase F + prueba local del certificado
 * directamente desde Node, sin pasar por el browser:
 *
 *   1. Lee password + secretos desde `apps/web/.env.local`
 *      (PREVIEW_ADMIN_PASSWORD, DGII_CERT_TEST_PASSWORD,
 *      DGII_CERT_ENCRYPTION_KEY, NEXT_PUBLIC_SUPABASE_URL,
 *      NEXT_PUBLIC_SUPABASE_ANON_KEY). El path al .p12 viene de la
 *      env var `CERT_TEST_P12_PATH` o argv[2]; nunca hardcoded.
 *   2. Login REST contra Supabase Auth con el seed user.
 *   3. Parsea el PKCS#12 con node-forge.
 *   4. Cifra blob `.p12` y password con AES-256-GCM
 *      (DGII_CERT_ENCRYPTION_KEY).
 *   5. INSERT en `dgii_certificates` con el JWT del seed user (RLS
 *      por `business_id = auth_business_id()` se resuelve gracias a
 *      la migración 0006).
 *   6. Genera XML demo + firma RSA-SHA256 + verifica + estructura +
 *      QR demo.
 *   7. Imprime metadata pública + steps. NUNCA imprime password,
 *      private key ni blobs descifrados.
 *
 * No llama a DGII. No envía XML. No consume secuencias. NO toca
 * producción.
 */

import fs from "node:fs";
import path from "node:path";
import { webcrypto } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(REPO_ROOT, "apps", "web", ".env.local");

const P12_PATH = process.env.CERT_TEST_P12_PATH ?? process.argv[2];
if (!P12_PATH) {
  console.error(
    "[cert-full-test] ERROR: falta CERT_TEST_P12_PATH. " +
      'Uso: CERT_TEST_P12_PATH="ruta/al/cert.p12" node scripts/run-cert-full-test.mjs ' +
      "(o pasarla como argv[2]). No se imprimen secretos.",
  );
  process.exit(1);
}

function die(msg, code = 1) {
  console.error(`[cert-full-test] ERROR: ${msg}`);
  process.exit(code);
}
function ok(msg) {
  console.log(`[cert-full-test] ${msg}`);
}

// ───────────────────────────── env loader ─────────────────────────────
function loadEnv() {
  if (!fs.existsSync(ENV_PATH))
    die(`no encontre ${ENV_PATH}`);
  const raw = fs.readFileSync(ENV_PATH, "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const eq = s.indexOf("=");
    let v = s.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    env[s.slice(0, eq).trim()] = v;
  }
  return env;
}

const env = loadEnv();
for (const k of [
  "DGII_CERT_ENCRYPTION_KEY",
  "DGII_CERT_TEST_PASSWORD",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "PREVIEW_ADMIN_EMAIL",
  "PREVIEW_ADMIN_PASSWORD",
]) {
  if (!env[k]) die(`falta ${k} en .env.local`);
}

// ───────────────────────────── forge import ─────────────────────────────
let forge;
try {
  const mod = await import(
    pathToFileURL(
      path.join(
        REPO_ROOT,
        "apps",
        "web",
        "node_modules",
        "node-forge",
        "lib",
        "index.js",
      ),
    ).href
  );
  forge = mod.default ?? mod;
} catch (err) {
  die(
    `no pude importar node-forge desde apps/web/node_modules: ${err?.message ?? err}`,
  );
}

let createClient;
try {
  const mod = await import(
    pathToFileURL(
      path.join(
        REPO_ROOT,
        "apps",
        "web",
        "node_modules",
        "@supabase",
        "supabase-js",
        "dist",
        "index.mjs",
      ),
    ).href
  );
  createClient = mod.createClient;
} catch (err) {
  die(`no pude importar supabase-js: ${err?.message ?? err}`);
}

// ───────────────────────── AES-256-GCM helpers ─────────────────────────
function decodeKey(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad === 2) s += "==";
  else if (pad === 3) s += "=";
  else if (pad === 1) die("DGII_CERT_ENCRYPTION_KEY length invalida");
  const buf = Buffer.from(s, "base64");
  if (buf.length !== 32)
    die(`DGII_CERT_ENCRYPTION_KEY debe ser 32 bytes (got ${buf.length})`);
  return new Uint8Array(buf);
}
const ENC_KEY_RAW = decodeKey(env.DGII_CERT_ENCRYPTION_KEY);
const ENC_KEY = await webcrypto.subtle.importKey(
  "raw",
  ENC_KEY_RAW,
  { name: "AES-GCM" },
  false,
  ["encrypt", "decrypt"],
);

async function seal(plaintextBytes) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await webcrypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      ENC_KEY,
      plaintextBytes,
    ),
  );
  const cipher = ct.slice(0, ct.length - 16);
  const tag = ct.slice(ct.length - 16);
  const combined = new Uint8Array(12 + 16 + cipher.length);
  combined.set(iv, 0);
  combined.set(tag, 12);
  combined.set(cipher, 28);
  return JSON.stringify({
    v: 1,
    alg: "AES-256-GCM",
    data: Buffer.from(combined).toString("base64"),
  });
}

// ───────────────────────── PKCS12 parse ─────────────────────────
function attrsToDn(attrs) {
  if (!attrs?.length) return "";
  return attrs
    .map((a) => `${a.shortName ?? a.name ?? "?"}=${a.value ?? ""}`)
    .join(", ");
}
function pickRnc(cert) {
  for (const a of cert.subject.attributes ?? []) {
    const v = String(a.value ?? "");
    const m = v.match(/\b(\d{9,11})\b/);
    if (m) return m[1];
  }
  return undefined;
}
function buildAlias(meta) {
  const cn = meta.subjectDn
    .split(",")
    .map((s) => s.trim())
    .find((s) => s.toLowerCase().startsWith("cn="));
  return cn ? cn.replace(/^cn=/i, "").trim() : meta.subjectDn.split(",")[0] ?? "Cert";
}
function fingerprintHex(derStr) {
  const md = forge.md.sha256.create();
  md.update(derStr);
  const hex = md.digest().toHex().toUpperCase();
  return {
    full: (hex.match(/.{2}/g) ?? []).join(":"),
    short: hex.slice(0, 8) + "…" + hex.slice(-8),
  };
}

function parseP12(bytes, password) {
  const binary = forge.util.binary.raw.encode(bytes);
  const asn1 = forge.asn1.fromDer(binary);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const keyBags = p12.getBags({
    bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
  });
  const cert = certBags[forge.pki.oids.certBag]?.[0]?.cert;
  const privateKey = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;
  if (!cert || !privateKey) die("p12 no contiene cert+key");

  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const fp = fingerprintHex(der);
  const pem = forge.pki.certificateToPem(cert);

  const now = Date.now();
  const validity =
    now < cert.validity.notBefore.getTime()
      ? "invalid"
      : now > cert.validity.notAfter.getTime()
        ? "expired"
        : "valid";

  return {
    cert,
    privateKey,
    pem,
    metadata: {
      subjectDn: attrsToDn(cert.subject.attributes),
      issuerDn: attrsToDn(cert.issuer.attributes),
      serialNumber: (cert.serialNumber ?? "").toUpperCase(),
      fingerprintSha256: fp.full,
      fingerprintSha256Short: fp.short,
      validFrom: cert.validity.notBefore.toISOString(),
      validTo: cert.validity.notAfter.toISOString(),
      validity,
      rncEmisor: pickRnc(cert),
      hasPrivateKey: Boolean(privateKey),
    },
  };
}

// ───────────────────────── Local cert test (firma) ─────────────────────────
function buildXmlDemo({ rnc, razon, testId }) {
  const today = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>32</TipoeCF>
      <eNCF>E320000000DEMO</eNCF>
      <FechaVencimientoSecuencia>2027-12-31</FechaVencimientoSecuencia>
    </IdDoc>
    <Emisor>
      <RNCEmisor>${rnc}</RNCEmisor>
      <RazonSocialEmisor>${razon}</RazonSocialEmisor>
      <FechaEmision>${today}</FechaEmision>
      <Ambiente>PRUEBA_LOCAL</Ambiente>
    </Emisor>
    <Comprador>
      <RNCComprador>000000000</RNCComprador>
      <RazonSocialComprador>Cliente DEMO (Prueba local)</RazonSocialComprador>
    </Comprador>
    <Totales>
      <MontoGravadoTotal>100.00</MontoGravadoTotal>
      <TotalITBIS>18.00</TotalITBIS>
      <MontoTotal>118.00</MontoTotal>
    </Totales>
  </Encabezado>
  <Detalle>
    <Item>
      <NumeroLinea>1</NumeroLinea>
      <Descripcion>Producto demo prueba local certificado</Descripcion>
      <Cantidad>1</Cantidad>
      <PrecioUnitario>100.00</PrecioUnitario>
      <MontoLinea>100.00</MontoLinea>
    </Item>
  </Detalle>
  <PruebaLocal>
    <Aviso>NO FISCAL. NO ENVIADO A DGII. SOLO VALIDACION DE FIRMA LOCAL.</Aviso>
    <TestId>${testId}</TestId>
  </PruebaLocal>
</ECF>`;
}
function sha256Hex(input) {
  const md = forge.md.sha256.create();
  md.update(input, "utf8");
  return md.digest().toHex();
}
function uuidV4() {
  const b = Buffer.from(forge.random.getBytesSync(16), "binary");
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function runLocalCertTest({ cert, privateKey, pem, metadata, rnc, razon }) {
  const testId = uuidV4();
  const xml = buildXmlDemo({ rnc, razon, testId });
  const xmlSha = sha256Hex(xml);

  // Firma RSA-SHA256.
  const md = forge.md.sha256.create();
  md.update(xml, "utf8");
  const sigRaw = privateKey.sign(md);
  const sigBase64 = forge.util.encode64(sigRaw);

  // Verifica con clave pública.
  const md2 = forge.md.sha256.create();
  md2.update(xml, "utf8");
  const verified = cert.publicKey.verify(md2.digest().bytes(), sigRaw);

  // Embebe firma.
  const pemClean = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
  const sigBlock = `
  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
    <SignedInfo>
      <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
      <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
    </SignedInfo>
    <SignatureValue>${sigBase64}</SignatureValue>
    <KeyInfo>
      <X509Data>
        <X509Certificate>${pemClean}</X509Certificate>
      </X509Data>
    </KeyInfo>
  </Signature>
</ECF>`;
  const signedXml = xml.replace(/<\/ECF>\s*$/, sigBlock);

  // Structure check.
  const required = [
    "<ECF>",
    "<RNCEmisor>",
    "<eNCF>",
    "<Totales>",
    "<Signature",
    "<SignatureValue>",
    "<X509Certificate>",
    "<PruebaLocal>",
    "</ECF>",
  ];
  const missing = required.filter((t) => !signedXml.includes(t));

  const steps = [
    { name: "cert_loaded", ok: true },
    {
      name: "cert_valid",
      ok: metadata.validity === "valid",
      detail:
        metadata.validity === "valid"
          ? `vigente hasta ${metadata.validTo}`
          : `validity=${metadata.validity}`,
    },
    { name: "xml_built", ok: true },
    { name: "xml_signed", ok: true },
    {
      name: "signature_verified",
      ok: verified,
      detail: verified ? "RSA-SHA256 OK" : "verify failed",
    },
    {
      name: "structure_valid",
      ok: missing.length === 0,
      detail: missing.length ? `falta ${missing.join(", ")}` : undefined,
    },
    { name: "qr_generated", ok: true },
  ];

  const qrPayloadDemo = `https://dermaland.local/dgii/test-local?rnc=${rnc}&testId=${testId}&fp=${metadata.fingerprintSha256Short}&hash=${xmlSha.slice(0, 16)}&kind=PRUEBA_LOCAL_NO_FISCAL`;

  return {
    testId,
    steps,
    xmlSha256: xmlSha,
    signedXmlBase64: Buffer.from(signedXml, "utf8").toString("base64"),
    signatureAlgorithm: "RSA-SHA256",
    signatureSize: sigRaw.length,
    qrPayloadDemo,
    verified,
    structureValid: missing.length === 0,
  };
}

// ───────────────────────── ejecución ─────────────────────────
ok("leyendo .p12");
if (!fs.existsSync(P12_PATH)) die(`no encontre ${P12_PATH}`);
const p12Bytes = new Uint8Array(fs.readFileSync(P12_PATH));
ok(`p12: ${p12Bytes.length} bytes`);

ok("parseando PKCS#12");
let parsed;
try {
  parsed = parseP12(p12Bytes, env.DGII_CERT_TEST_PASSWORD);
} catch (err) {
  const msg = String(err?.message ?? err);
  if (/MAC|password|incorrect/i.test(msg))
    die("contraseña incorrecta para el .p12 (DGII_CERT_TEST_PASSWORD)");
  die(`parseP12 falló: ${msg}`);
}
ok(`subject: ${parsed.metadata.subjectDn}`);
ok(`issuer:  ${parsed.metadata.issuerDn}`);
ok(`serial:  ${parsed.metadata.serialNumber}`);
ok(`fp:      ${parsed.metadata.fingerprintSha256Short}`);
ok(`vigente: ${parsed.metadata.validFrom.slice(0, 10)} -> ${parsed.metadata.validTo.slice(0, 10)} (${parsed.metadata.validity})`);
ok(`rnc:     ${parsed.metadata.rncEmisor ?? "?"}`);
ok(`hasKey:  ${parsed.metadata.hasPrivateKey}`);

ok("cifrando blob + password con AES-256-GCM");
const blobSealed = await seal(p12Bytes);
const pwdSealed = await seal(
  new TextEncoder().encode(env.DGII_CERT_TEST_PASSWORD),
);
ok(`blob sealed bytes:    ${blobSealed.length}`);
ok(`pwd  sealed bytes:    ${pwdSealed.length}`);

// ───────────────────────── login Supabase + persist ─────────────────────────
ok("autenticando con Supabase Auth (seed user)");
const authClient = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const { data: signIn, error: signInErr } =
  await authClient.auth.signInWithPassword({
    email: env.PREVIEW_ADMIN_EMAIL,
    password: env.PREVIEW_ADMIN_PASSWORD,
  });
if (signInErr || !signIn.session)
  die(`login fallo: ${signInErr?.message ?? "sin sesión"}`);
ok(`login OK. user_id=${signIn.user.id}`);

const userClaims = signIn.session.user.app_metadata ?? {};
const businessId =
  userClaims.business_id ??
  signIn.session.user.user_metadata?.business_id;
if (!businessId) die("seed user no tiene business_id en claims");
ok(`business_id: ${businessId}`);

// Persistir certificado.
ok("INSERT dgii_certificates (RLS con JWT del seed user)");
const alias = buildAlias(parsed.metadata);
const { data: existing, error: selErr } = await authClient
  .from("dgii_certificates")
  .select("id")
  .eq("business_id", businessId)
  .eq("is_active", true);
if (selErr) die(`SELECT previo falló: ${selErr.message}`);
if (existing?.length) {
  ok(`desactivando ${existing.length} cert(s) previos`);
  const { error: deactErr } = await authClient
    .from("dgii_certificates")
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("is_active", true);
  if (deactErr) console.warn("deactivate warning:", deactErr.message);
}

const { data: inserted, error: insErr } = await authClient
  .from("dgii_certificates")
  .insert({
    business_id: businessId,
    alias,
    subject_dn: parsed.metadata.subjectDn,
    issuer_dn: parsed.metadata.issuerDn,
    serial_number: parsed.metadata.serialNumber,
    valid_from: parsed.metadata.validFrom,
    valid_to: parsed.metadata.validTo,
    pkcs12_storage_bucket: null,
    pkcs12_storage_path: null,
    pkcs12_encrypted_blob: Buffer.from(blobSealed, "utf8"),
    kdf: "AES-256-GCM",
    iv: null,
    tag: null,
    password_secret_ref: pwdSealed,
    is_active: parsed.metadata.validity === "valid",
    uploaded_by: signIn.user.id,
  })
  .select("id, created_at, is_active")
  .single();
if (insErr || !inserted) die(`INSERT falló: ${insErr?.message ?? "sin data"}`);
ok(`cert id: ${inserted.id} (is_active=${inserted.is_active})`);

// ───────────────────────── local cert test ─────────────────────────
ok("ejecutando prueba local (firma + verifica + estructura + QR)");
const rnc = parsed.metadata.rncEmisor ?? "131234567";
const razon = parsed.metadata.subjectDn
  .split(",")
  .map((s) => s.trim())
  .find((s) => s.toUpperCase().startsWith("O="))
  ?.replace(/^O=/i, "")
  ?.trim() ?? "DermaLand SRL";

const test = runLocalCertTest({
  cert: parsed.cert,
  privateKey: parsed.privateKey,
  pem: parsed.pem,
  metadata: parsed.metadata,
  rnc,
  razon,
});

for (const s of test.steps) {
  ok(`step ${s.name}: ${s.ok ? "✓" : "✗"}${s.detail ? " (" + s.detail + ")" : ""}`);
}
ok(`testId: ${test.testId}`);
ok(`xmlSha256: ${test.xmlSha256.slice(0, 24)}…`);
ok(`sigSize: ${test.signatureSize} bytes`);
ok(`signed XML base64 size: ${test.signedXmlBase64.length}`);
ok(`qr (demo): ${test.qrPayloadDemo}`);

const passed = test.steps.every((s) => s.ok);
ok(passed ? "RESULT: CERTIFICADO VALIDADO LOCALMENTE" : "RESULT: failed con observaciones");

// Persistir summary en audit_logs (best effort).
const auditMeta = {
  fingerprint_short: parsed.metadata.fingerprintSha256Short,
  alias,
  validity: parsed.metadata.validity,
  test_id: test.testId,
  test_result: passed ? "passed" : "failed",
};
const { error: auditErr } = await authClient.from("audit_logs").insert({
  business_id: businessId,
  user_id: signIn.user.id,
  user_name: "preview-admin (script)",
  action: "dgii_certificate_upload",
  entity: "dgii_certificates",
  entity_id: inserted.id,
  metadata: auditMeta,
});
if (auditErr) console.warn("audit warning:", auditErr.message);

console.log(
  JSON.stringify(
    {
      cert: {
        id: inserted.id,
        alias,
        ...parsed.metadata,
        // NO incluimos fingerprint full extenso; el short alcanza para reporte.
        fingerprintSha256: undefined,
        hasPrivateKey: parsed.metadata.hasPrivateKey,
      },
      test: {
        testId: test.testId,
        result: passed ? "passed" : "failed",
        steps: test.steps,
        xmlSha256: test.xmlSha256,
        signatureAlgorithm: test.signatureAlgorithm,
        signatureSize: test.signatureSize,
        qrPayloadDemo: test.qrPayloadDemo,
      },
    },
    null,
    2,
  ),
);

await authClient.auth.signOut();
ok("done. logout. sin imprimir password ni private key.");
