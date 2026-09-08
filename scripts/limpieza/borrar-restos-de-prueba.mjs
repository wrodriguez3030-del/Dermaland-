#!/usr/bin/env node
/**
 * Segunda pasada de limpieza: los restos de prueba que quedaron tras
 * `borrar-datos-de-prueba.mjs`. Autorizado por el dueño con «CONFIRMO BORRAR»
 * el 08/09/2026, sobre una lista que se le enseñó antes fila por fila.
 *
 * LA REGLA, Y ES LA MISMA DE LA PRIMERA PASADA
 * ────────────────────────────────────────────
 * No se borra nada que tenga existencias, ni nada que EXPLIQUE existencias.
 * Un lote con mercancía dentro es mercancía aunque se llame «dfdefd», y su
 * libro de movimientos es lo que dice de dónde salió. Un libro con hojas
 * arrancadas es peor que un libro feo.
 *
 * QUÉ BORRA
 * ─────────
 * · Productos creados aquí, con CERO existencias, CERO lotes, CERO movimientos
 *   y que nunca se vendieron: «Producto conteo» y dos «RADIOCARE» duplicados.
 *   Salen limpios: no cuelga nada de ellos.
 *
 * QUÉ NO BORRA AUNQUE LO PAREZCA: los lotes de nombre inservible
 * ─────────────────────────────────────────────────────────────
 * 🔴 Están vacíos, pero NINGUNO sale: los ocho están referenciados por
 * movimientos LEGÍTIMOS — la limpieza `zero-warehouse` que hizo la propia
 * importación de Alegra, las transferencias TRF de Rosa Peralta, y ajustes de
 * la sincronización. Borrar el lote obliga a borrar esos registros, y esos
 * registros son trabajo real.
 *
 * Tampoco sale el movimiento `4545345`: es la entrada de 24 unidades que
 * después la limpieza retiró. Borrar la entrada y dejar la salida deja el
 * libro diciendo «-24» de la nada.
 *
 * Un lote vacío con nombre feo no molesta a nadie: no se vende, no cuenta, no
 * suma. Arrancarle la página al libro sí molesta.
 *
 * QUÉ **NO** BORRA, aunque «no venga de la migración»
 * ───────────────────────────────────────────────────
 * · Los 2 clientes «manual»: son WILLIAN R RODRIGUEZ (13 facturas,
 *   RD$10 634) y Alan Rodriguez Bisono (5 facturas, RD$8 782,87). Parecen de
 *   prueba por el nombre; son RD$19 416 en compras reales.
 * · «Isispharma Secalia ATO Shower Cream» — tiene 1 unidad en el estante.
 * · «Delivery» — es el producto con el que la tienda web cobra el envío.
 *   Borrarlo deja los pedidos web sin poder cobrar el domicilio.
 * · Los lotes con mercancía (A-derma 5, Uriage 1) y sus movimientos.
 * · Las transferencias de Rosa Peralta y la limpieza `zero-warehouse` que hizo
 *   la propia importación de Alegra: trabajo real, no pruebas.
 *
 * Sin `--apply` no borra nada. Guarda copia en JSON. Todo en una transacción.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { Client } = require("pg");
const APLICAR = process.argv.includes("--apply");

const env = readFileSync(path.join(root, "apps/web/.env.local"), "utf8");
const url = env.split("\n").map((l) => l.trim())
  .filter((l) => /^[A-Z_]+=.*postgres/.test(l))
  .map((l) => l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, ""))[0];
if (!url) { console.error("Sin cadena de conexión."); process.exit(1); }

/** Nombre que es tecleo al azar, no un lote de verdad. */
const BASURA = `(lot_number ~* '(test|asdf|sdf|dfd|qwer|zxc|aaa|xxx)' or lot_number ~ '^[a-zA-Z]{3,8}$' or lot_number ~ '^[0-9]{5,8}$')`;

/** SKU exactos, no un patrón: borrar productos por parecido es como se borra de más. */
const SKU_A_BORRAR = ["AT-ct5jmp", "DERM-000001", "DERM-000002"];

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const productos = (await c.query(`
  select id, name, sku,
         coalesce((select sum(current_quantity)::int from product_lots pl where pl.product_id = p.id), 0) as existencias
    from products p
   where sku = any($1::text[])
     and not exists (select 1 from alegra_invoice_items i where i.product_id = p.id)
     and not exists (select 1 from proforma_items pi where pi.product_id = p.id)
     and coalesce((select sum(current_quantity) from product_lots pl where pl.product_id = p.id), 0) = 0`,
  [SKU_A_BORRAR])).rows;

/**
 * Solo lotes que NO tenga nada colgando: ni movimientos ni ventas. En la
 * práctica hoy son cero — y eso es correcto, no un fallo (ver la cabecera).
 */
const lotes = (await c.query(`
  select pl.id, pl.lot_number, pl.current_quantity, p.name as producto
    from product_lots pl left join products p on p.id = pl.product_id
   where ${BASURA} and coalesce(pl.current_quantity, 0) = 0
     and not exists (select 1 from proforma_items pi where pi.product_lot_id = pl.id)
     and not exists (select 1 from inventory_movements m where m.lot_id = pl.id)`)).rows;

/**
 * Movimientos de tecleo al azar cuyo lote NO sobrevive. Si el lote se queda
 * (que es lo que pasa hoy), su movimiento se queda con él: son las dos caras
 * de la misma anotación.
 */
const movimientos = (await c.query(`
  select m.id, m.reference, m.type, m.quantity, m.user_name
    from inventory_movements m
   where m.reference is not null and m.reference <> ''
     and m.reference !~* '(alegra|zero-warehouse|baja|autoriz|^TRF-|^INIT-)'
     and (m.reference ~* '(test|asdf|sdf|dfd|qwer|zxc|aaa|xxx)'
          or m.reference ~ '^[a-zA-Z]{3,8}$' or m.reference ~ '^[0-9]{5,8}$')
     and m.lot_id is null`)).rows;

console.log("Se va a borrar:");
console.log(`  productos sin existencias ni ventas: ${productos.length}`);
for (const x of productos) console.log(`      · ${x.name} (${x.sku})`);
console.log(`  lotes sin nada colgando:             ${lotes.length}${lotes.length === 0 ? "  (los vacíos se quedan: su libro es real — ver cabecera)" : ""}`);
for (const x of lotes) console.log(`      · ${x.lot_number} · ${x.producto ?? "(sin producto)"}`);
console.log(`  movimientos de tecleo al azar:       ${movimientos.length}`);
for (const x of movimientos) console.log(`      · ${x.reference} · ${x.type} · ${x.quantity} · ${x.user_name}`);

if (!APLICAR) { console.log("\n(sin --apply) No se borró NADA."); await c.end(); process.exit(0); }

const carpeta = path.join(root, "docs/limpieza");
mkdirSync(carpeta, { recursive: true });
const sello = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const copia = path.join(carpeta, `borrado-restos-${sello}.json`);
writeFileSync(copia, JSON.stringify({ productos, lotes, movimientos }, null, 2), "utf8");
console.log(`\nCopia de seguridad: ${path.relative(root, copia)}`);

await c.query("begin");
try {
  // Orden por las claves foráneas: movimientos → lotes → productos.
  const m = movimientos.length
    ? await c.query(`delete from inventory_movements where id = any($1::uuid[]) returning id`, [movimientos.map((x) => x.id)])
    : { rowCount: 0 };
  const l = lotes.length
    ? await c.query(`delete from product_lots where id = any($1::uuid[]) returning id`, [lotes.map((x) => x.id)])
    : { rowCount: 0 };
  const p = productos.length
    ? await c.query(`delete from products where id = any($1::uuid[]) returning id`, [productos.map((x) => x.id)])
    : { rowCount: 0 };
  await c.query("commit");
  console.log(`\nBorrado: ${m.rowCount} movimientos · ${l.rowCount} lotes · ${p.rowCount} productos`);
} catch (e) {
  await c.query("rollback");
  console.error("\nFALLÓ y se deshizo TODO. No se borró nada:", e.message);
  process.exitCode = 1;
}
await c.end();
