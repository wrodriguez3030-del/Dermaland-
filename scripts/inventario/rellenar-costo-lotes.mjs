#!/usr/bin/env node
/**
 * Baja el costo del producto a los lotes que se quedaron sin él.
 *
 * El «Valor» que enseña Inventario es `unidades × costo unitario DEL LOTE`. La
 * migración del inventario de Alegra trajo los lotes y sus cantidades, pero no
 * el costo, así que 1 859 de 1 957 lotes quedaron en cero y la pantalla enseña
 * RD$0.00 teniendo mercancía real. El costo sí está: en `products.cost`.
 *
 * 🔴 Lo que esto NO es: el costo REAL de cada lote. Un lote comprado hace un año
 * pudo costar otra cosa. Esto pone el costo ACTUAL del producto, que sirve para
 * saber cuánto vale el inventario HOY, no para calcular la ganancia exacta de
 * una venta vieja. El costo real por lote solo sale de las facturas de compra.
 *
 * Nunca pisa un costo que ya exista: solo rellena los que están en cero o nulos.
 *
 *   node scripts/inventario/rellenar-costo-lotes.mjs            # simula
 *   node scripts/inventario/rellenar-costo-lotes.mjs --apply    # escribe
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const require = createRequire(path.join(RAIZ, "apps/web/package.json"));
const { Client } = require("pg");
const APPLY = process.argv.includes("--apply");

/**
 * 🔴 UN SOLO `where`, usado para contar Y para escribir.
 *
 * En el guion de vendedores, contar con un predicado y escribir con otro hizo
 * que la simulación informara «0 facturas» y el `--apply` tocara 14 743 filas
 * que nunca anunció. Aquí la condición vive en una sola constante para que eso
 * no pueda repetirse: si cambia, cambia para los dos.
 */
const DONDE = `
  from public.product_lots l
  join public.products p on p.id = l.product_id
  where coalesce(l.unit_cost, 0) = 0
    and coalesce(p.cost, 0) > 0
`;

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

const dinero = (n) =>
  "RD$" + Number(n).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const valorInventario = async () =>
  Number(
    (
      await c.query(
        `select coalesce(sum(current_quantity * coalesce(unit_cost, 0)), 0) v from public.product_lots`,
      )
    ).rows[0].v,
  );

await c.connect();
console.log(`\n${APPLY ? "▶ ESCRIBIENDO" : "🔍 simulación (sin --apply no escribe)"}\n`);

try {
  const antes = await valorInventario();

  // Lo que se va a tocar, contado con EL MISMO `where` que escribe.
  const { rows: [plan] } = await c.query(`
    select count(*)::int lotes,
           count(distinct l.product_id)::int productos,
           coalesce(sum(l.current_quantity * p.cost), 0) valor_que_suma
    ${DONDE}`);

  // Lo que se va a quedar fuera, y si duele.
  const { rows: [fuera] } = await c.query(`
    select count(*)::int lotes,
           coalesce(sum(l.current_quantity), 0)::int unidades
    from public.product_lots l
    join public.products p on p.id = l.product_id
    where coalesce(l.unit_cost, 0) = 0 and coalesce(p.cost, 0) = 0`);

  console.log(`  lotes a rellenar : ${plan.lotes} (de ${plan.productos} productos)`);
  console.log(`  valor que añaden : ${dinero(plan.valor_que_suma)}`);
  console.log(`  valor AHORA      : ${dinero(antes)}`);
  console.log(`  valor DESPUÉS    : ${dinero(antes + Number(plan.valor_que_suma))}\n`);
  console.log(`  se quedan en cero: ${fuera.lotes} lotes (${fuera.unidades} unidades) — su producto tampoco tiene costo\n`);

  // Guarda: un costo por encima del precio de venta significaría datos cruzados.
  const { rows: [raro] } = await c.query(
    `select count(*)::int n from public.products where coalesce(cost,0) > coalesce(price,0) and coalesce(price,0) > 0`,
  );
  if (raro.n > 0) {
    console.log(`  🔴 ${raro.n} productos tienen el costo POR ENCIMA del precio de venta.`);
    console.log(`     Eso apunta a datos cruzados. Revísalos antes de aplicar.\n`);
    if (APPLY) {
      console.log("  No se escribe nada. Corrige eso primero.\n");
      process.exitCode = 1;
      await c.end();
      process.exit();
    }
  } else {
    console.log("  ✓ ningún producto tiene el costo por encima de su precio de venta\n");
  }

  if (!APPLY) {
    console.log("Para escribirlo: node scripts/inventario/rellenar-costo-lotes.mjs --apply\n");
    await c.end();
    process.exit();
  }

  const { rowCount } = await c.query(`
    update public.product_lots l
       set unit_cost = p.cost, updated_at = now()
      from public.products p
     where p.id = l.product_id
       and coalesce(l.unit_cost, 0) = 0
       and coalesce(p.cost, 0) > 0`);

  const despues = await valorInventario();
  console.log(`  ${rowCount} lotes actualizados`);
  console.log(`  valor de inventario: ${dinero(antes)} → ${dinero(despues)}`);

  if (rowCount !== plan.lotes) {
    console.log(`\n  🔴 se anunciaron ${plan.lotes} y se escribieron ${rowCount}. Revísalo.`);
    process.exitCode = 1;
  } else {
    console.log("\n✓ guardado\n");
  }
} finally {
  await c.end();
}
