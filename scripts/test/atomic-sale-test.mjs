#!/usr/bin/env node
/**
 * PRUEBA EN VIVO de emisión/anulación ATÓMICAS (B-02 / B-03).
 *
 * Crea una empresa de prueba (con sucursal, almacén, producto, lote=10 y usuario),
 * inicia sesión con el JWT REAL del usuario (RLS aplica) y verifica:
 *   1. emit_sale_atomic descuenta stock + crea venta/ítems/pagos/movimiento en 1 txn.
 *   2. Idempotencia: reenviar la misma clave NO duplica ni vuelve a descontar.
 *   3. Atomicidad: si un lote no alcanza, la venta COMPLETA se revierte (no queda nada).
 *   4. void_sale_atomic reingresa el stock exacto y es idempotente (no reingresa 2 veces).
 * Al final BORRA todos los datos de prueba (no toca datos reales).
 *
 * Uso: node scripts/test/atomic-sale-test.mjs
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
if (!URL_ || !ANON || !SRK) { console.error("Faltan env vars"); process.exit(1); }

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

async function run() {
  const c = {};
  try {
    console.log("── Setup (service_role) ──");
    c.biz = (await admin.from("businesses").insert({
      legal_name: `ATOMTEST ${stamp}`, commercial_name: `ATOMTEST ${stamp}`,
      rnc: `AT${stamp}`, plan_id: PLAN_ID, status: "trial",
    }).select("id").single()).data.id;
    c.branch = (await admin.from("branches").insert({
      business_id: c.biz, code: "PRIN", name: "Principal", address: "x", city: "Santiago", province: "Santiago", country: "RD",
    }).select("id").single()).data.id;
    c.wh = (await admin.from("warehouses").insert({
      business_id: c.biz, branch_id: c.branch, code: "WH1", name: "Almacén 1",
    }).select("id").single()).data.id;
    c.prod = (await admin.from("products").insert({
      business_id: c.biz, sku: `AT-${stamp}`, name: "Producto atómico", unit: "unidad",
      requires_prescription: false, controlled: false, cost: 100, price: 200, itbis_rate: 0.18,
      min_stock: 0, max_stock: 100, active: true, sellable: true,
    }).select("id").single()).data.id;
    c.lot = (await admin.from("product_lots").insert({
      business_id: c.biz, branch_id: c.branch, product_id: c.prod, warehouse_id: c.wh,
      lot_number: `L-${stamp}`, expires_at: "2030-12-31", initial_quantity: 10, current_quantity: 10, unit_cost: 100,
      status: "available",
    }).select("id").single()).data.id;

    const email = `atomtest-${stamp}@example.com`;
    const password = `At!${stamp}${stamp}`;
    const au = (await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      app_metadata: { business_id: c.biz, role: "cashier", is_platform_admin: false, full_name: "Cajero Test" },
    })).data.user;
    c.user = au.id;
    // public.users con id = auth id (los FK de cashier_id/user_id apuntan a public.users).
    await admin.from("users").insert({ id: c.user, business_id: c.biz, email, full_name: "Cajero Test" });

    const cU = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: loginErr } = await cU.auth.signInWithPassword({ email, password });
    if (loginErr) throw new Error(`login: ${loginErr.message}`);
    console.log(`  empresa=${c.biz.slice(0,8)} lote=10`);

    const idem1 = `idem-${stamp}-1`;
    const saleBase = {
      business_id: c.biz, branch_id: c.branch, number: `TEST-${stamp}-1`,
      customer_name: "Cliente Test", cashier_id: c.user, cashier_name: "Cajero Test",
      status: "paid", total: 236, paid: 236, balance: 0, itbis: 36, subtotal: 200,
      document_kind: "invoice", idempotency_key: idem1,
    };
    const items = [{ line_no: 1, product_id: c.prod, product_sku: `AT-${stamp}`, product_name: "Producto atómico",
      product_lot_id: c.lot, lot_number: `L-${stamp}`, quantity: 3, unit_price: 200, itbis_rate: 0.18,
      discount: 0, subtotal: 600, itbis: 108, total: 708, kind: "bien" }];
    const payments = [{ method_code: "cash", amount: 236, user_id: c.user, user_name: "Cajero Test" }];
    const decr = [{ lot_id: c.lot, qty: 3, reason: `Venta TEST-${stamp}-1` }];

    console.log("\n── 1. Emisión atómica (venta + descuento) ──");
    const r1 = await cU.rpc("emit_sale_atomic", { p_sale: saleBase, p_items: items, p_payments: payments, p_decrements: decr });
    if (r1.error) { bad("emit falló", r1.error.message); }
    else {
      const pid = r1.data.id;
      c.pid = pid;
      (await lotQty(c.lot)) === 7 ? ok("Lote descontado 10 → 7") : bad("Lote no quedó en 7", String(await lotQty(c.lot)));
      const { data: mv } = await admin.from("inventory_movements").select("quantity,type").eq("proforma_id", pid);
      mv?.length === 1 && mv[0].type === "exit_sale" && mv[0].quantity === -3
        ? ok("Movimiento exit_sale -3 enlazado a la venta") : bad("Movimiento incorrecto", JSON.stringify(mv));
      const { data: it } = await admin.from("proforma_items").select("id").eq("proforma_id", pid);
      it?.length === 1 ? ok("Ítem persistido") : bad("Ítems incorrectos", String(it?.length));
      const { data: py } = await admin.from("proforma_payments").select("id").eq("proforma_id", pid);
      py?.length === 1 ? ok("Pago persistido") : bad("Pagos incorrectos", String(py?.length));
    }

    console.log("\n── 2. Idempotencia (misma clave no duplica ni redescuenta) ──");
    const r2 = await cU.rpc("emit_sale_atomic", { p_sale: saleBase, p_items: items, p_payments: payments, p_decrements: decr });
    r2.data?.reused === true && r2.data?.id === c.pid ? ok("Reenvío devuelve la MISMA venta (reused)") : bad("No dedupó", JSON.stringify(r2.data ?? r2.error));
    (await lotQty(c.lot)) === 7 ? ok("Lote NO se descontó de nuevo (sigue 7)") : bad("Redescontó", String(await lotQty(c.lot)));

    console.log("\n── 3. Atomicidad: stock insuficiente revierte TODA la venta ──");
    const idem2 = `idem-${stamp}-2`;
    const r3 = await cU.rpc("emit_sale_atomic", {
      p_sale: { ...saleBase, number: `TEST-${stamp}-2`, idempotency_key: idem2 },
      p_items: items, p_payments: payments, p_decrements: [{ lot_id: c.lot, qty: 999, reason: "sobreventa" }],
    });
    r3.error ? ok("emit con stock insuficiente FALLA (como debe)") : bad("no falló con 999");
    const { data: ghost } = await admin.from("proformas").select("id").eq("business_id", c.biz).eq("idempotency_key", idem2);
    (ghost?.length ?? 0) === 0 ? ok("NO quedó venta fantasma (rollback total)") : bad("quedó venta sin stock!", String(ghost?.length));
    (await lotQty(c.lot)) === 7 ? ok("Lote intacto tras el fallo (sigue 7)") : bad("lote cambió tras fallo", String(await lotQty(c.lot)));

    console.log("\n── 4. Anulación atómica con reingreso de stock ──");
    const v1 = await cU.rpc("void_sale_atomic", { p_proforma_id: c.pid, p_reason: "anulación test" });
    v1.data?.restored === 1 ? ok("Anulación reingresó 1 lote") : bad("no reingresó", JSON.stringify(v1.data ?? v1.error));
    (await lotQty(c.lot)) === 10 ? ok("Stock restaurado 7 → 10") : bad("no restauró a 10", String(await lotQty(c.lot)));
    const { data: rin } = await admin.from("inventory_movements").select("quantity,type").eq("proforma_id", c.pid).eq("type", "return_in");
    rin?.length === 1 && rin[0].quantity === 3 ? ok("Movimiento return_in +3 registrado") : bad("return_in incorrecto", JSON.stringify(rin));

    console.log("\n── 5. Anulación idempotente (no reingresa dos veces) ──");
    const v2 = await cU.rpc("void_sale_atomic", { p_proforma_id: c.pid, p_reason: "otra vez" });
    v2.data?.already_cancelled === true && v2.data?.restored === 0 ? ok("Segunda anulación no hace nada (idempotente)") : bad("re-anuló", JSON.stringify(v2.data ?? v2.error));
    (await lotQty(c.lot)) === 10 ? ok("Stock sigue en 10 (no doble reingreso)") : bad("doble reingreso!", String(await lotQty(c.lot)));

    console.log(`\n── Resultado: ${pass} OK, ${fail} FALLOS ──`);
  } finally {
    console.log("\n── Cleanup ──");
    if (c.biz) {
      await admin.from("inventory_movements").delete().eq("business_id", c.biz);
      await admin.from("proforma_payments").delete().eq("business_id", c.biz);
      await admin.from("proforma_items").delete().eq("business_id", c.biz);
      await admin.from("proformas").delete().eq("business_id", c.biz);
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
