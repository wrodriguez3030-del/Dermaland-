#!/usr/bin/env node
/**
 * AUDITORÍA (SOLO LECTURA) — Incentivos ↔ Comisión de ventas.
 *
 * NO modifica, NO borra, NO recalcula nada. Solo reporta el estado actual de
 * los DOS subsistemas para decidir la unificación con datos reales:
 *
 *   Incentivos (mig 0020): sales_incentive_rules, sales_incentives (snapshots)
 *   Comisión   (mig 0023): sales_commission_rules, commission_exclusions,
 *                          commission_payment_batches, commission_payouts,
 *                          commission_audit
 *
 * Reporta, por negocio:
 *   - reglas (incentivos vs comisión)
 *   - incentivos generados y su estado
 *   - ventas pagadas CON vendedor / SIN vendedor
 *   - incentivos duplicados por (sale_id, rule_id, product_id)
 *   - incentivos huérfanos (sale_id que no existe en proformas)
 *   - incentivos sin vendedor
 *   - lotes de pago y payouts de comisión (modelo por comprobante)
 *   - totales de importe por sistema (para comparación manual)
 *
 * Uso:  node scripts/audit-incentives-commissions.mjs
 * Salida: consola + data/incentives-commissions-audit.json
 *
 * Usa SUPABASE_SERVICE_ROLE_KEY de apps/web/.env.local. NUNCA imprime claves.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = readFileSync(path.join(root, "apps/web/.env.local"), "utf8");
const env = {};
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en apps/web/.env.local");
  process.exit(1);
}

async function rest(pathname) {
  const res = await fetch(URL_ + "/rest/v1" + pathname, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (res.status === 404) return { missing: true, rows: [] };
  if (!res.ok) throw new Error(`${pathname}: HTTP ${res.status} ${await res.text()}`);
  return { missing: false, rows: await res.json() };
}

/** Trae toda una tabla paginando. Devuelve {missing, rows}. */
async function fetchAll(table, select) {
  let out = [];
  for (let off = 0; ; off += 1000) {
    const r = await rest(`/${table}?select=${select}&limit=1000&offset=${off}`);
    if (r.missing) return { missing: true, rows: [] };
    out = out.concat(r.rows);
    if (r.rows.length < 1000) break;
  }
  return { missing: false, rows: out };
}

const money = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
const PAID = new Set(["paid", "partially_paid", "issued", "converted_to_ecf"]);

console.log("🔎 Auditoría Incentivos ↔ Comisión (solo lectura)\n");

// ── Fetch de ambos subsistemas + ventas ──────────────────────────────────────
const incRules = await fetchAll("sales_incentive_rules", "id,business_id,name,rule_type,active,deleted_at");
const incentives = await fetchAll(
  "sales_incentives",
  "id,business_id,sale_id,seller_id,seller_name,rule_id,rule_name,product_id,base_amount,incentive_amount,status,payment_batch_id",
);
const commRules = await fetchAll("sales_commission_rules", "id,business_id,name,percentage,active");
const commExclusions = await fetchAll("commission_exclusions", "id,business_id,comprobante");
const commBatches = await fetchAll("commission_payment_batches", "id,business_id,seller_id,total,status");
const commPayouts = await fetchAll("commission_payouts", "id,business_id,comprobante,status,batch_id");
const commAudit = await fetchAll("commission_audit", "id,business_id,action,amount");
const sales = await fetchAll(
  "proformas",
  "id,business_id,seller_id,seller_name,status,subtotal,discount,total",
);

for (const [name, r] of Object.entries({
  sales_incentive_rules: incRules,
  sales_incentives: incentives,
  sales_commission_rules: commRules,
  commission_exclusions: commExclusions,
  commission_payment_batches: commBatches,
  commission_payouts: commPayouts,
  commission_audit: commAudit,
  proformas: sales,
})) {
  console.log(`  ${r.missing ? "⚠️  (no existe)" : "✅"} ${name}: ${r.rows.length}`);
}
console.log("");

const saleById = new Map(sales.rows.map((s) => [s.id, s]));
const businesses = new Set([
  ...incentives.rows.map((i) => i.business_id),
  ...commRules.rows.map((c) => c.business_id),
  ...sales.rows.map((s) => s.business_id),
]);

// ── Análisis global ───────────────────────────────────────────────────────────
const dupKey = (i) => `${i.sale_id}|${i.rule_id}|${i.product_id ?? "∅"}`;
const dupMap = new Map();
for (const i of incentives.rows) {
  const k = dupKey(i);
  dupMap.set(k, (dupMap.get(k) ?? 0) + 1);
}
const duplicates = [...dupMap.entries()].filter(([, n]) => n > 1);

const orphanIncentives = incentives.rows.filter((i) => i.sale_id && !saleById.has(i.sale_id));
const incentivesNoSeller = incentives.rows.filter((i) => !i.seller_id);
const paidSales = sales.rows.filter((s) => PAID.has(s.status));
const paidWithSeller = paidSales.filter((s) => s.seller_id);
const paidNoSeller = paidSales.filter((s) => !s.seller_id);

const byStatus = {};
for (const i of incentives.rows) byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;

const totalIncentiveAmount = money(
  incentives.rows.filter((i) => i.status !== "void").reduce((s, i) => s + Number(i.incentive_amount || 0), 0),
);
const totalPaidIncentive = money(
  incentives.rows.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.incentive_amount || 0), 0),
);
const totalBatchAmount = money(
  commBatches.rows.filter((b) => b.status === "paid").reduce((s, b) => s + Number(b.total || 0), 0),
);

const report = {
  generatedAtNote: "read-only; sin fecha embebida por reproducibilidad",
  supabaseHost: URL_.replace(/^https?:\/\//, "").split(".")[0],
  tables: Object.fromEntries(
    Object.entries({
      sales_incentive_rules: incRules,
      sales_incentives: incentives,
      sales_commission_rules: commRules,
      commission_exclusions: commExclusions,
      commission_payment_batches: commBatches,
      commission_payouts: commPayouts,
      commission_audit: commAudit,
      proformas: sales,
    }).map(([k, v]) => [k, { exists: !v.missing, count: v.rows.length }]),
  ),
  businessCount: businesses.size,
  incentives: {
    total: incentives.rows.length,
    byStatus,
    withoutSeller: incentivesNoSeller.length,
    orphans: orphanIncentives.length,
    duplicateKeys: duplicates.length,
    duplicateSamples: duplicates.slice(0, 10).map(([k, n]) => ({ key: k, count: n })),
    totalAmountNonVoid: totalIncentiveAmount,
    totalPaidAmount: totalPaidIncentive,
  },
  commission: {
    rules: commRules.rows.length,
    exclusions: commExclusions.rows.length,
    payouts: commPayouts.rows.length,
    batches: commBatches.rows.length,
    batchesPaidTotal: totalBatchAmount,
    audit: commAudit.rows.length,
  },
  sales: {
    total: sales.rows.length,
    paid: paidSales.length,
    paidWithSeller: paidWithSeller.length,
    paidWithoutSeller: paidNoSeller.length,
  },
  rulesDivergence: {
    incentiveRulesActive: incRules.rows.filter((r) => r.active && !r.deleted_at).length,
    commissionRulesActive: commRules.rows.filter((r) => r.active).length,
    note:
      "Reglas viven en DOS tablas distintas: sales_incentive_rules (6 tipos) vs " +
      "sales_commission_rules (% por método/sucursal/vendedor). La unificación " +
      "debe elegir UNA fuente canónica (recomendado: sales_incentive_rules).",
  },
};

console.log("── Resumen ─────────────────────────────────────────────");
console.log(`Negocios con datos:              ${report.businessCount}`);
console.log(`Ventas totales / pagadas:        ${report.sales.total} / ${report.sales.paid}`);
console.log(`  · pagadas CON vendedor:        ${report.sales.paidWithSeller}`);
console.log(`  · pagadas SIN vendedor:        ${report.sales.paidWithoutSeller}`);
console.log("");
console.log(`Incentivos (snapshots):          ${report.incentives.total}`);
console.log(`  · por estado:                  ${JSON.stringify(byStatus)}`);
console.log(`  · sin vendedor:                ${report.incentives.withoutSeller}`);
console.log(`  · huérfanos (venta inexistente): ${report.incentives.orphans}`);
console.log(`  · claves duplicadas:           ${report.incentives.duplicateKeys}`);
console.log(`  · importe total (no anulado):  RD$${report.incentives.totalAmountNonVoid}`);
console.log(`  · importe pagado:              RD$${report.incentives.totalPaidAmount}`);
console.log("");
console.log(`Comisión — reglas:               ${report.commission.rules}`);
console.log(`Comisión — exclusiones:          ${report.commission.exclusions}`);
console.log(`Comisión — payouts (comprobante): ${report.commission.payouts}`);
console.log(`Comisión — lotes de pago:        ${report.commission.batches} (pagados RD$${report.commission.batchesPaidTotal})`);
console.log(`Comisión — auditoría:            ${report.commission.audit}`);
console.log("");
console.log("── Banderas para la unificación ────────────────────────");
if (report.incentives.duplicateKeys > 0)
  console.log(`⚠️  ${report.incentives.duplicateKeys} claves de incentivo duplicadas (revisar idempotencia).`);
else console.log("✅ Sin incentivos duplicados por (sale_id, rule_id, product_id).");
if (report.incentives.orphans > 0)
  console.log(`⚠️  ${report.incentives.orphans} incentivos sin venta asociada (huérfanos).`);
else console.log("✅ Todos los incentivos referencian una venta existente.");
if (report.incentives.withoutSeller > 0)
  console.log(`⚠️  ${report.incentives.withoutSeller} incentivos sin vendedor.`);
console.log(
  `ℹ️  Reglas en dos tablas: ${report.rulesDivergence.incentiveRulesActive} incentivo(s) activas vs ${report.rulesDivergence.commissionRulesActive} comisión activas.`,
);

mkdirSync(path.join(root, "data"), { recursive: true });
const outPath = path.join(root, "data/incentives-commissions-audit.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`\n📄 Reporte guardado en ${path.relative(root, outPath)}`);
console.log("Sin cambios en la base de datos (solo lectura).");
