#!/usr/bin/env node
/**
 * check-product-create-read.mjs — DIAGNÓSTICO (solo lectura, dry-run).
 *
 * Verifica el flujo crear→leer de productos contra la DB cloud. NO escribe,
 * NO borra, NO toca DGII/producción fiscal, NO imprime secretos.
 *
 * Chequea:
 *   1. Total de productos activos no borrados por negocio.
 *   2. Cuántos quedaban INVISIBLES para la UI con el viejo fetch de una sola
 *      página (?limit=1000 ordenado por nombre) — causa del "Producto no
 *      encontrado" después de crear.
 *   3. Lectura por id (equivalente a product.byId / GET /api/products/[id])
 *      de los 5 productos más recientes: existen, activos, business_id
 *      consistente, id UUID real.
 *   4. Con `--id <uuid>` verifica un producto puntual.
 *
 * Uso:  node scripts/check-product-create-read.mjs [--id <uuid>]
 * Requiere en apps/web/.env.local: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = join(__dirname, "..", "apps", "web", ".env.local");
  const env = {};
  try {
    for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    console.error("No se pudo leer apps/web/.env.local");
  }
  return env;
}

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function rest(path, extraHeaders = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { ...HEADERS, ...extraHeaders },
  });
  if (!res.ok) throw new Error(`REST ${res.status} en ${path.split("?")[0]}`);
  return { rows: await res.json(), contentRange: res.headers.get("content-range") };
}

async function countProducts(filter) {
  const { contentRange } = await rest(`products?select=id&limit=1${filter}`, {
    Prefer: "count=exact",
  });
  return Number(contentRange?.split("/")[1] ?? 0);
}

const targetId = (() => {
  const ix = process.argv.indexOf("--id");
  return ix >= 0 ? process.argv[ix + 1] : null;
})();

let failures = 0;
const ok = (label, extra = "") => console.log(`  [OK]   ${label}${extra ? ` — ${extra}` : ""}`);
const bad = (label, extra = "") => {
  failures++;
  console.log(`  [FAIL] ${label}${extra ? ` — ${extra}` : ""}`);
};

console.log("== Diagnóstico crear→leer producto (solo lectura) ==\n");

// 1. Totales
const totalActive = await countProducts("&deleted_at=is.null&active=eq.true");
const totalAll = await countProducts("&deleted_at=is.null");
console.log(`Productos activos no borrados: ${totalActive} (no borrados total: ${totalAll})`);

// 2. Gap de la primera página (comportamiento viejo de la UI)
const firstPage = await rest(
  "products?select=id&deleted_at=is.null&active=eq.true&order=name.asc&limit=1000",
);
const visible = firstPage.rows.length;
const invisible = Math.max(0, totalActive - visible);
if (invisible > 0) {
  console.log(
    `Primera página (limit=1000 por nombre): ${visible} visibles → ${invisible} productos ` +
      "quedaban FUERA con el fetch de una sola página (la UI ahora pagina).",
  );
} else {
  console.log("Primera página cubre el catálogo completo (<1000 productos).");
}

// 3. Lectura por id de los más recientes (mismo camino que product.byId)
console.log("\nLectura por id de los 5 productos más recientes:");
const recent = await rest(
  "products?select=id,sku,name,business_id,active,deleted_at,created_at&deleted_at=is.null&order=created_at.desc&limit=5",
);
const businessIds = new Set();
for (const p of recent.rows) {
  businessIds.add(p.business_id);
  const byId = await rest(
    `products?select=id,active,deleted_at,business_id&id=eq.${p.id}&business_id=eq.${p.business_id}&deleted_at=is.null`,
  );
  const found = byId.rows.length === 1;
  const label = `${p.sku} · ${p.name.slice(0, 40)}`;
  if (!found) bad(label, "byId con business_id NO lo encuentra");
  else if (!UUID_RE.test(p.id)) bad(label, "id no es UUID real");
  else if (!p.active) ok(label, "legible por id (inactivo)");
  else ok(label, "legible por id, activo");
}
if (businessIds.size > 1) {
  bad("business_id", `los productos recientes mezclan ${businessIds.size} negocios distintos`);
} else if (recent.rows.length) {
  ok("business_id", "consistente en los productos recientes");
}

// 4. Producto puntual
if (targetId) {
  console.log(`\nProducto puntual ${targetId}:`);
  if (!UUID_RE.test(targetId)) bad("formato", "el id no es un UUID");
  const one = await rest(
    `products?select=id,sku,name,business_id,active,deleted_at,created_at&id=eq.${targetId}`,
  );
  if (!one.rows.length) bad("existencia", "no existe en la tabla products");
  else {
    const p = one.rows[0];
    ok("existencia", `${p.sku} · ${p.name}`);
    if (p.deleted_at) bad("estado", "está soft-deleted");
    else ok("estado", p.active ? "activo" : "inactivo (no borrado)");
  }
}

console.log(`\n== Resumen: ${failures === 0 ? "TODO OK" : `${failures} problema(s)`} ==`);
process.exit(failures === 0 ? 0 : 1);
