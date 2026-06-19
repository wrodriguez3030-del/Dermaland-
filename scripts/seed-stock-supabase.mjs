#!/usr/bin/env node
/**
 * Siembra STOCK DEMO en Supabase: un lote por producto en la sucursal Santiago,
 * para que el POS/Inventario tengan existencias y se pueda facturar. ADITIVO e
 * IDEMPOTENTE (salta productos que ya tienen lote en esa sucursal). No borra nada.
 *
 * Uso:
 *   node scripts/seed-stock-supabase.mjs            # siembra
 *   node scripts/seed-stock-supabase.mjs --qty 50   # cantidad por lote (default 30)
 *
 * Lee apps/web/.env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(REPO_ROOT, "apps", "web", ".env.local");

const BUSINESS_ID = "00000000-0000-0000-0000-00000000d001";
const BRANCH_ID = "00000000-0000-0000-0000-00000000b001"; // DermaLand Santiago
const qtyArg = process.argv.indexOf("--qty");
const QTY = qtyArg > -1 ? Number(process.argv[qtyArg + 1]) : 30;

function die(m) { console.error(`[seed-stock] ${m}`); process.exit(1); }
function ok(m) { console.log(`[seed-stock] ${m}`); }

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || /replace|publishable/i.test(key)) die("faltan URL o SERVICE_ROLE reales (secret).");
  const require = createRequire(pathToFileURL(path.join(REPO_ROOT, "apps", "web", "package.json")));
  const { createClient } = await import(pathToFileURL(require.resolve("@supabase/supabase-js")).href);
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1) Sucursal Santiago debe existir.
  const { data: branch } = await sb.from("branches").select("id,name").eq("id", BRANCH_ID).maybeSingle();
  if (!branch) die(`la sucursal Santiago (${BRANCH_ID}) no existe — corré el bootstrap primero.`);
  ok(`sucursal: ${branch.name}`);

  // 2) Almacén interno para esa sucursal (warehouse_id es NOT NULL; queda OCULTO en la UI).
  let { data: wh } = await sb.from("warehouses")
    .select("id").eq("business_id", BUSINESS_ID).eq("branch_id", BRANCH_ID).limit(1).maybeSingle();
  if (!wh) {
    const { data: created, error } = await sb.from("warehouses")
      .insert({ business_id: BUSINESS_ID, branch_id: BRANCH_ID, code: "STG-MAIN", name: "Inventario Santiago", is_main: true })
      .select("id").single();
    if (error) die(`warehouse: ${error.message}`);
    wh = created;
    ok("almacén interno creado (oculto en UI).");
  }

  // Helper de paginación (Supabase corta en 1000 filas por request).
  async function fetchAll(table, columns, applyFilters) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      let q = sb.from(table).select(columns).range(from, from + 999);
      q = applyFilters(q);
      const { data, error } = await q;
      if (error) die(`${table}: ${error.message}`);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  // 3) Productos sin lote en esta sucursal → crear lote (TODOS, paginado).
  const products = await fetchAll("products", "id,sku,cost",
    (q) => q.eq("business_id", BUSINESS_ID).is("deleted_at", null));
  const existing = await fetchAll("product_lots", "product_id",
    (q) => q.eq("business_id", BUSINESS_ID).eq("branch_id", BRANCH_ID));
  const haveLot = new Set(existing.map((l) => l.product_id));

  const now = new Date();
  const expires = new Date(now); expires.setFullYear(now.getFullYear() + 1);
  const expiresStr = expires.toISOString().slice(0, 10);
  const receivedStr = now.toISOString().slice(0, 10);

  const toInsert = products
    .filter((p) => !haveLot.has(p.id))
    .map((p) => ({
      business_id: BUSINESS_ID, branch_id: BRANCH_ID, product_id: p.id, warehouse_id: wh.id,
      lot_number: `INIT-${p.sku}`, expires_at: expiresStr, received_at: receivedStr,
      initial_quantity: QTY, current_quantity: QTY, unit_cost: p.cost ?? 0, status: "available",
    }));

  ok(`productos: ${products.length} · ya con lote: ${haveLot.size} · a sembrar: ${toInsert.length} (qty ${QTY} c/u, vence ${expiresStr})`);
  if (toInsert.length === 0) { ok("nada que sembrar (idempotente)."); return; }

  let done = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500);
    const { error } = await sb.from("product_lots").insert(batch);
    if (error) die(`insert lotes [${i}]: ${error.message}`);
    done += batch.length;
    ok(`  ${done}/${toInsert.length} lotes…`);
  }
  ok("stock demo sembrado OK (no se borró nada).");
}

main().catch((e) => die(e.message));
