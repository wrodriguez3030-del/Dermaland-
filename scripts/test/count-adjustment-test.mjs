#!/usr/bin/env node
/**
 * PRUEBA EN VIVO del ajuste de stock al APROBAR un conteo físico (B-05b).
 *
 * Crea empresa de prueba (sucursal, almacén, producto, lote=10, usuario), inicia
 * sesión con el JWT real (RLS aplica) y verifica que `apply_count_adjustments`:
 *   1. Aplica el delta negativo (faltante) al stock + movimiento count_adjustment.
 *   2. Es idempotente (aprobar de nuevo no reajusta).
 *   3. Aplica delta positivo (sobrante).
 *   4. Nunca deja el lote negativo (clamp a 0).
 * Borra todos los datos de prueba al final.
 *
 * Uso: node scripts/test/count-adjustment-test.mjs
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
const lotQty = async (id) => (await admin.from("product_lots").select("current_quantity").eq("id", id).single()).data?.current_quantity ?? null;

async function makeCount(biz, branch, wh, prod, lotId, { expected, counted, status }) {
  const cnt = (await admin.from("inventory_counts").insert({
    business_id: biz, branch_id: branch, warehouse_id: wh,
    count_number: `CNT-${stamp}-${Math.random().toString(36).slice(2, 5)}`,
    count_type: "partial", status: "submitted", assigned_to: [], started_at: new Date().toISOString(),
    scan_count: 0, item_count: 1,
  }).select("id").single()).data.id;
  // difference_quantity es GENERATED ALWAYS (counted - expected): NO se inserta.
  const iErr = (await admin.from("inventory_count_items").insert({
    business_id: biz, inventory_count_id: cnt, product_id: prod, product_sku: `AT-${stamp}`,
    product_name: "Producto conteo", product_lot_id: lotId, warehouse_id: wh,
    expected_quantity: expected, counted_quantity: counted, status,
  })).error;
  if (iErr) throw new Error(`item insert: ${iErr.message}`);
  return cnt;
}

async function run() {
  const c = {};
  try {
    console.log("── Setup ──");
    c.biz = (await admin.from("businesses").insert({ legal_name: `CNTTEST ${stamp}`, commercial_name: `CNTTEST ${stamp}`, rnc: `CT${stamp}`, plan_id: PLAN_ID, status: "trial" }).select("id").single()).data.id;
    c.branch = (await admin.from("branches").insert({ business_id: c.biz, code: "PRIN", name: "Principal", address: "x", city: "Santiago", province: "Santiago", country: "RD" }).select("id").single()).data.id;
    c.wh = (await admin.from("warehouses").insert({ business_id: c.biz, branch_id: c.branch, code: "WH1", name: "Almacén" }).select("id").single()).data.id;
    c.prod = (await admin.from("products").insert({ business_id: c.biz, sku: `AT-${stamp}`, name: "Producto conteo", unit: "unidad", requires_prescription: false, controlled: false, cost: 100, price: 200, itbis_rate: 0.18, min_stock: 0, max_stock: 100, active: true, sellable: true }).select("id").single()).data.id;
    c.lot = (await admin.from("product_lots").insert({ business_id: c.biz, branch_id: c.branch, product_id: c.prod, warehouse_id: c.wh, lot_number: `L-${stamp}`, expires_at: "2030-12-31", initial_quantity: 10, current_quantity: 10, unit_cost: 100, status: "available" }).select("id").single()).data.id;
    const email = `cnttest-${stamp}@example.com`, password = `Ct!${stamp}${stamp}`;
    c.user = (await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { business_id: c.biz, role: "admin", is_platform_admin: false, full_name: "Aprobador" } })).data.user.id;
    await admin.from("users").insert({ id: c.user, business_id: c.biz, email, full_name: "Aprobador" });
    const cU = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    if ((await cU.auth.signInWithPassword({ email, password })).error) throw new Error("login falló");
    console.log(`  empresa=${c.biz.slice(0,8)} lote=10`);

    console.log("\n── 1. Faltante: contado 7 vs esperado 10 (delta -3) ──");
    const A = await makeCount(c.biz, c.branch, c.wh, c.prod, c.lot, { expected: 10, counted: 7, status: "shortage" });
    const r1 = await cU.rpc("apply_count_adjustments", { p_count_id: A });
    r1.data?.adjusted === 1 ? ok("Aprobación aplicó 1 ajuste") : bad("no ajustó", JSON.stringify(r1.data ?? r1.error));
    (await lotQty(c.lot)) === 7 ? ok("Stock 10 → 7 (delta -3)") : bad("stock no bajó a 7", String(await lotQty(c.lot)));
    const { data: m1 } = await admin.from("inventory_movements").select("quantity,type").eq("business_id", c.biz).eq("type", "count_adjustment");
    m1?.length === 1 && m1[0].quantity === -3 ? ok("Movimiento count_adjustment -3") : bad("movimiento incorrecto", JSON.stringify(m1));
    const { data: st } = await admin.from("inventory_counts").select("status").eq("id", A).single();
    st?.status === "approved" ? ok("Conteo quedó approved") : bad("estado incorrecto", st?.status);

    console.log("\n── 2. Idempotencia (re-aprobar no reajusta) ──");
    const r2 = await cU.rpc("apply_count_adjustments", { p_count_id: A });
    r2.data?.already === true && r2.data?.adjusted === 0 ? ok("Re-aprobación no hace nada") : bad("reajustó", JSON.stringify(r2.data ?? r2.error));
    (await lotQty(c.lot)) === 7 ? ok("Stock sigue en 7") : bad("cambió", String(await lotQty(c.lot)));

    console.log("\n── 3. Sobrante: contado 12 vs esperado 7 (delta +5) ──");
    const B = await makeCount(c.biz, c.branch, c.wh, c.prod, c.lot, { expected: 7, counted: 12, status: "overage" });
    await cU.rpc("apply_count_adjustments", { p_count_id: B });
    (await lotQty(c.lot)) === 12 ? ok("Stock 7 → 12 (delta +5)") : bad("no subió a 12", String(await lotQty(c.lot)));

    console.log("\n── 4. Clamp a 0: delta -20 (esperado 20/contado 0) sobre stock 12 no deja negativo ──");
    const C = await makeCount(c.biz, c.branch, c.wh, c.prod, c.lot, { expected: 20, counted: 0, status: "shortage" });
    await cU.rpc("apply_count_adjustments", { p_count_id: C });
    (await lotQty(c.lot)) === 0 ? ok("Stock clampado a 0 (no negativo)") : bad("no clampó a 0", String(await lotQty(c.lot)));
    const { data: mc } = await admin.from("inventory_movements").select("quantity").eq("business_id", c.biz).eq("type", "count_adjustment").order("created_at", { ascending: false }).limit(1);
    mc?.[0]?.quantity === -12 ? ok("Movimiento registra el delta REAL aplicado (-12)") : bad("delta real incorrecto", JSON.stringify(mc));

    console.log(`\n── Resultado: ${pass} OK, ${fail} FALLOS ──`);
  } finally {
    console.log("\n── Cleanup ──");
    if (c.biz) {
      for (const t of ["inventory_movements", "inventory_count_items", "inventory_counts", "proforma_payments", "proforma_items", "proformas", "product_lots", "products", "warehouses", "branches", "users"]) {
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
