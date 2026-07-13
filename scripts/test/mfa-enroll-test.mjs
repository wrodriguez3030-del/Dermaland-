#!/usr/bin/env node
/**
 * Prueba que el proyecto Supabase permite el flujo TOTP (MFA): enrolar → challenge
 * → verify, usando un usuario de prueba y un código TOTP generado localmente desde
 * el secreto (implementación TOTP con node:crypto, sin dependencias).
 *
 * Si enroll falla con "MFA ... not enabled", hay que activar TOTP en el dashboard.
 * Autolimpiante. Uso: node scripts/test/mfa-enroll-test.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import crypto from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

const env = {};
for (const line of readFileSync(path.join(root, "apps/web/.env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(URL_, SRK, { auth: { persistSession: false } });
const stamp = Math.random().toString(36).slice(2, 8);

// ── TOTP (RFC 6238) desde un secreto base32 ──
function base32Decode(b32) {
  const alph = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of b32.replace(/=+$/, "").toUpperCase()) {
    const v = alph.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secretB32, forTime = Date.now()) {
  const key = base32Decode(secretB32);
  const counter = Math.floor(forTime / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  ✅ ${n}`); };
const bad = (n, e = "") => { fail++; console.log(`  ❌ ${n} ${e}`); };

async function run() {
  const cleanup = { user: null, biz: null };
  try {
    console.log("── Setup ──");
    cleanup.biz = (await admin.from("businesses").insert({ legal_name: `MFATEST ${stamp}`, commercial_name: `MFATEST ${stamp}`, rnc: `MF${stamp}`, plan_id: "00000000-0000-0000-0000-000000000001", status: "trial" }).select("id").single()).data.id;
    const email = `mfatest-${stamp}@example.com`, password = `Mf!${stamp}${stamp}`;
    cleanup.user = (await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { business_id: cleanup.biz, role: "admin", is_platform_admin: false } })).data.user.id;

    const c = createClient(URL_, ANON, { auth: { persistSession: true, autoRefreshToken: false } });
    if ((await c.auth.signInWithPassword({ email, password })).error) throw new Error("login falló");

    console.log("\n── Enrolar TOTP ──");
    const enroll = await c.auth.mfa.enroll({ factorType: "totp", friendlyName: `test-${stamp}` });
    if (enroll.error) { bad(`enroll falló: ${enroll.error.message}`); throw new Error("enroll"); }
    ok("mfa.enroll devuelve QR + secreto (TOTP habilitado en el proyecto)");
    const factorId = enroll.data.id;
    const secret = enroll.data.totp.secret;

    console.log("\n── Challenge + Verify con código TOTP generado ──");
    const ch = await c.auth.mfa.challenge({ factorId });
    if (ch.error) { bad(`challenge: ${ch.error.message}`); throw new Error("challenge"); }
    ok("challenge OK");
    const code = totp(secret);
    const vr = await c.auth.mfa.verify({ factorId, challengeId: ch.data.id, code });
    vr.error ? bad(`verify: ${vr.error.message}`) : ok(`verify OK con código ${code} → factor verificado (aal2)`);

    console.log("\n── Estado del factor ──");
    const { data: fl } = await c.auth.mfa.listFactors();
    (fl?.totp?.length ?? 0) > 0 ? ok("listFactors muestra el TOTP verificado") : bad("no aparece el factor");

    console.log("\n── Lógica del middleware: login solo-contraseña de usuario con factor ──");
    // Nuevo cliente (sesión fresca) → solo contraseña, SIN challenge.
    const c2 = createClient(URL_, ANON, { auth: { persistSession: true, autoRefreshToken: false } });
    if ((await c2.auth.signInWithPassword({ email, password })).error) throw new Error("re-login falló");
    const aal1 = (await c2.auth.mfa.getAuthenticatorAssuranceLevel()).data;
    aal1?.currentLevel === "aal1" && aal1?.nextLevel === "aal2"
      ? ok("Tras contraseña: currentLevel=aal1, nextLevel=aal2 → el middleware EXIGE challenge")
      : bad("AAL inesperado tras contraseña", JSON.stringify(aal1));
    // Completar el challenge desde esta sesión fresca.
    const totp2 = (await c2.auth.mfa.listFactors()).data?.totp?.find((f) => f.status === "verified");
    const ch2 = await c2.auth.mfa.challenge({ factorId: totp2.id });
    const vr2 = await c2.auth.mfa.verify({ factorId: totp2.id, challengeId: ch2.data.id, code: totp(secret) });
    const aal2 = vr2.error ? null : (await c2.auth.mfa.getAuthenticatorAssuranceLevel()).data;
    aal2?.currentLevel === "aal2"
      ? ok("Tras verificar el código: currentLevel=aal2 → el middleware deja pasar")
      : bad("no llegó a aal2", JSON.stringify(aal2 ?? vr2.error));

    console.log(`\n── Resultado: ${pass} OK, ${fail} FALLOS ──`);
  } finally {
    console.log("\n── Cleanup ──");
    if (cleanup.user) await admin.auth.admin.deleteUser(cleanup.user).catch(() => {});
    if (cleanup.biz) await admin.from("businesses").delete().eq("id", cleanup.biz);
    console.log("  datos de prueba eliminados");
  }
  process.exit(fail === 0 ? 0 : 1);
}
run().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
