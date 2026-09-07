#!/usr/bin/env node
/**
 * Genera las comisiones del histórico migrado de Alegra, desde mayo de 2026.
 *
 * 🔴 POR QUÉ MAYO Y NO DESDE EL PRINCIPIO. Alegra no registró la forma de pago
 * hasta mayo de 2026: antes está en blanco en 12 672 de 14 750 facturas. Como
 * las reglas de la casa comisionan POR FORMA DE PAGO (3 % efectivo, 1 % tarjeta),
 * aplicarlas al histórico entero no repartía comisiones, repartía el azar de
 * cuándo alguien empezó a llenar ese campo: Desteny habría cobrado RD$128 mil y
 * Laura CERO, con RD$3,8 millones vendidos. El dueño eligió el corte del
 * 01/05/2026, que es desde donde el dato es fiable — en ese tramo, las 2 058
 * facturas tienen forma de pago, sin una sola excepción.
 *
 * 🔴 NO se insertan proformas. Las comisiones cuelgan de `alegra_invoice_id`
 * (ver `20260907220000_incentivos_desde_alegra.sql`): meter las facturas
 * migradas en `proformas` habría sido crear ventas fantasma en la caja en vivo.
 *
 * Repetible sin miedo: un índice único por (factura, regla) impide pagar dos
 * veces, y el guion salta las que ya existen.
 *
 *   node scripts/alegra/generar-comisiones-historico.mjs            # simula
 *   node scripts/alegra/generar-comisiones-historico.mjs --apply    # escribe
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const require = createRequire(path.join(RAIZ, "apps/web/package.json"));
const { Client } = require("pg");
const APPLY = process.argv.includes("--apply");
const BUSINESS = "00000000-0000-0000-0000-00000000d001";
const DESDE = "2026-05-01";

/**
 * Las formas de pago de Alegra, repartidas en los grupos de las reglas.
 *
 * `credit-sell` (venta a crédito) va al grupo de tarjeta y no al de efectivo: no
 * entró dinero en caja, así que premiarla al 3 % sería pagar por un cobro que
 * todavía no ocurrió.
 */
const GRUPO = {
  cash: "cash",
  "credit-card": "card",
  "debit-card": "card",
  "credit-sell": "card",
};

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
/** Redondeo a dos decimales en centavos enteros: nada de arrastres de coma flotante. */
const aDos = (n) => Math.round(Number(n) * 100) / 100;

await c.connect();
console.log(`\n${APPLY ? "▶ ESCRIBIENDO" : "🔍 simulación (sin --apply no escribe)"}  ·  desde ${DESDE}\n`);

try {
  const reglas = (
    await c.query(
      `select id, name, rule_type, percentage, payment_groups
         from public.sales_incentive_rules
        where business_id = $1 and active and deleted_at is null
        order by priority`,
      [BUSINESS],
    )
  ).rows;
  if (reglas.length === 0) {
    console.log("  🔴 no hay reglas activas. No se genera nada.\n");
    process.exitCode = 1;
    await c.end();
    process.exit();
  }
  /** grupo de pago → regla que le aplica. La primera por prioridad gana. */
  const reglaPorGrupo = new Map();
  for (const r of reglas) {
    for (const g of r.payment_groups ?? []) if (!reglaPorGrupo.has(g)) reglaPorGrupo.set(g, r);
    console.log(`  regla  «${r.name}»  ${r.percentage}%  grupos: ${(r.payment_groups ?? []).join(", ")}`);
  }

  const facturas = (
    await c.query(
      `select ai.id, ai.ncf, ai.date, ai.total, ai.payment_method, ai.seller_id,
              u.full_name as vendedor
         from public.alegra_invoices ai
         left join public.users u on u.id = ai.seller_id
        where ai.business_id = $1
          and ai.status not in ('void', 'draft')
          and ai.date >= $2
        order by ai.date`,
      [BUSINESS, DESDE],
    )
  ).rows;

  const yaHechas = new Set(
    (
      await c.query(
        `select alegra_invoice_id || '|' || rule_id as k
           from public.sales_incentives
          where business_id = $1 and alegra_invoice_id is not null`,
        [BUSINESS],
      )
    ).rows.map((r) => r.k),
  );

  const porVendedor = new Map();
  const nuevas = [];
  const saltadas = { sinVendedor: 0, sinRegla: 0, yaHecha: 0 };

  for (const f of facturas) {
    const grupo = GRUPO[f.payment_method ?? ""];
    const regla = grupo ? reglaPorGrupo.get(grupo) : undefined;
    if (!regla) { saltadas.sinRegla++; continue; }
    // 🔴 Sin vendedor no se genera: una comisión tiene que tener dueño. Estas
    // facturas se atan solas en la siguiente corrida del sync y entonces sí.
    if (!f.seller_id) { saltadas.sinVendedor++; continue; }
    if (yaHechas.has(`${f.id}|${regla.id}`)) { saltadas.yaHecha++; continue; }

    const monto = aDos((Number(f.total) * Number(regla.percentage)) / 100);
    nuevas.push({ f, regla, monto });
    const v = porVendedor.get(f.vendedor) ?? { n: 0, base: 0, com: 0 };
    v.n++; v.base += Number(f.total); v.com += monto;
    porVendedor.set(f.vendedor, v);
  }

  console.log(`\n  facturas en el tramo : ${facturas.length}`);
  console.log(`  se generarían        : ${nuevas.length}`);
  console.log(`  saltadas             : ${saltadas.sinRegla} sin forma de pago con regla · ${saltadas.sinVendedor} sin vendedor · ${saltadas.yaHecha} ya generadas\n`);

  let total = 0;
  for (const [v, d] of [...porVendedor.entries()].sort((a, b) => b[1].com - a[1].com)) {
    total += d.com;
    console.log(`  ${String(v).padEnd(20)} ${String(d.n).padStart(5)} ventas · base ${dinero(d.base).padStart(18)} → ${dinero(d.com)}`);
  }
  console.log(`\n  TOTAL A PAGAR: ${dinero(aDos(total))}`);

  if (saltadas.sinVendedor > 0) {
    console.log(`\n  ℹ ${saltadas.sinVendedor} facturas se quedan fuera por no tener vendedor atado.`);
    console.log("    La sincronización las ata sola; vuelve a correr esto después y entrarán.");
  }

  if (!APPLY) {
    console.log("\nPara escribirlo: node scripts/alegra/generar-comisiones-historico.mjs --apply\n");
    await c.end();
    process.exit();
  }

  await c.query("begin");
  let escritas = 0;
  for (const { f, regla, monto } of nuevas) {
    await c.query(
      `insert into public.sales_incentives
         (business_id, alegra_invoice_id, seller_id, seller_name, rule_id, rule_name, rule_type,
          base_amount, incentive_amount, status, earned_at, payment_method_group, note)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12)
       on conflict (alegra_invoice_id, rule_id) where alegra_invoice_id is not null do nothing`,
      [
        BUSINESS, f.id, f.seller_id, f.vendedor, regla.id, regla.name, regla.rule_type,
        f.total, monto, f.date, GRUPO[f.payment_method], `Histórico migrado de Alegra · ${f.ncf ?? ""}`,
      ],
    );
    escritas++;
  }

  if (escritas !== nuevas.length) {
    console.log(`\n  🔴 se anunciaron ${nuevas.length} y se escribieron ${escritas}. Se deshace todo.\n`);
    await c.query("rollback");
    process.exitCode = 1;
    await c.end();
    process.exit();
  }

  const comprobacion = await c.query(
    `select coalesce(sum(incentive_amount), 0) t, count(*)::int n
       from public.sales_incentives where business_id = $1 and alegra_invoice_id is not null`,
    [BUSINESS],
  );
  await c.query("commit");
  console.log(`\n  ${escritas} comisiones escritas`);
  console.log(`  total en la base: ${comprobacion.rows[0].n} filas · ${dinero(comprobacion.rows[0].t)}`);
  console.log("\n✓ guardado — quedan en estado «pendiente», listas para revisar y pagar\n");
} catch (e) {
  if (APPLY) await c.query("rollback").catch(() => {});
  console.error("\n  🔴 " + e.message + "\n  No se escribió nada.\n");
  process.exitCode = 1;
} finally {
  await c.end();
}
