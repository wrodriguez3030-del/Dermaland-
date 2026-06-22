#!/usr/bin/env node
/**
 * Diagnóstico READ-ONLY: sucursales reales + lotes del producto A-derma.
 * No escribe nada. Usa service_role (NO lo imprime).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(REPO_ROOT, "apps", "web", ".env.local");
const BUSINESS_ID = "00000000-0000-0000-0000-00000000d001";

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
  const require = createRequire(
    pathToFileURL(path.join(REPO_ROOT, "apps", "web", "package.json")),
  );
  const { createClient } = await import(
    pathToFileURL(require.resolve("@supabase/supabase-js")).href
  );
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1. Sucursales (todas, con status y soft-delete)
  const { data: branches } = await sb
    .from("branches")
    .select("id, name, status, deleted_at")
    .eq("business_id", BUSINESS_ID)
    .order("name");
  console.log("=== BRANCHES ===");
  for (const b of branches ?? []) {
    console.log(
      `  ${b.name}  | status=${b.status} | deleted=${b.deleted_at ? "SI" : "no"} | id=${b.id}`,
    );
  }

  // 2. Almacenes por sucursal
  const { data: whs } = await sb
    .from("warehouses")
    .select("id, name, branch_id, is_main")
    .eq("business_id", BUSINESS_ID);
  console.log("\n=== WAREHOUSES ===");
  for (const w of whs ?? []) {
    const bn = (branches ?? []).find((b) => b.id === w.branch_id)?.name ?? "?";
    console.log(`  branch=${bn} | name=${w.name} | is_main=${w.is_main} | id=${w.id}`);
  }

  // 3. Producto A-derma
  const { data: prods } = await sb
    .from("products")
    .select("id, name, sku")
    .eq("business_id", BUSINESS_ID)
    .ilike("name", "%ducha hidratante%");
  console.log("\n=== PRODUCTO(S) A-derma ===");
  for (const p of prods ?? []) console.log(`  ${p.name} | sku=${p.sku} | id=${p.id}`);

  // 4. Lotes de esos productos
  const ids = (prods ?? []).map((p) => p.id);
  if (ids.length) {
    const { data: lots } = await sb
      .from("product_lots")
      .select("id, product_id, lot_number, branch_id, warehouse_id, current_quantity, status, expires_at")
      .eq("business_id", BUSINESS_ID)
      .in("product_id", ids);
    console.log("\n=== LOTES ===");
    for (const l of lots ?? []) {
      const bn = (branches ?? []).find((b) => b.id === l.branch_id)?.name ?? "(branch desconocida)";
      console.log(
        `  lote=${l.lot_number} | sucursal=${bn} | qty=${l.current_quantity} | status=${l.status} | vence=${l.expires_at} | branch_id=${l.branch_id}`,
      );
    }
  }
}

main().catch((e) => {
  console.error("diag error:", e?.message ?? e);
  process.exit(1);
});
