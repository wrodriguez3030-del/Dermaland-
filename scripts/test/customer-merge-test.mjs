#!/usr/bin/env node
/**
 * PRUEBA EN VIVO de `merge_clients`.
 *
 * Crea empresa de prueba, 2 clientes (primario+duplicado) con datos que se
 * complementan (uno tiene teléfono, el otro email), una `ar_promises`, una
 * `alegra_invoices` y un `client_auth_links` colgando del DUPLICADO, y
 * verifica que `merge_clients`:
 *   1. Reasigna ambas filas al primario.
 *   2. Rellena en el primario el campo que le faltaba (coalesce, sin pisar).
 *   3. Deja el duplicado con `deleted_at` (no lo borra físicamente).
 *   4. El dry-run (conteo directo, sin RPC) cuenta lo mismo ANTES de fusionar.
 *   5. Fusionar dos veces el mismo par en la 2ª tira P0002 (ya no existe activo).
 *   6. Unificar un cliente consigo mismo tira P0003.
 * Borra todos los datos de prueba al final.
 *
 * Uso: node scripts/test/customer-merge-test.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

const env = {};
for (const line of readFileSync(path.join(root, "apps/web/.env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRK = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SRK) { console.error("Faltan env vars"); process.exit(1); }

const PLAN_ID = "00000000-0000-0000-0000-000000000001";
const admin = createClient(URL_, SRK, { auth: { persistSession: false } });
const stamp = Math.random().toString(36).slice(2, 8);
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  ✅ ${n}`); };
const bad = (n, extra = "") => { fail++; console.log(`  ❌ ${n} ${extra}`); };

async function run() {
  const c = {};
  try {
    console.log("── Setup ──");
    c.biz = (await admin.from("businesses").insert({ legal_name: `ZZTMERGE ${stamp}`, commercial_name: `ZZTMERGE ${stamp}`, rnc: `ZM${stamp}`, plan_id: PLAN_ID, status: "trial" }).select("id").single()).data.id;
    c.primary = (await admin.from("clients").insert({ business_id: c.biz, customer_number: `CLI-${stamp}-1`, first_name: "ZZT", last_name: "Primario", phone: "8095550001", source: "manual", default_billing_type: "consumo", skin_type: "not_specified" }).select("id").single()).data.id;
    c.dup = (await admin.from("clients").insert({ business_id: c.biz, customer_number: `CLI-${stamp}-2`, first_name: "ZZT", last_name: "Duplicado", email: "zzt-dup@example.com", source: "manual", default_billing_type: "consumo", skin_type: "not_specified" }).select("id").single()).data.id;
    await admin.from("ar_promises").insert({ business_id: c.biz, client_id: c.dup, client_name: "ZZT Duplicado", promised_date: "2026-12-31", amount: 100 });
    await admin.from("alegra_invoices").insert({ business_id: c.biz, alegra_id: `ZZT-${stamp}`, client_id: c.dup, date: "2026-01-01", status: "open" });
    const email = `zztmerge-${stamp}@example.com`, password = `Zm!${stamp}${stamp}`;
    c.user = (await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { business_id: c.biz, role: "admin", is_platform_admin: false, full_name: "Admin ZZT" } })).data.user.id;
    await admin.from("users").insert({ id: c.user, business_id: c.biz, email, full_name: "Admin ZZT" });
    await admin.from("client_auth_links").insert({ auth_user_id: c.user, client_id: c.dup, business_id: c.biz });
    const cU = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    if ((await cU.auth.signInWithPassword({ email, password })).error) throw new Error("login falló");
    console.log(`  empresa=${c.biz.slice(0, 8)} primario=${c.primary.slice(0, 8)} duplicado=${c.dup.slice(0, 8)}`);

    console.log("\n── 1. Dry-run cuenta ANTES de escribir ──");
    const antesAr = (await admin.from("ar_promises").select("id", { count: "exact", head: true }).eq("client_id", c.dup).eq("business_id", c.biz)).count;
    antesAr === 1 ? ok("ar_promises del duplicado = 1 antes de fusionar") : bad("conteo inicial incorrecto", String(antesAr));

    console.log("\n── 2. Fusionar consigo mismo → P0003 ──");
    const rSelf = await cU.rpc("merge_clients", { p_primary_id: c.primary, p_duplicate_id: c.primary });
    rSelf.error?.code === "P0003" ? ok("rechaza fusionar un cliente consigo mismo") : bad("no rechazó", JSON.stringify(rSelf));

    console.log("\n── 3. Fusión real ──");
    const r1 = await cU.rpc("merge_clients", { p_primary_id: c.primary, p_duplicate_id: c.dup });
    r1.error ? bad("RPC falló", r1.error.message) : ok("RPC merge_clients OK");
    r1.data?.moved?.ar_promises === 1 ? ok("moved.ar_promises = 1") : bad("moved incorrecto", JSON.stringify(r1.data));
    r1.data?.moved?.alegra_invoices === 1 ? ok("moved.alegra_invoices = 1") : bad("moved incorrecto", JSON.stringify(r1.data));

    const ap = (await admin.from("ar_promises").select("client_id").eq("business_id", c.biz).single()).data;
    ap?.client_id === c.primary ? ok("ar_promises reasignada al primario") : bad("no se reasignó", JSON.stringify(ap));

    const ai = (await admin.from("alegra_invoices").select("client_id").eq("business_id", c.biz).single()).data;
    ai?.client_id === c.primary ? ok("alegra_invoices reasignada al primario") : bad("no se reasignó", JSON.stringify(ai));

    const cal = (await admin.from("client_auth_links").select("client_id").eq("auth_user_id", c.user).single()).data;
    cal?.client_id === c.primary ? ok("client_auth_links reasignado al primario") : bad("no se reasignó", JSON.stringify(cal));

    const primarioFinal = (await admin.from("clients").select("email,phone,deleted_at").eq("id", c.primary).single()).data;
    primarioFinal?.email === "zzt-dup@example.com" ? ok("email relleno desde el duplicado (coalesce)") : bad("no rellenó email", JSON.stringify(primarioFinal));
    primarioFinal?.phone === "8095550001" ? ok("teléfono del primario NO se sobreescribió") : bad("sobreescribió un dato que ya tenía", JSON.stringify(primarioFinal));

    const dupFinal = (await admin.from("clients").select("deleted_at").eq("id", c.dup).single()).data;
    dupFinal?.deleted_at ? ok("duplicado con soft-delete (deleted_at set)") : bad("no quedó soft-deleted", JSON.stringify(dupFinal));

    console.log("\n── 4. Repetir la misma fusión → P0002 (duplicado ya no está activo) ──");
    const r2 = await cU.rpc("merge_clients", { p_primary_id: c.primary, p_duplicate_id: c.dup });
    r2.error?.code === "P0002" ? ok("2ª fusión del mismo par rechazada (P0002)") : bad("no rechazó", JSON.stringify(r2));

    console.log(`\n── Resultado: ${pass} OK, ${fail} FALLOS ──`);
  } finally {
    console.log("\n── Cleanup ──");
    if (c.biz) {
      for (const t of ["client_auth_links", "ar_promises", "alegra_invoices", "clients", "users"]) {
        await admin.from(t).delete().eq("business_id", c.biz);
      }
      if (c.user) await admin.auth.admin.deleteUser(c.user).catch(() => {});
      await admin.from("businesses").delete().eq("id", c.biz);
    }
    console.log("  datos de prueba eliminados");
  }
  process.exit(fail === 0 ? 0 : 1);
}
run().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
