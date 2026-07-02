#!/usr/bin/env node
/**
 * verify-invoice-document-types.mjs — DIAGNÓSTICO (solo lectura, dry-run).
 *
 * Reporta documentos de venta cuyo tipo pueda estar inconsistente. NO escribe
 * nada, NO borra, NO toca DGII/producción fiscal.
 *
 * Clasificación esperada (misma que la app en features/sales/document-label.ts):
 *   - document_kind = invoice + ecf_type presente  → e-CF  (número debe empezar con E)
 *   - document_kind = invoice sin ecf_type         → NCF   (número debe empezar con B)
 *   - resto                                        → proforma (número PROF-...)
 *
 * Marca:
 *   - número empieza con B pero tiene ecf_type      (se mostraría como e-CF por error)
 *   - número empieza con E pero NO tiene ecf_type   (e-CF sin tipo)
 *   - proforma con número B/E
 *   - totales inconsistentes: |subtotal - discount + itbis - total| > 0.01
 *
 * Uso:  node scripts/verify-invoice-document-types.mjs
 * Requiere en apps/web/.env.local: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = join(__dirname, "..", "apps", "web", ".env.local");
  const env = {};
  try {
    for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    console.error("No se pudo leer apps/web/.env.local");
  }
  return env;
}

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function fetchAll() {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const res = await fetch(
      `${URL}/rest/v1/proformas?select=id,number,ecf_number,document_kind,ecf_type,subtotal,discount,itbis,total`,
      {
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          Range: `${from}-${from + pageSize - 1}`,
        },
      },
    );
    if (!res.ok) {
      console.error(`Error REST ${res.status}: ${await res.text()}`);
      process.exit(1);
    }
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

const rows = await fetchAll();
const issues = [];
for (const r of rows) {
  const number = (r.ecf_number ?? r.number ?? "").toUpperCase();
  const isInvoice = r.document_kind === "invoice";
  const hasEcfType = r.ecf_type != null && r.ecf_type !== "";
  if (isInvoice && number.startsWith("B") && hasEcfType) {
    issues.push({ id: r.id, number, tipo: "NCF-con-ecf_type (se vería como e-CF)" });
  }
  if (isInvoice && number.startsWith("E") && !hasEcfType) {
    issues.push({ id: r.id, number, tipo: "eCF-sin-ecf_type" });
  }
  if (!isInvoice && /^[BE]\d/.test(number)) {
    issues.push({ id: r.id, number, tipo: "proforma-con-numero-fiscal" });
  }
  const diff = round2(Number(r.subtotal) - Number(r.discount) + Number(r.itbis) - Number(r.total));
  if (Math.abs(diff) > 0.01) {
    issues.push({ id: r.id, number, tipo: `totales-inconsistentes (dif ${diff})` });
  }
}

console.log(`Documentos revisados: ${rows.length}`);
console.log(`Inconsistencias: ${issues.length}`);
for (const i of issues) console.log(` - ${i.number} [${i.id}] → ${i.tipo}`);
if (issues.length === 0) console.log("✓ Sin inconsistencias de tipo de documento ni de totales.");
