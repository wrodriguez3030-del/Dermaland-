#!/usr/bin/env node
/**
 * Borra los datos de PRUEBA que quedaron en producción, autorizado por el
 * dueño con la frase «CONFIRMO BORRAR» el 08/09/2026.
 *
 * QUÉ BORRA, Y POR QUÉ ESO Y NO MÁS
 * ─────────────────────────────────
 * · 2 clientes creados desde la aplicación (`source = 'web'`) SIN una sola
 *   venta. Los otros dos que parecen de prueba por el nombre —«Alan Rodriguez
 *   Bisono» y «WILLIAN R RODRIGUEZ»— tienen 5 y 13 facturas REALES de Alegra:
 *   no se tocan, borrarlos dejaría 18 compras sin dueño.
 *
 * · 3 conteos de inventario vacíos (0 escaneos, 0 renglones).
 *
 * · 15 movimientos con referencia de tecleo al azar (`asdfasd`, `dfdefd`,
 *   `SDFSDF`…), todos de «Preview Admin». NO el decimosexto, que es
 *   `baja-lote-prueba-20260806` con la nota «Baja autorizada por el dueño»: ese
 *   es el registro de una acción legítima, aunque lleve «prueba» en el nombre.
 *
 * QUÉ **NO** BORRA, Y ESTO ES LO IMPORTANTE
 * ──────────────────────────────────────────
 * 🔴 Los lotes de nombre basura NO se tocan, ni se borran ni se ponen a cero.
 * Parecían restos de prueba, pero `dfdefd` (4 unidades) y `SDFSDF` (1) tienen
 * MERCANCÍA REAL: la migración de inventario de Alegra
 * (`ALEGRA-20260905-1409`) dijo que el «A-derma Crema de Ducha Hidratante 500
 * ML» tiene 5 unidades y las asignó a los lotes que encontró, que resultaron
 * ser esos. El lote con nombre decente (`INIT-DERM-I00059`) está en CERO.
 *
 * Vaciarlos le diría al sistema que no hay A-derma cuando sí lo hay, y
 * rompería el cuadre de la migración (1408/1408).
 *
 * Tampoco se borran sus MOVIMIENTOS: son el libro que explica de dónde salen
 * esas 5 unidades. Un libro con hojas arrancadas es peor que un libro feo.
 *
 * Queda PENDIENTE para el dueño, y es una decisión de inventario, no de código:
 * esos lotes tienen nombres inservibles y uno está VENCIDO (30/06/2026) con 4
 * de las 5 unidades bloqueadas para venta. Hay que mirar la mercancía física y
 * decidir su lote y su vencimiento de verdad.
 *
 * SEGURIDAD
 * ─────────
 * · Sin `--apply` no borra nada: enseña lo que haría.
 * · Guarda una copia en JSON de cada fila ANTES de borrarla.
 * · Todo va en UNA transacción: o se borra todo o no se borra nada.
 * · Los movimientos se borran ANTES que los lotes (la clave foránea manda).
 *
 * Uso:
 *   node scripts/limpieza/borrar-datos-de-prueba.mjs            (solo enseña)
 *   node scripts/limpieza/borrar-datos-de-prueba.mjs --apply
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { Client } = require("pg");

const APLICAR = process.argv.includes("--apply");

function cadenaDeConexion() {
  const archivo = path.join(root, "apps/web/.env.local");
  const env = readFileSync(archivo, "utf8");
  const url = env
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[A-Z_]+=.*postgres/.test(l))
    .map((l) => l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, ""))[0];
  if (!url) {
    console.error("No hay cadena de conexión de Postgres en apps/web/.env.local");
    process.exit(1);
  }
  return url;
}

/** Los clientes a borrar: creados en la aplicación y SIN ninguna venta. */
const SQL_CLIENTES = `
  select cl.id, coalesce(cl.first_name,'')||' '||coalesce(cl.last_name,'') as nombre,
         cl.customer_number, cl.source, cl.created_at
    from clients cl
   where cl.source = 'web'
     and not exists (select 1 from alegra_invoices a where a.client_id = cl.id)
     and not exists (select 1 from proformas p where p.customer_id = cl.id)`;

/** Conteos vacíos: nadie escaneó nada. */
const SQL_CONTEOS = `
  select id, status, scan_count, item_count, created_at
    from inventory_counts
   where coalesce(scan_count,0) = 0 and coalesce(item_count,0) = 0`;

/**
 * Movimientos de prueba. La referencia es un tecleo al azar: o contiene una de
 * las secuencias conocidas, o son 3-8 letras seguidas sin significado.
 *
 * 🔴 Se EXCLUYE lo que lleve «baja» o «autoriz»: `baja-lote-prueba-20260806` es
 * el registro de una baja que el dueño autorizó, no un tecleo.
 */
const FILTRO_MOVIMIENTOS = `
  reference is not null and reference <> ''
  and (reference ~* '(test|asdf|sdf|dfd|qwer|zxc|aaa|xxx)' or reference ~ '^[a-zA-Z]{3,8}$')
  and reference !~* '(baja|autoriz|alegra|zero-warehouse)'`;

/**
 * 🔴 Solo se borran los movimientos de lotes que NO guardan mercancía. Los de
 * `dfdefd` y `SDFSDF` se quedan: son el libro que explica sus 5 unidades
 * reales, y un libro con hojas arrancadas es peor que un libro feo.
 */
const SQL_MOVIMIENTOS = `
  select m.id, m.type, m.quantity, m.reference, m.user_name, m.lot_id, m.product_id, m.created_at
    from inventory_movements m
   where ${FILTRO_MOVIMIENTOS.replace(/reference/g, "m.reference")}
     and not exists (
       select 1 from product_lots pl
        where pl.id = m.lot_id and pl.current_quantity > 0
     )`;

/**
 * Lotes de nombre basura, SOLO PARA INFORMAR. No se borran (ver la cabecera):
 * dos de ellos guardan mercancía real que puso la migración de Alegra.
 */
const SQL_LOTES = `
  select pl.id, pl.lot_number, pl.current_quantity, pl.status, pl.expires_at, p.name as producto
    from product_lots pl
    left join products p on p.id = pl.product_id
   where pl.lot_number ~* '(test|asdf|sdf|dfd|qwer|zxc|aaa|xxx)'
      or pl.lot_number ~ '^[a-zA-Z]{3,8}$'`;

const c = new Client({ connectionString: cadenaDeConexion(), ssl: { rejectUnauthorized: false } });
await c.connect();

const clientes = (await c.query(SQL_CLIENTES)).rows;
const conteos = (await c.query(SQL_CONTEOS)).rows;
const movimientos = (await c.query(SQL_MOVIMIENTOS)).rows;
const lotes = (await c.query(SQL_LOTES)).rows;

console.log("Lo que se va a borrar:");
console.log(`  clientes de prueba (sin ninguna venta): ${clientes.length}`);
for (const x of clientes) console.log(`      · ${x.nombre} (${x.customer_number}, origen ${x.source})`);
console.log(`  conteos de inventario vacíos:           ${conteos.length}`);
console.log(`  movimientos de prueba:                  ${movimientos.length}`);
for (const x of movimientos) console.log(`      · ${x.reference} · ${x.type} · ${x.quantity} · ${x.user_name}`);
console.log(`\nLotes de nombre basura que NO se tocan: ${lotes.length}`);
for (const x of lotes) {
  const con = Number(x.current_quantity) > 0
    ? `  ← ${x.current_quantity} unidades REALES${x.status === "expired" ? " y el lote está VENCIDO" : ""}`
    : "";
  console.log(`      · ${x.lot_number} · ${x.producto ?? "(sin producto)"}${con}`);
}
const reales = lotes.reduce((a, x) => a + (Number(x.current_quantity) || 0), 0);
if (reales > 0) {
  console.log(`\n  🔴 ${reales} unidades REALES viven en lotes con nombre inservible.`);
  console.log("     No se borran: vaciarlos diría que no hay mercancía cuando sí la hay.");
  console.log("     Queda para el dueño: mirar la mercancía física y darles lote y vencimiento de verdad.");
}

if (!APLICAR) {
  console.log("\n(sin --apply) No se borró NADA.");
  await c.end();
  process.exit(0);
}

// Copia de seguridad ANTES de tocar nada.
const carpeta = path.join(root, "docs/limpieza");
mkdirSync(carpeta, { recursive: true });
const sello = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const copia = path.join(carpeta, `borrado-datos-de-prueba-${sello}.json`);
writeFileSync(copia, JSON.stringify({ clientes, conteos, movimientos, lotes }, null, 2), "utf8");
console.log(`\nCopia de seguridad: ${path.relative(root, copia)}`);

// Todo o nada.
await c.query("begin");
try {
  const m = await c.query(`delete from inventory_movements where ${FILTRO_MOVIMIENTOS} returning id`);
  const n = conteos.length
    ? await c.query(`delete from inventory_counts where id = any($1::uuid[]) returning id`, [conteos.map((x) => x.id)])
    : { rowCount: 0 };
  const k = clientes.length
    ? await c.query(`delete from clients where id = any($1::uuid[]) returning id`, [clientes.map((x) => x.id)])
    : { rowCount: 0 };
  await c.query("commit");
  console.log(`\nBorrado: ${m.rowCount} movimientos · ${n.rowCount} conteos · ${k.rowCount} clientes. Ningún lote tocado.`);
} catch (e) {
  await c.query("rollback");
  console.error("\nFALLÓ y se deshizo TODO. No se borró nada:", e.message);
  process.exitCode = 1;
}
await c.end();
