#!/usr/bin/env node
/**
 * Seed idempotente del catálogo (brands/labs/categories/products) a Supabase.
 * Idempotente: re-ejecutable. Usa service_role (NO lo imprime).
 *
 * Uso:
 *   node scripts/seed-catalog-supabase.mjs --dry-run   # no escribe
 *   node scripts/seed-catalog-supabase.mjs             # escribe (upsert)
 *
 * Lee apps/web/.env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Fuente: apps/web/src/lib/mock-data/catalog-snapshot.json (generar con
 *   pnpm --filter web exec tsx src/lib/mock-data/catalog-export.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(REPO_ROOT, "apps", "web", ".env.local");
const SNAPSHOT = path.join(REPO_ROOT, "apps", "web", "src", "lib", "mock-data", "catalog-snapshot.json");
const BUSINESS_ID = "00000000-0000-0000-0000-00000000d001";
const DRY = process.argv.includes("--dry-run");

function die(m) { console.error(`[seed-catalog] ${m}`); process.exit(1); }
function ok(m) { console.log(`[seed-catalog] ${m}`); }

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
  if (!fs.existsSync(SNAPSHOT)) die(`falta ${SNAPSHOT} — corré el export primero`);
  const data = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  ok(`snapshot: brands=${data.brands.length} labs=${data.laboratories.length} cats=${data.categories.length} products=${data.products.length}`);
  if (DRY) { ok("DRY-RUN: no se escribe nada. Salida OK."); return; }

  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || /replace/i.test(key)) die("faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY reales");

  // Importar @supabase/supabase-js dinámicamente desde apps/web/node_modules
  // Usamos createRequire para resolver el entry point real del paquete (evita
  // rutas hardcodeadas a dist/index.mjs que rompen si cambia el package.json).
  let createClient;
  try {
    const require = createRequire(pathToFileURL(path.join(REPO_ROOT, "apps", "web", "package.json")));
    const supabaseEntry = require.resolve("@supabase/supabase-js");
    const mod = await import(pathToFileURL(supabaseEntry).href);
    createClient = mod.createClient;
  } catch (e) {
    die(
      `no pude importar @supabase/supabase-js desde apps/web/node_modules. ` +
        `Corre 'pnpm install' primero. Detalle: ${e?.message ?? e}`,
    );
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const brandMap = {}, labMap = {}, catMap = {};

  for (const b of data.brands) {
    const { data: row, error } = await sb.from("brands")
      .upsert({ business_id: BUSINESS_ID, name: b.name }, { onConflict: "business_id,name" })
      .select("id").single();
    if (error) die(`brand ${b.name}: ${error.message}`);
    brandMap[b.mockId] = row.id;
  }
  ok(`brands upserted: ${Object.keys(brandMap).length}`);

  for (const l of data.laboratories) {
    const { data: existing } = await sb.from("laboratories")
      .select("id").eq("business_id", BUSINESS_ID).eq("name", l.name).maybeSingle();
    let id = existing?.id;
    if (!id) {
      const { data: row, error } = await sb.from("laboratories")
        .insert({ business_id: BUSINESS_ID, name: l.name, country: l.country }).select("id").single();
      if (error) die(`lab ${l.name}: ${error.message}`);
      id = row.id;
    }
    labMap[l.mockId] = id;
  }
  ok(`laboratories upserted: ${Object.keys(labMap).length}`);

  // categorías sin parent primero, luego con parent
  // Asume árbol de categorías de UN solo nivel (raíz → hijo). Si en el futuro
  // hay nietos (hijo de hijo), este sort no garantiza que el padre exista en
  // catMap antes de insertar el nieto; habría que ordenar topológicamente.
  const sorted = [...data.categories].sort((a, b) => (a.parentMockId ? 1 : 0) - (b.parentMockId ? 1 : 0));
  for (const c of sorted) {
    const { data: existing } = await sb.from("product_categories")
      .select("id").eq("business_id", BUSINESS_ID).eq("name", c.name).maybeSingle();
    let id = existing?.id;
    const parent_id = c.parentMockId ? catMap[c.parentMockId] ?? null : null;
    if (!id) {
      const { data: row, error } = await sb.from("product_categories")
        .insert({ business_id: BUSINESS_ID, name: c.name, description: c.description, parent_id }).select("id").single();
      if (error) die(`cat ${c.name}: ${error.message}`);
      id = row.id;
    }
    catMap[c.mockId] = id;
  }
  ok(`categories upserted: ${Object.keys(catMap).length}`);

  let count = 0;
  for (const p of data.products) {
    const row = {
      business_id: BUSINESS_ID, sku: p.sku, barcode: p.barcode, name: p.name, description: p.description,
      brand_id: p.brandMockId ? brandMap[p.brandMockId] ?? null : null,
      laboratory_id: p.laboratoryMockId ? labMap[p.laboratoryMockId] ?? null : null,
      category_id: p.categoryMockId ? catMap[p.categoryMockId] ?? null : null,
      unit: p.unit, pharmaceutical_form: p.pharmaceuticalForm, presentation: p.presentation,
      active_ingredient: p.activeIngredient, concentration: p.concentration,
      sanitary_registry: p.sanitaryRegistry, storage_temperature: p.storageTemperature,
      requires_prescription: p.requiresPrescription, controlled: p.controlled,
      cost: p.cost, price: p.price, itbis_rate: p.itbisRate, min_stock: p.minStock, max_stock: p.maxStock,
      image_url: p.imageUrl, active: p.active, sellable: p.sellable,
    };
    const { error } = await sb.from("products").upsert(row, { onConflict: "business_id,sku" });
    if (error) die(`product ${p.sku}: ${error.message}`);
    count++;
  }
  ok(`products upserted: ${count}`);
  ok("seed OK");
}

main().catch((e) => die(e.message));
