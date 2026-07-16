#!/usr/bin/env node
/**
 * PRUEBA EN VIVO de la transferencia ATÓMICA entre sucursales (RPC
 * transfer_stock_atomic, mig 0032).
 *
 * Crea una empresa de prueba con 2 sucursales (cada una con su almacén), un
 * producto y un lote=10 en el origen. Inicia sesión con el JWT REAL del usuario
 * (RLS aplica) y verifica:
 *   1. Transferir 3 descuenta el origen (10→7) y CREA el lote destino (=3),
 *      registra inventory_transfers + item + 2 movimientos (transfer_out/in).
 *   2. Transferir otros 3 SUMA al lote destino existente (3→6) — upsert.
 *   3. Stock insuficiente (999) FALLA y no deja nada (rollback total).
 * Al final BORRA todos los datos de prueba (no toca datos reales).
 *
 * Uso: node scripts/test/transfer-atomic-test.mjs
 * Requiere que la migración 0032 esté aplicada en el proyecto Supabase.
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

async function lotQty(lotId) {
  const { data } = await admin.from("product_lots").select("current_quantity").eq("id", lotId).single();
  return data?.current_quantity ?? null;
}
async function destLotQty(biz, prod, lotNumber, wh) {
  const { data } = await admin.from("product_lots").select("current_quantity")
    .eq("business_id", biz).eq("product_id", prod).eq("lot_number", lotNumber).eq("warehouse_id", wh).maybeSingle();
  return data?.current_quantity ?? null;
}

async function run() {
  const c = {};
  try {
    console.log("── Setup (service_role) ──");
    c.biz = (await admin.from("businesses").insert({
      legal_name: `TRFTEST ${stamp}`, commercial_name: `TRFTEST ${stamp}`,
      rnc: `TF${stamp}`, plan_id: PLAN_ID, status: "trial",
    }).select("id").single()).data.id;
    c.brOrigin = (await admin.from("branches").insert({
      business_id: c.biz, code: "ORI", name: "Origen", address: "x", city: "Santiago", province: "Santiago", country: "RD",
    }).select("id").single()).data.id;
    c.brDest = (await admin.from("branches").insert({
      business_id: c.biz, code: "DES", name: "Destino", address: "y", city: "Santiago", province: "Santiago", country: "RD",
    }).select("id").single()).data.id;
    c.whOrigin = (await admin.from("warehouses").insert({
      business_id: c.biz, branch_id: c.brOrigin, code: "WHO", name: "Almacén Origen", is_main: true,
    }).select("id").single()).data.id;
    c.whDest = (await admin.from("warehouses").insert({
      business_id: c.biz, branch_id: c.brDest, code: "WHD", name: "Almacén Destino", is_main: true,
    }).select("id").single()).data.id;
    c.prod = (await admin.from("products").insert({
      business_id: c.biz, sku: `TF-${stamp}`, name: "Producto transferible", unit: "unidad",
      requires_prescription: false, controlled: false, cost: 100, price: 200, itbis_rate: 0.18,
      min_stock: 0, max_stock: 100, active: true, sellable: true,
    }).select("id").single()).data.id;
    const lotNumber = `L-${stamp}`;
    c.lot = (await admin.from("product_lots").insert({
      business_id: c.biz, branch_id: c.brOrigin, product_id: c.prod, warehouse_id: c.whOrigin,
      lot_number: lotNumber, expires_at: "2030-12-31", initial_quantity: 10, current_quantity: 10, unit_cost: 100,
      status: "available",
    }).select("id").single()).data.id;

    const email = `trftest-${stamp}@example.com`;
    const password = `Tf!${stamp}${stamp}`;
    const au = (await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      app_metadata: { business_id: c.biz, role: "cashier", is_platform_admin: false, full_name: "Operador Test" },
    })).data.user;
    c.user = au.id;
    await admin.from("users").insert({ id: c.user, business_id: c.biz, email, full_name: "Operador Test" });

    const cU = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: loginErr } = await cU.auth.signInWithPassword({ email, password });
    if (loginErr) throw new Error(`login: ${loginErr.message}`);
    console.log(`  empresa=${c.biz.slice(0, 8)} lote origen=10`);

    const header = (num) => ({
      transfer_number: num, origin_warehouse_id: c.whOrigin,
      destination_branch_id: c.brDest, destination_warehouse_id: c.whDest,
      transfer_date: "2026-07-16", notes: "prueba", created_by_name: "Operador Test",
    });

    console.log("\n── 1. Transferir 3 (descuenta origen, crea lote destino) ──");
    const num1 = `TRF-TEST-${stamp}-1`;
    const r1 = await cU.rpc("transfer_stock_atomic", { p_header: header(num1), p_items: [{ lot_id: c.lot, qty: 3 }] });
    if (r1.error) { bad("transfer falló", r1.error.message); }
    else {
      c.tid = r1.data.id;
      (await lotQty(c.lot)) === 7 ? ok("Lote origen 10 → 7") : bad("origen no quedó en 7", String(await lotQty(c.lot)));
      (await destLotQty(c.biz, c.prod, lotNumber, c.whDest)) === 3 ? ok("Lote destino creado = 3") : bad("destino != 3", String(await destLotQty(c.biz, c.prod, lotNumber, c.whDest)));
      const { data: hdr } = await admin.from("inventory_transfers").select("id,status").eq("business_id", c.biz).eq("transfer_number", num1);
      hdr?.length === 1 && hdr[0].status === "completed" ? ok("Cabecera inventory_transfers creada") : bad("cabecera incorrecta", JSON.stringify(hdr));
      const { data: its } = await admin.from("inventory_transfer_items").select("quantity").eq("transfer_id", c.tid);
      its?.length === 1 && Number(its[0].quantity) === 3 ? ok("Ítem de transferencia = 3") : bad("ítem incorrecto", JSON.stringify(its));
      const { data: mv } = await admin.from("inventory_movements").select("type,quantity").eq("business_id", c.biz).eq("reference", num1);
      const out = mv?.find((m) => m.type === "transfer_out");
      const inn = mv?.find((m) => m.type === "transfer_in");
      out && Number(out.quantity) === -3 && inn && Number(inn.quantity) === 3
        ? ok("Movimientos transfer_out -3 / transfer_in +3") : bad("movimientos incorrectos", JSON.stringify(mv));
    }

    console.log("\n── 2. Transferir otros 3 (SUMA al lote destino existente) ──");
    const num2 = `TRF-TEST-${stamp}-2`;
    const r2 = await cU.rpc("transfer_stock_atomic", { p_header: header(num2), p_items: [{ lot_id: c.lot, qty: 3 }] });
    if (r2.error) { bad("segunda transfer falló", r2.error.message); }
    else {
      (await lotQty(c.lot)) === 4 ? ok("Lote origen 7 → 4") : bad("origen no quedó en 4", String(await lotQty(c.lot)));
      (await destLotQty(c.biz, c.prod, lotNumber, c.whDest)) === 6 ? ok("Lote destino sumado 3 → 6 (upsert)") : bad("destino != 6", String(await destLotQty(c.biz, c.prod, lotNumber, c.whDest)));
    }

    console.log("\n── 3. Stock insuficiente (999) → falla y no deja nada ──");
    const num3 = `TRF-TEST-${stamp}-3`;
    const r3 = await cU.rpc("transfer_stock_atomic", { p_header: header(num3), p_items: [{ lot_id: c.lot, qty: 999 }] });
    r3.error ? ok("transfer con 999 FALLA (como debe)") : bad("no falló con 999");
    (await lotQty(c.lot)) === 4 ? ok("Lote origen intacto tras el fallo (sigue 4)") : bad("origen cambió tras fallo", String(await lotQty(c.lot)));
    const { data: ghost } = await admin.from("inventory_transfers").select("id").eq("business_id", c.biz).eq("transfer_number", num3);
    (ghost?.length ?? 0) === 0 ? ok("NO quedó transferencia fantasma (rollback total)") : bad("quedó cabecera sin stock!", String(ghost?.length));

    console.log(`\n── Resultado: ${pass} OK, ${fail} FALLOS ──`);
  } finally {
    console.log("\n── Cleanup ──");
    if (c.biz) {
      await admin.from("inventory_movements").delete().eq("business_id", c.biz);
      await admin.from("inventory_transfer_items").delete().eq("business_id", c.biz);
      await admin.from("inventory_transfers").delete().eq("business_id", c.biz);
      await admin.from("product_lots").delete().eq("business_id", c.biz);
      await admin.from("products").delete().eq("business_id", c.biz);
      await admin.from("warehouses").delete().eq("business_id", c.biz);
      await admin.from("branches").delete().eq("business_id", c.biz);
      await admin.from("users").delete().eq("business_id", c.biz);
      if (c.user) await admin.auth.admin.deleteUser(c.user).catch(() => {});
      await admin.from("businesses").delete().eq("id", c.biz);
    }
    console.log("  datos de prueba eliminados");
  }
  process.exit(fail === 0 ? 0 : 1);
}
run().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
