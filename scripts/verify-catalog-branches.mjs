#!/usr/bin/env node
/**
 * Verificación READ-ONLY del estado de sucursales/lotes/movimientos en Supabase.
 *
 * NO escribe, NO borra, NO modifica nada. Solo SELECT con service_role para
 * responder: ¿cuántas sucursales hay?, ¿cuáles activas/inactivas/eliminadas?,
 * ¿existe "DermaLand Naco" y en qué estado?, ¿los lotes/movimientos tienen
 * branch_id?, ¿qué warehouses hay? Útil para decidir un backfill no destructivo.
 *
 * Uso:
 *   node scripts/verify-catalog-branches.mjs
 *
 * Lee apps/web/.env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * NUNCA imprime la service_role key.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(REPO_ROOT, "apps", "web", ".env.local");

function die(m) { console.error(`[verify] ${m}`); process.exit(1); }
function ok(m) { console.log(`[verify] ${m}`); }

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) die(`no encontré ${ENV_PATH}`);
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
  if (!url || !key || /replace/i.test(key)) {
    die("faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY reales (key sigue placeholder).");
  }
  const require = createRequire(pathToFileURL(path.join(REPO_ROOT, "apps", "web", "package.json")));
  const { createClient } = await import(pathToFileURL(require.resolve("@supabase/supabase-js")).href);
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1) Sucursales
  const { data: branches, error: be } = await sb
    .from("branches")
    .select("id, business_id, code, name, status, deleted_at")
    .order("name");
  if (be) die(`branches: ${be.message}`);
  const active = branches.filter((b) => b.status === "active" && !b.deleted_at);
  const inactive = branches.filter((b) => b.status !== "active" && !b.deleted_at);
  const deleted = branches.filter((b) => b.deleted_at);
  ok(`branches total: ${branches.length} · activas: ${active.length} · inactivas: ${inactive.length} · soft-deleted: ${deleted.length}`);
  for (const b of branches) {
    ok(`  - ${b.name} [${b.code}] status=${b.status}${b.deleted_at ? " DELETED" : ""} (id ${b.id})`);
  }
  const naco = branches.filter((b) => /naco/i.test(b.name));
  if (naco.length === 0) ok('"DermaLand Naco": NO existe en Supabase.');
  else for (const n of naco) ok(`"DermaLand Naco": existe · status=${n.status}${n.deleted_at ? " DELETED" : ""} (id ${n.id})`);

  // 2) product_lots: branch_id coverage
  const { count: lotsTotal } = await sb.from("product_lots").select("id", { count: "exact", head: true });
  const { count: lotsNullBranch } = await sb
    .from("product_lots").select("id", { count: "exact", head: true }).is("branch_id", null);
  ok(`product_lots: total=${lotsTotal ?? "?"} · sin branch_id=${lotsNullBranch ?? "?"}`);

  // 3) inventory_movements: branch_id coverage
  const { count: movTotal } = await sb.from("inventory_movements").select("id", { count: "exact", head: true });
  const { count: movNullBranch } = await sb
    .from("inventory_movements").select("id", { count: "exact", head: true }).is("branch_id", null);
  ok(`inventory_movements: total=${movTotal ?? "?"} · sin branch_id=${movNullBranch ?? "?"}`);

  // 4) warehouses
  const { data: whs, error: we } = await sb
    .from("warehouses").select("id, branch_id, code, name").order("code");
  if (we) ok(`warehouses: error (${we.message})`);
  else {
    ok(`warehouses: ${whs.length}`);
    for (const w of whs) ok(`  - ${w.code} (${w.name}) → branch ${w.branch_id}`);
  }

  ok("verificación READ-ONLY completa (no se escribió nada).");
}

main().catch((e) => die(e.message));
