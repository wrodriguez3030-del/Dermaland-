#!/usr/bin/env node
/**
 * Backup de DATOS vía REST (service_role) — funciona SIN pg_dump ni CLI.
 *
 * Exporta todas las tablas de `public` a JSON en backups/<stamp>/<tabla>.json + un
 * manifest.json con conteos. Es una copia LÓGICA de DATOS: combinada con las
 * migraciones del repo (`supabase/migrations/*`, que traen el esquema + funciones +
 * RLS) da una ruta de recuperación completa:
 *   proyecto Supabase nuevo → aplicar migraciones → importar estos JSON.
 *
 * Limitaciones vs pg_dump: no captura `auth.users` (cuentas de login), Storage, ni
 * el estado exacto de secuencias. Para el piloto preserva TODOS los datos de negocio.
 * El backup COMPLETO (pg_dump) corre en CI (.github/workflows/backup.yml) cuando se
 * configura el secreto SUPABASE_DB_URL.
 *
 * Uso: node scripts/backup/rest-json-backup.mjs
 * Lee apps/web/.env.local (service_role). Escribe a backups/ (gitignored). NUNCA
 * imprime datos ni claves — solo conteos.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

const env = {};
for (const line of readFileSync(path.join(root, "apps/web/.env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SRK) { console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

// Tablas de `public` (regenerar con: select table_name from information_schema.tables
// where table_schema='public' and table_type='BASE TABLE').
const TABLES = [
  "ai_agent_provider_bindings", "ai_provider_secrets", "ai_providers", "ai_usage_logs",
  "audit_logs", "branches", "brands", "businesses", "cash_closing_percentage_logs",
  "cash_closing_sales", "cash_closings", "cash_movements", "cash_register_sessions",
  "cash_registers", "clients", "commission_audit", "commission_exclusions",
  "commission_payment_batch_items", "commission_payment_batches", "commission_payouts",
  "dgii_certificates", "dgii_commercial_approvals", "dgii_received_ecf", "dgii_settings",
  "dgii_status_logs", "dgii_submissions", "ecf_sequences", "electronic_invoice_items",
  "electronic_invoices", "inventory_count_evidence", "inventory_count_items",
  "inventory_count_scans", "inventory_count_sync_logs", "inventory_counts",
  "inventory_movements", "invoice_numberings", "laboratories", "lot_quarantine",
  "lot_recalls", "payment_methods", "permissions", "plans", "platform_users",
  "product_categories", "product_lots", "products", "proforma_items", "proforma_payments",
  "proforma_to_ecf_logs", "proformas", "role_permissions", "roles",
  "sales_commission_rules", "sales_incentive_rules", "sales_incentives", "users", "warehouses",
];

const admin = createClient(URL_, SRK, { auth: { persistSession: false } });
const PAGE = 1000;

// Timestamp del sistema (script de shell; válido aquí).
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const outDir = path.join(root, "backups", `rest-${stamp}`);
mkdirSync(outDir, { recursive: true });

async function dumpTable(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from(table).select("*").range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(rows));
  return rows.length;
}

async function run() {
  console.log(`Backup REST → ${outDir}`);
  const manifest = { generatedAt: now.toISOString(), tables: {} };
  let total = 0, failed = 0;
  for (const t of TABLES) {
    try {
      const n = await dumpTable(t);
      manifest.tables[t] = n;
      total += n;
      console.log(`  ${t}: ${n}`);
    } catch (e) {
      failed++;
      manifest.tables[t] = `ERROR: ${e.message}`;
      console.log(`  ❌ ${t}: ${e.message}`);
    }
  }
  writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\n✅ ${TABLES.length - failed}/${TABLES.length} tablas, ${total} filas totales.`);
  console.log("Copiá la carpeta a un almacenamiento EXTERNO cifrado. Contiene datos reales (PII).");
  process.exit(failed === 0 ? 0 : 1);
}
run().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
