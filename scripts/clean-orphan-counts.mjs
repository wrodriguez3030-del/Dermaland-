#!/usr/bin/env node
/**
 * Borra conteos físicos huérfanos: cabeceras que declaran ítems pero no tienen
 * ninguna fila en `inventory_count_items`. Son el rastro del bug de creación no
 * atómica (dos INSERT sin transacción) y envenenan cualquier informe, porque su
 * `item_count` miente.
 *
 * DRY-RUN por defecto; siempre respalda a `data/orphan-counts/antes.json` antes
 * de tocar nada. El borrado en cascada se lleva los escaneos del conteo, así que
 * el script se niega a borrar cualquier cabecera que tenga escaneos.
 *
 * Uso: node scripts/clean-orphan-counts.mjs [--apply]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");

const env = {};
for (const l of readFileSync(path.join(root, "apps/web/.env.local"), "utf8").split(
  /\r?\n/,
)) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const U = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const K = env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en apps/web/.env.local",
  );
  process.exit(1);
}
const h = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };

const counts = await (
  await fetch(`${U}/rest/v1/inventory_counts?select=*`, { headers: h })
).json();

const huerfanos = [];
for (const c of counts) {
  const items = await (
    await fetch(
      `${U}/rest/v1/inventory_count_items?inventory_count_id=eq.${c.id}&select=id`,
      { headers: h },
    )
  ).json();
  if (items.length > 0 || (c.item_count ?? 0) === 0) continue;
  const scans = await (
    await fetch(
      `${U}/rest/v1/inventory_count_scans?inventory_count_id=eq.${c.id}&select=id`,
      { headers: h },
    )
  ).json();
  huerfanos.push({ ...c, escaneos: scans.length });
}

console.log(`conteos: ${counts.length} · huérfanos: ${huerfanos.length}`);
for (const c of huerfanos)
  console.log(
    `  ${c.id} · ${c.status} · item_count=${c.item_count} · escaneos=${c.escaneos}`,
  );

const conEscaneos = huerfanos.filter((c) => c.escaneos > 0);
const borrables = huerfanos.filter((c) => c.escaneos === 0);
if (conEscaneos.length)
  console.log(
    `\n${conEscaneos.length} tienen escaneos y NO se tocan: borrarlas los eliminaría en cascada.`,
  );

const outDir = path.join(root, "data/orphan-counts");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "antes.json"), JSON.stringify(huerfanos, null, 2));
console.log(`Respaldo escrito en ${path.relative(root, outDir)}/antes.json`);

if (!APPLY) {
  console.log(`\nDRY-RUN: nada borrado. Agrega --apply para borrar ${borrables.length}.`);
  process.exit(0);
}

let ok = 0;
for (const c of borrables) {
  const r = await fetch(`${U}/rest/v1/inventory_counts?id=eq.${c.id}`, {
    method: "DELETE",
    headers: h,
  });
  if (r.ok) ok++;
  else console.error(`  fallo al borrar ${c.id}: HTTP ${r.status}`);
}
console.log(`\n=== BORRADOS: ${ok}/${borrables.length}. Respaldo en ${outDir}/antes.json ===`);
