#!/usr/bin/env node
/**
 * Borra los productos de prueba que quedaron de antes de la migración de Alegra.
 *
 * El dueño quiere el catálogo alineado con Alegra: todo producto real viene de
 * ahí y lleva `alegra_id`. Los que no lo tienen se crearon a mano en junio y
 * julio de 2026 para probar el sistema.
 *
 * 🔴 EXCEPCIÓN confirmada por el dueño: «Isispharma Secalia ATO Shower Cream
 * 500ML» (`DERM-000644`) SÍ es real —se creó el día de la migración y tiene una
 * unidad en un lote de ajuste—, así que se excluye por SKU.
 *
 * Comprobado antes de escribir esto: ninguno de los 21 tiene ventas migradas,
 * sus 26 lotes suman 0 unidades, y lo único que los referencia son 41
 * movimientos de inventario. Borrarlos no mueve ni un número del histórico.
 *
 * 🔴 Guarda TODO lo que va a borrar en un JSON antes de tocar nada. El borrado
 * es irreversible en la base; el fichero es la vuelta atrás.
 *
 *   node scripts/limpiar-productos-de-prueba.mjs            # simula
 *   node scripts/limpiar-productos-de-prueba.mjs --apply    # borra
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const RAIZ = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(RAIZ, "apps/web/package.json"));
const { Client } = require("pg");
const APPLY = process.argv.includes("--apply");
const BUSINESS = "00000000-0000-0000-0000-00000000d001";

/** El producto que el dueño confirmó como REAL. Se queda. */
const SKU_QUE_SE_QUEDA = "DERM-000644";

/**
 * 🔴 UN SOLO criterio, usado para contar, para guardar la copia y para borrar.
 * Si cambia, cambia para los tres: es lo que impide que la simulación enseñe
 * una cosa y el borrado haga otra.
 */
const OBJETIVO = `
  select id from public.products
   where business_id = $1
     and deleted_at is null
     and alegra_id is null
     and sku is distinct from $2`;

function url() {
  const env = readFileSync(path.join(RAIZ, "apps/web/.env.local"), "utf8");
  return env.match(/^SUPABASE_DB_URL=(.*)$/m)[1].replace(/^"|"$/g, "");
}

const c = new Client({
  connectionString: url(),
  ssl: {
    ca: readFileSync(path.join(RAIZ, "supabase/certs/supabase-root-2021-ca.crt"), "utf8"),
    rejectUnauthorized: true,
  },
});

const args = [BUSINESS, SKU_QUE_SE_QUEDA];
await c.connect();
console.log(`\n${APPLY ? "▶ BORRANDO" : "🔍 simulación (sin --apply no borra)"}\n`);

try {
  const productos = (
    await c.query(
      `select id, name, sku, created_at, alegra_id from public.products where id in (${OBJETIVO})`,
      args,
    )
  ).rows;
  const lotes = (
    await c.query(
      `select * from public.product_lots where product_id in (${OBJETIVO})`,
      args,
    )
  ).rows;
  const movimientos = (
    await c.query(
      `select * from public.inventory_movements where product_id in (${OBJETIVO})`,
      args,
    )
  ).rows;

  const unidades = lotes.reduce((s, l) => s + Number(l.current_quantity ?? 0), 0);
  console.log(`  productos    ${productos.length}`);
  console.log(`  lotes        ${lotes.length}   (${unidades} unidades en total)`);
  console.log(`  movimientos  ${movimientos.length}\n`);

  // Guarda que NO se toca nada con ventas migradas, aunque el criterio ya lo
  // impida: una segunda barrera cuesta tres líneas y evita un desastre mudo.
  const conVentas = await c.query(
    `select count(*)::int n from public.alegra_invoice_items where product_id in (${OBJETIVO})`,
    args,
  );
  if (conVentas.rows[0].n > 0) {
    console.log(`  🔴 ${conVentas.rows[0].n} renglones de facturas migradas apuntan a estos productos.`);
    console.log("     No se borra nada: rompería el histórico de Alegra.\n");
    process.exitCode = 1;
    await c.end();
    process.exit();
  }
  console.log("  ✓ ninguno tiene ventas migradas de Alegra");

  if (unidades > 0) {
    console.log(`\n  🔴 hay ${unidades} unidades en esos lotes. No se borra nada:`);
    console.log("     un producto con mercancía no es de prueba.\n");
    process.exitCode = 1;
    await c.end();
    process.exit();
  }
  console.log("  ✓ sus lotes están todos en cero\n");

  for (const p of productos) {
    console.log(`    ${String(p.name).slice(0, 44).padEnd(46)} ${String(p.sku ?? "").padEnd(14)} ${String(p.created_at).slice(4, 15)}`);
  }

  if (!APPLY) {
    console.log("\nPara borrarlo: node scripts/limpiar-productos-de-prueba.mjs --apply\n");
    await c.end();
    process.exit();
  }

  // ── La copia de seguridad, ANTES de tocar nada ──
  const dir = path.join(RAIZ, "backups");
  mkdirSync(dir, { recursive: true });
  const marca = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const fichero = path.join(dir, `productos-de-prueba-${marca}.json`);
  writeFileSync(fichero, JSON.stringify({ productos, lotes, movimientos }, null, 2), "utf8");
  console.log(`\n  copia guardada en ${fichero}`);

  await c.query("begin");
  const m = await c.query(
    `delete from public.inventory_movements where product_id in (${OBJETIVO})`,
    args,
  );
  // `product_lots` tiene `on delete cascade` desde `products`, así que se van
  // solos. Se cuentan antes para poder comprobar que el número cuadra.
  const p = await c.query(`delete from public.products where id in (${OBJETIVO})`, args);

  if (p.rowCount !== productos.length || m.rowCount !== movimientos.length) {
    console.log(`\n  🔴 se anunciaron ${productos.length} productos y ${movimientos.length} movimientos;`);
    console.log(`     se borraron ${p.rowCount} y ${m.rowCount}. Se deshace todo.\n`);
    await c.query("rollback");
    process.exitCode = 1;
    await c.end();
    process.exit();
  }

  const quedan = await c.query(
    `select count(*)::int n from public.product_lots where product_id in (${OBJETIVO})`,
    args,
  );
  await c.query("commit");
  console.log(`\n  ${p.rowCount} productos · ${m.rowCount} movimientos · sus lotes (quedan ${quedan.rows[0].n})`);

  const [{ rows: [restan] }] = [
    await c.query(
      `select count(*)::int n from public.products where business_id=$1 and deleted_at is null and alegra_id is null`,
      [BUSINESS],
    ),
  ];
  console.log(`\n  productos sin alegra_id que quedan: ${restan.n} (el que el dueño marcó como real)`);
  console.log("\n✓ borrado\n");
} catch (e) {
  if (APPLY) await c.query("rollback").catch(() => {});
  console.error("\n  🔴 " + e.message + "\n  No se borró nada.\n");
  process.exitCode = 1;
} finally {
  await c.end();
}
