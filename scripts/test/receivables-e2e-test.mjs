#!/usr/bin/env node
/**
 * E2E vivo de Cuentas por Cobrar contra PROD (autolimpiante):
 *  1. Emite una venta A CRÉDITO (sin pago inicial) vía POST /api/proformas.
 *  2. Verifica que aparece en /api/receivables con due_date y bucket.
 *  3. Cobro PARCIAL vía /api/receivables/collect → status partially_paid.
 *  4. Cobro del RESTO → balance 0, status paid.
 *  5. Verifica historial (saldo anterior/nuevo por pago).
 *  6. Limpia la venta de prueba (pagos + venta) con service_role.
 *
 * Uso: node scripts/test/receivables-e2e-test.mjs [--base https://dermaland.vercel.app]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "https://dermaland.vercel.app";

const env = {};
for (const line of readFileSync(path.join(root, "apps/web/.env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

let passed = 0;
const ok = (msg) => { passed += 1; console.log(`  ✓ ${msg}`); };
const fail = (msg) => { console.error(`  ✗ ${msg}`); process.exitCode = 1; };
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const { data: auth, error: loginErr } = await anon.auth.signInWithPassword({
  email: env.PREVIEW_ADMIN_EMAIL,
  password: env.PREVIEW_ADMIN_PASSWORD,
});
if (loginErr) { console.error("login falló:", loginErr.message); process.exit(1); }

const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const raw = "base64-" + Buffer.from(JSON.stringify(auth.session)).toString("base64url");
const CHUNK = 3180;
const cookies = [];
if (raw.length <= CHUNK) cookies.push(`sb-${ref}-auth-token=${raw}`);
else for (let i = 0; i * CHUNK < raw.length; i++) cookies.push(`sb-${ref}-auth-token.${i}=${raw.slice(i * CHUNK, (i + 1) * CHUNK)}`);
const HEADERS = { Cookie: cookies.join("; "), "Content-Type": "application/json" };

const api = async (p, init) => {
  const res = await fetch(`${BASE}${p}`, { ...init, headers: { ...HEADERS, ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
};

// Cliente real para la venta de prueba.
const BIZ = "00000000-0000-0000-0000-00000000d001";
const { data: clients } = await admin.from("clients").select("id, first_name, last_name").eq("business_id", BIZ).is("deleted_at", null).limit(1);
const client = clients?.[0];
if (!client) { console.error("No hay clientes."); process.exit(1); }
const clientName = `${client.first_name} ${client.last_name}`.trim();

let saleId = null;
try {
  console.log(`E2E Cuentas por Cobrar contra ${BASE}`);

  // 1) Venta a crédito (sin pago inicial).
  const create = await api("/api/proformas", {
    method: "POST",
    body: JSON.stringify({
      customerId: client.id,
      customerName: clientName,
      cashierId: "e2e",
      cashierName: "e2e",
      branchId: "",
      items: [{
        productId: "",
        productSku: "E2E-CXC",
        productName: "PRUEBA E2E CxC (borrar)",
        quantity: 1,
        unitPrice: 500,
        itbisRate: 0.18,
        discount: 0,
        subtotal: 500,
        itbis: 90,
        total: 590,
      }],
      subtotal: 500, discount: 0, itbis: 90, total: 590,
      status: "issued",
      payments: [],
      paid: 0,
      balance: 590,
      notes: "E2E CxC — venta de prueba autolimpiante",
    }),
  });
  assert(create.status === 201 || create.status === 200, `venta a crédito emitida (HTTP ${create.status})`);
  const sale = create.json.proforma ?? create.json;
  saleId = sale?.id ?? null;
  assert(!!saleId, "la venta tiene id");
  // El SERVER recalcula los montos (SEC-002, precio con ITBIS incluido): el
  // balance de referencia sale de la respuesta, no se asume.
  const totalReal = Number(sale?.balance);
  assert(totalReal > 0 && Number(sale?.paid) === 0, `balance recomputado > 0 y paid = 0 (balance: ${totalReal})`);
  assert(sale?.status === "issued", `status issued sin pago inicial (real: ${sale?.status})`);
  assert(typeof sale?.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sale.dueDate), `due_date fijada por el server (${sale?.dueDate})`);

  // 2) Aparece en pendientes.
  const pending = await api("/api/receivables");
  const row = (pending.json.rows ?? []).find((r) => r.id === saleId);
  assert(!!row, "aparece en /api/receivables");
  assert(row?.bucket === "al_dia" || row?.bucket === "por_vencer", `bucket inicial sano (${row?.bucket})`);
  assert(row?.customerName === clientName, "cliente correcto en la fila");

  // 3) Cobro parcial (200 del total real).
  const PARCIAL = 200;
  const resto = Math.round((totalReal - PARCIAL) * 100) / 100;
  const partial = await api("/api/receivables/collect", {
    method: "POST",
    body: JSON.stringify({
      items: [{ proformaId: saleId, amount: PARCIAL }],
      method: "cash",
      reference: "E2E parcial",
    }),
  });
  assert(partial.status === 201, `cobro parcial aceptado (HTTP ${partial.status}: ${partial.json?.error ?? "ok"})`);
  const ap = partial.json.result?.applied?.[0];
  assert(Number(ap?.new_balance) === resto, `saldo tras parcial = ${resto} (real: ${ap?.new_balance})`);
  assert(ap?.new_status === "partially_paid", `status partially_paid (real: ${ap?.new_status})`);

  // 3b) Sobrepago rechazado.
  const over = await api("/api/receivables/collect", {
    method: "POST",
    body: JSON.stringify({ items: [{ proformaId: saleId, amount: 9999 }], method: "cash" }),
  });
  assert(over.status === 400, `sobrepago rechazado (HTTP ${over.status})`);

  // 4) Cobro del resto.
  const rest = await api("/api/receivables/collect", {
    method: "POST",
    body: JSON.stringify({
      items: [{ proformaId: saleId, amount: resto }],
      method: "transfer",
      reference: "E2E final",
      bank: "Banco Prueba",
    }),
  });
  const ap2 = rest.json.result?.applied?.[0];
  assert(rest.status === 201, `cobro final aceptado (HTTP ${rest.status}: ${rest.json?.error ?? "ok"})`);
  assert(Number(ap2?.new_balance) === 0, `saldo final = 0 (real: ${ap2?.new_balance})`);
  assert(ap2?.new_status === "paid", `status final paid (real: ${ap2?.new_status})`);

  // 5) Historial con saldo anterior/nuevo.
  const hist = await api("/api/receivables/history");
  const mine = (hist.json.rows ?? []).filter((h) => h.proformaId === saleId);
  assert(mine.length === 2, `2 cobros en historial (real: ${mine.length})`);
  const first = mine.find((h) => h.amount === PARCIAL);
  const second = mine.find((h) => h.amount === resto);
  assert(
    first?.balanceBefore === totalReal && first?.balanceAfter === resto,
    `parcial: ${totalReal} → ${resto} (real: ${first?.balanceBefore} → ${first?.balanceAfter})`,
  );
  assert(
    second?.balanceBefore === resto && second?.balanceAfter === 0,
    `final: ${resto} → 0 (real: ${second?.balanceBefore} → ${second?.balanceAfter})`,
  );

  // 6) Ya no está en pendientes.
  const pending2 = await api("/api/receivables");
  assert(!(pending2.json.rows ?? []).some((r) => r.id === saleId), "salió de pendientes al saldarse");
} finally {
  if (saleId) {
    await admin.from("proforma_payments").delete().eq("business_id", BIZ).eq("proforma_id", saleId);
    await admin.from("proforma_items").delete().eq("business_id", BIZ).eq("proforma_id", saleId);
    await admin.from("proformas").delete().eq("business_id", BIZ).eq("id", saleId);
    console.log("  (limpieza: venta de prueba eliminada)");
  }
  await anon.auth.signOut();
}

console.log(process.exitCode ? `\nFALLÓ (pasaron ${passed})` : `\nTODO OK — ${passed} checks`);
