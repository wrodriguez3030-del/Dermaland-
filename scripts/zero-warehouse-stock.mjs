#!/usr/bin/env node
/**
 * Pone a CERO el stock de un almacén completo, dejando constancia en la bitácora.
 *
 * Se escribió para limpiar el almacén de pruebas (lotes con números tecleados al
 * azar: "WWWWWWW", "asdfasd") y que el inventario visible sea únicamente el que
 * carga el archivo de Alegra en DermaLand Principal.
 *
 * REGLAS DE SEGURIDAD (no negociables):
 *  - DRY-RUN por defecto. Sin `--apply` no escribe absolutamente nada.
 *  - NO borra filas. El stock vive en `product_lots.current_quantity` y se pone a
 *    0; el lote sigue existiendo con su número y su vencimiento. En una farmacia
 *    la trazabilidad de lotes es obligatoria: borrar la fila la destruiría.
 *  - Cada lote ajustado deja un `adjustment_negative` en `inventory_movements`
 *    con la cantidad exacta que se restó y el motivo.
 *  - Antes de escribir vuelca el estado actual a `stock-antes.json`, que basta
 *    para revertir (contiene lote, producto, almacén y cantidad previa).
 *  - Solo toca el almacén que se le pasa por argumento. Nunca todos.
 *
 * Uso:
 *   node scripts/zero-warehouse-stock.mjs <warehouseId>            # simulación
 *   node scripts/zero-warehouse-stock.mjs <warehouseId> --apply    # ejecuta
 *
 * Lee apps/web/.env.local (service_role). NUNCA imprime claves.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WAREHOUSE = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!WAREHOUSE || WAREHOUSE.startsWith("--")) {
  console.error("Uso: node scripts/zero-warehouse-stock.mjs <warehouseId> [--apply]");
  process.exit(1);
}

const env = {};
for (const line of readFileSync(path.join(root, "apps/web/.env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// ── estado actual del almacén ──
const res = await fetch(
  `${URL_}/rest/v1/product_lots?warehouse_id=eq.${WAREHOUSE}&current_quantity=gt.0&select=id,business_id,branch_id,product_id,warehouse_id,lot_number,expires_at,current_quantity`,
  { headers },
);
if (!res.ok) { console.error(`GET product_lots: ${res.status} ${await res.text()}`); process.exit(1); }
const lotes = await res.json();

const total = lotes.reduce((a, l) => a + l.current_quantity, 0);
console.log(`Almacén ${WAREHOUSE}`);
console.log(`  lotes con stock : ${lotes.length}`);
console.log(`  unidades        : ${total}`);
for (const l of lotes.slice(0, 15)) {
  console.log(`   - ${String(l.current_quantity).padStart(5)} u.  lote "${l.lot_number}"  vence ${String(l.expires_at).slice(0, 10)}`);
}
if (lotes.length > 15) console.log(`   … y ${lotes.length - 15} más`);

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "");
const outDir = path.join(root, `data/zero-warehouse-${stamp}`);
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "stock-antes.json"), JSON.stringify(lotes, null, 2));
console.log(`\nRespaldo del estado actual: ${outDir}/stock-antes.json`);

if (!APPLY) {
  console.log(`\n🔍 SIMULACIÓN: no se escribió nada. Agrega --apply para poner en 0 esos ${total} u.`);
  process.exit(0);
}

// ── aplicar: bitácora primero, luego el ajuste ──
let ok = 0, err = 0;
const hechos = [];
for (const l of lotes) {
  const mov = await fetch(`${URL_}/rest/v1/inventory_movements`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({
      business_id: l.business_id, branch_id: l.branch_id, product_id: l.product_id,
      lot_id: l.id, warehouse_id: l.warehouse_id,
      type: "adjustment_negative", quantity: l.current_quantity,
      reason: "Limpieza de stock de pruebas: el inventario válido es el que carga el archivo de Alegra",
      reference: `zero-warehouse-${stamp}`,
      user_name: "Importación Alegra",
    }),
  });
  if (!mov.ok) { err++; console.error(`  bitácora falló para lote ${l.id}: ${mov.status}`); continue; }

  // guarda `current_quantity=gt.0`: si otro proceso ya lo movió, no se pisa
  const upd = await fetch(
    `${URL_}/rest/v1/product_lots?id=eq.${l.id}&current_quantity=gt.0`,
    { method: "PATCH", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify({ current_quantity: 0 }) },
  );
  if (!upd.ok) { err++; continue; }
  const rows = await upd.json();
  if (rows.length === 1) { ok++; hechos.push({ lot_id: l.id, lot_number: l.lot_number, antes: l.current_quantity }); }
}

writeFileSync(path.join(outDir, "ajustados.json"), JSON.stringify(hechos, null, 2));
console.log(`\n=== APLICADO: ${ok} lotes a 0 (${total} u.), errores=${err} ===`);
console.log(`Reversible con ${outDir}/stock-antes.json`);
