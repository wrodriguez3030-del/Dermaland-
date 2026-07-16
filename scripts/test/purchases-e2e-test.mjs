#!/usr/bin/env node
/**
 * PRUEBA EN VIVO del módulo Compras (tablas mig 0012) contra prod.
 *
 * Verifica que, con el JWT REAL de un usuario (RLS aplica), se pueda operar el
 * módulo de Compras sobre las tablas recién creadas, y que el aislamiento entre
 * negocios (RLS) funcione:
 *   1. CRUD básico como user1: supplier, supplier_invoice + item, expense,
 *      recurring_expense + run → persisten y son legibles.
 *   2. Aislamiento: user2 (otro negocio) NO ve las filas de user1.
 *   3. RLS de escritura: user2 NO puede insertar con business_id ajeno.
 * Al final BORRA todos los datos de prueba (no toca datos reales).
 *
 * Uso: node scripts/test/purchases-e2e-test.mjs
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
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SRK) { console.error("Faltan env vars en apps/web/.env.local"); process.exit(1); }

const PLAN_ID = "00000000-0000-0000-0000-000000000001";
const admin = createClient(URL_, SRK, { auth: { persistSession: false } });
const stamp = Math.random().toString(36).slice(2, 8);

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  ✅ ${n}`); };
const bad = (n, extra = "") => { fail++; console.log(`  ❌ ${n} ${extra}`); };

async function makeBusiness(tag) {
  const biz = (await admin.from("businesses").insert({
    legal_name: `PURTEST ${tag} ${stamp}`, commercial_name: `PURTEST ${tag} ${stamp}`,
    rnc: `PU${tag}${stamp}`, plan_id: PLAN_ID, status: "trial",
  }).select("id").single()).data.id;
  const branch = (await admin.from("branches").insert({
    business_id: biz, code: "PRIN", name: "Principal", address: "x", city: "Santiago", province: "Santiago", country: "RD",
  }).select("id").single()).data.id;
  const email = `purtest-${tag}-${stamp}@example.com`;
  const password = `Pu!${tag}${stamp}${stamp}`;
  const au = (await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    app_metadata: { business_id: biz, role: "admin", is_platform_admin: false, full_name: `User ${tag}` },
  })).data.user;
  await admin.from("users").insert({ id: au.id, business_id: biz, email, full_name: `User ${tag}` });
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${tag}: ${error.message}`);
  return { biz, branch, userId: au.id, client };
}

async function run() {
  const A = {}, B = {};
  try {
    console.log("── Setup (service_role): 2 negocios con usuario ──");
    Object.assign(A, await makeBusiness("A"));
    Object.assign(B, await makeBusiness("B"));
    console.log(`  A=${A.biz.slice(0, 8)}  B=${B.biz.slice(0, 8)}`);

    console.log("\n── 1. CRUD de Compras como user A (JWT, RLS) ──");
    const sup = await A.client.from("suppliers").insert({
      business_id: A.biz, name: `Proveedor ${stamp}`, rnc: "101010101",
    }).select("id").single();
    sup.error ? bad("insert supplier", sup.error.message) : ok("Proveedor creado");

    const inv = await A.client.from("supplier_invoices").insert({
      business_id: A.biz, branch_id: A.branch, supplier_id: sup.data?.id,
      supplier_name: `Proveedor ${stamp}`, number: `F-${stamp}`, issue_date: "2026-07-16",
      subtotal: 100, itbis: 18, total: 118, status: "pendiente", created_by: A.userId,
    }).select("id").single();
    inv.error ? bad("insert supplier_invoice", inv.error.message) : ok("Factura de compra creada");

    if (inv.data?.id) {
      const it = await A.client.from("supplier_invoice_items").insert({
        business_id: A.biz, invoice_id: inv.data.id, name: "Insumo X",
        quantity: 5, unit_cost: 20, itbis: 18, total: 118,
      }).select("id").single();
      it.error ? bad("insert supplier_invoice_item", it.error.message) : ok("Ítem de factura creado");
    }

    const exp = await A.client.from("expenses").insert({
      business_id: A.biz, branch_id: A.branch, expense_date: "2026-07-16",
      category: "Servicios", concept: "Luz", amount: 500, method: "efectivo",
      status: "pagado", created_by: A.userId,
    }).select("id").single();
    exp.error ? bad("insert expense", exp.error.message) : ok("Gasto creado");

    const rec = await A.client.from("recurring_expenses").insert({
      business_id: A.biz, name: "Alquiler", category: "Renta", amount: 15000,
      frequency: "mensual", start_date: "2026-07-01", method: "transferencia",
      status: "active", created_by: A.userId,
    }).select("id").single();
    rec.error ? bad("insert recurring_expense", rec.error.message) : ok("Gasto recurrente creado");
    if (rec.data?.id) {
      const rrun = await A.client.from("recurring_expense_runs").insert({
        business_id: A.biz, recurring_id: rec.data.id, run_date: "2026-07-01", amount: 15000,
      }).select("id").single();
      rrun.error ? bad("insert recurring_expense_run", rrun.error.message) : ok("Corrida de recurrente creada");
    }

    console.log("\n── 2. Lectura como user A ──");
    const readInv = await A.client.from("supplier_invoices").select("id").eq("business_id", A.biz);
    (readInv.data?.length ?? 0) >= 1 ? ok("A lee sus facturas de compra") : bad("A no lee sus facturas", JSON.stringify(readInv.error));

    console.log("\n── 3. Aislamiento RLS entre negocios ──");
    const bSees = await B.client.from("supplier_invoices").select("id").eq("business_id", A.biz);
    (bSees.data?.length ?? 0) === 0 ? ok("B NO ve las facturas de A (RLS lectura)") : bad("B vio facturas de A!", String(bSees.data?.length));
    const bExp = await B.client.from("expenses").select("id");
    (bExp.data?.length ?? 0) === 0 ? ok("B NO ve gastos de A (RLS lectura)") : bad("B vio gastos de A!", String(bExp.data?.length));

    console.log("\n── 4. RLS de escritura (with check) ──");
    const inject = await B.client.from("suppliers").insert({
      business_id: A.biz, name: `Inyectado ${stamp}`,
    }).select("id");
    inject.error ? ok("B NO puede insertar proveedor con business_id de A (RLS bloquea)") : bad("B inyectó en A!", JSON.stringify(inject.data));

    console.log(`\n── Resultado: ${pass} OK, ${fail} FALLOS ──`);
  } finally {
    console.log("\n── Cleanup ──");
    for (const c of [A, B]) {
      if (!c.biz) continue;
      await admin.from("recurring_expense_runs").delete().eq("business_id", c.biz);
      await admin.from("recurring_expenses").delete().eq("business_id", c.biz);
      await admin.from("expenses").delete().eq("business_id", c.biz);
      await admin.from("supplier_invoice_items").delete().eq("business_id", c.biz);
      await admin.from("supplier_invoices").delete().eq("business_id", c.biz);
      await admin.from("suppliers").delete().eq("business_id", c.biz);
      await admin.from("users").delete().eq("business_id", c.biz);
      if (c.userId) await admin.auth.admin.deleteUser(c.userId).catch(() => {});
      await admin.from("branches").delete().eq("business_id", c.biz);
      await admin.from("businesses").delete().eq("id", c.biz);
    }
    console.log("  datos de prueba eliminados");
  }
  process.exit(fail === 0 ? 0 : 1);
}
run().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
