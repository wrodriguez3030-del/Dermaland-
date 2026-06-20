#!/usr/bin/env node
/**
 * Crea/actualiza el NEGOCIO demo de DermaLand en Supabase (idempotente, upsert).
 *
 * Prerequisito del seed de catálogo: brands/laboratories/product_categories/
 * products referencian `business_id` (FK a businesses). Sin el negocio, el seed
 * de catálogo falla por FK.
 *
 * NO borra nada. NUNCA imprime la service_role key.
 *
 * Uso:
 *   node scripts/seed-business-supabase.mjs --dry-run   # no escribe
 *   node scripts/seed-business-supabase.mjs             # upsert del negocio
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
const DRY = process.argv.includes("--dry-run");

// IDs estables (mismos que asume el bootstrap de usuario y el seed de catálogo).
const BUSINESS_ID = "00000000-0000-0000-0000-00000000d001";
const PLAN_BUSINESS_POS = "00000000-0000-0000-0000-000000000003"; // "Business / POS"

function die(m) { console.error(`[seed-business] ${m}`); process.exit(1); }
function ok(m) { console.log(`[seed-business] ${m}`); }

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
    die("faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY reales.");
  }

  // Datos del negocio (espejo de mockBusiness en mock-data/tenancy.ts).
  const row = {
    id: BUSINESS_ID,
    legal_name: "DermaLand SRL",
    commercial_name: "DermaLand",
    rnc: "1-32-59077-5",
    country: "República Dominicana",
    phone: "+1 809-226-5252",
    whatsapp: "+1 809-226-5252",
    email: "dermalandrd@gmail.com",
    dgii_enabled: false,
    plan_id: PLAN_BUSINESS_POS,
    status: "active",
  };

  ok(`negocio: ${row.commercial_name} (${BUSINESS_ID}) · plan Business/POS`);
  if (DRY) { ok("DRY-RUN: no se escribe nada."); return; }

  const require = createRequire(pathToFileURL(path.join(REPO_ROOT, "apps", "web", "package.json")));
  const { createClient } = await import(pathToFileURL(require.resolve("@supabase/supabase-js")).href);
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // FK: el plan debe existir.
  const { data: plan, error: pe } = await sb
    .from("plans").select("id").eq("id", PLAN_BUSINESS_POS).maybeSingle();
  if (pe) die(`plans: ${pe.message}`);
  if (!plan) die(`el plan Business/POS (${PLAN_BUSINESS_POS}) no existe — aplicá las migraciones primero.`);

  const { error } = await sb.from("businesses").upsert(row, { onConflict: "id" });
  if (error) die(`businesses upsert: ${error.message}`);
  ok("negocio demo upserted OK (idempotente, no se borró nada).");
}

main().catch((e) => die(e.message));
