#!/usr/bin/env node
/**
 * Fija el mínimo de existencias de los productos que no lo tienen puesto.
 *
 * POR QUÉ HACE FALTA
 * ──────────────────
 * De los 1 488 productos del catálogo, 1 487 tenían el mínimo en CERO: la
 * alerta «bajo mínimo» del panel no podía avisar de nada porque nadie había
 * dicho todavía cuánto tiene que haber de cada cosa.
 *
 * QUÉ TOCA Y QUÉ NO
 * ─────────────────
 * Por defecto, solo los que están en 0. El que YA tiene un mínimo puesto a mano
 * no se pisa: ese número lo decidió alguien mirando el producto, y un guion no
 * sabe más que esa persona.
 *
 * `--desde N` cambia solo los que están EXACTAMENTE en N. Sirve para corregir
 * una tanda anterior («pon 3» → «mejor 5») sin tocar los mínimos que alguien
 * eligió uno por uno.
 *
 * Uso:
 *   node scripts/inventario/fijar-minimo.mjs --minimo 3
 *   node scripts/inventario/fijar-minimo.mjs --minimo 3 --apply
 *   node scripts/inventario/fijar-minimo.mjs --minimo 5 --desde 3 --apply
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { Client } = require("pg");

const args = process.argv.slice(2);
const APLICAR = args.includes("--apply");
const i = args.indexOf("--minimo");
const MINIMO = i === -1 ? NaN : Number(args[i + 1]);
const j = args.indexOf("--desde");
/** Valor actual que se reemplaza. `null` = los que están en 0 (o sin poner). */
const DESDE = j === -1 ? null : Number(args[j + 1]);
if (DESDE !== null && (!Number.isInteger(DESDE) || DESDE < 0)) {
  console.error("--desde debe ser un entero >= 0.");
  process.exit(1);
}
/** Qué filas se tocan. */
const CONDICION = DESDE === null
  ? "coalesce(min_stock,0) = 0"
  : `coalesce(min_stock,0) = ${DESDE}`;
if (!Number.isInteger(MINIMO) || MINIMO < 0 || MINIMO > 10_000) {
  console.error("Uso: node scripts/inventario/fijar-minimo.mjs --minimo <entero 0-10000> [--apply]");
  process.exit(1);
}

const env = readFileSync(path.join(root, "apps/web/.env.local"), "utf8");
const url = env.split("\n").map((l) => l.trim())
  .filter((l) => /^[A-Z_]+=.*postgres/.test(l))
  .map((l) => l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, ""))[0];

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows: [antes] } = await c.query(`
  select count(*) filter (where ${CONDICION})::int a_tocar,
         count(*) filter (where not (${CONDICION}))::int intactos
    from products where deleted_at is null`);
console.log(
  DESDE === null
    ? `Productos sin mínimo: ${antes.a_tocar} · con mínimo ya puesto: ${antes.intactos} (no se tocan)`
    : `Productos con el mínimo en ${DESDE}: ${antes.a_tocar} · con otro valor: ${antes.intactos} (no se tocan)`,
);

// Cuántos quedarían en alerta, para que nadie se lleve la sorpresa después.
const { rows: [efecto] } = await c.query(`
  with vendible as (
    select pl.product_id, sum(pl.current_quantity) stock from product_lots pl
     where pl.status = 'available' and pl.current_quantity > 0 group by 1)
  select count(*) filter (where coalesce(v.stock,0) = 0)::int en_cero,
         count(*) filter (where coalesce(v.stock,0) between 1 and $1)::int con_poco
    from products p left join vendible v on v.product_id = p.id
   where p.deleted_at is null and ${CONDICION}`.replace("${CONDICION}", CONDICION), [MINIMO]);
console.log(`Con el mínimo en ${MINIMO}, la alerta pasaría a ${efecto.en_cero + efecto.con_poco}:`);
console.log(`  · ${efecto.en_cero} sin existencia`);
console.log(`  · ${efecto.con_poco} con 1 a ${MINIMO} unidades  ← los avisos útiles`);

if (!APLICAR) {
  console.log("\n(sin --apply) No se cambió NADA.");
  await c.end();
  process.exit(0);
}

const r = await c.query(
  `update products set min_stock = $1, updated_at = now()
    where deleted_at is null and ${CONDICION} returning id`, [MINIMO]);
console.log(`\nMínimo fijado en ${MINIMO} para ${r.rowCount} productos.`);
console.log(`Para deshacerlo: node scripts/inventario/fijar-minimo.mjs --minimo ${DESDE ?? 0} --desde ${MINIMO} --apply`);
await c.end();
