#!/usr/bin/env node
/**
 * Backfill SEGURO: enlaza ventas/facturas sin customer_id al cliente
 * correcto usando identidad confiable (documento → teléfono → email).
 *
 *   node scripts/backfill-invoice-customers.mjs           # dry-run (default)
 *   node scripts/backfill-invoice-customers.mjs --apply   # aplica los enlaces
 *
 * Reglas:
 *  - Solo toca ventas con customer_id NULL (nunca re-asigna un id existente).
 *  - Match por documento exacto normalizado (solo dígitos), luego teléfono
 *    normalizado (ignora prefijo 1), luego email lowercase; nombre NO se usa
 *    salvo match único exacto y con datos de contacto vacíos en ambos lados.
 *  - Walk-in / consumidor final sin datos de contacto se deja intacto.
 *  - Ambigüedades (2+ clientes posibles) se reportan y NO se tocan.
 *  - NUNCA borra nada. Usa SUPABASE_SERVICE_ROLE_KEY de apps/web/.env.local.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = readFileSync(path.join(root, "apps/web/.env.local"), "utf8");
const env = {};
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");

const normDoc = (v) => (v ?? "").replace(/\D/g, "");
const normPhone = (v) => {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
};
const normEmail = (v) => (v ?? "").trim().toLowerCase();

async function rest(pathname, opts = {}) {
  const res = await fetch(URL_ + pathname, {
    ...opts,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${pathname}: HTTP ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// 1. Clientes indexados por identidad normalizada.
const clients = await rest(
  "/rest/v1/clients?select=id,first_name,last_name,document_number,phone,email&limit=10000",
);
const byDoc = new Map();
const byPhone = new Map();
const byEmail = new Map();
for (const c of clients) {
  const d = normDoc(c.document_number);
  const p = normPhone(c.phone);
  const e = normEmail(c.email);
  if (d) byDoc.set(d, [...(byDoc.get(d) ?? []), c]);
  if (p) byPhone.set(p, [...(byPhone.get(p) ?? []), c]);
  if (e) byEmail.set(e, [...(byEmail.get(e) ?? []), c]);
}

// 2. Ventas sin customer_id (paginado).
let sales = [];
for (let off = 0; ; off += 1000) {
  const page = await rest(
    `/rest/v1/proformas?select=id,number,customer_name,customer_document,customer_phone&customer_id=is.null&order=created_at&limit=1000&offset=${off}`,
  );
  sales = sales.concat(page);
  if (page.length < 1000) break;
}

const report = {
  revisadas: sales.length,
  porDocumento: 0,
  porTelefono: 0,
  porEmail: 0,
  sinDatos: 0,
  ambiguas: 0,
  sinMatch: 0,
};
const updates = [];

for (const s of sales) {
  const d = normDoc(s.customer_document);
  const p = normPhone(s.customer_phone);
  if (!d && !p) {
    report.sinDatos++; // walk-in / consumidor final: no tocar
    continue;
  }
  let match = null;
  let via = null;
  if (d && byDoc.has(d)) {
    const cs = byDoc.get(d);
    if (cs.length === 1) {
      match = cs[0];
      via = "porDocumento";
    } else {
      report.ambiguas++;
      continue;
    }
  } else if (p && byPhone.has(p)) {
    const cs = byPhone.get(p);
    if (cs.length === 1) {
      match = cs[0];
      via = "porTelefono";
    } else {
      report.ambiguas++;
      continue;
    }
  }
  if (!match) {
    report.sinMatch++;
    continue;
  }
  report[via]++;
  updates.push({ saleId: s.id, number: s.number, customerId: match.id, via });
}

console.log(`Modo: ${APPLY ? "APPLY" : "dry-run"}`);
console.log("Reporte:", JSON.stringify(report, null, 2));
for (const u of updates.slice(0, 20)) {
  console.log(`  ${u.number} → cliente vía ${u.via}`);
}

if (APPLY && updates.length > 0) {
  let applied = 0;
  for (const u of updates) {
    await rest(`/rest/v1/proformas?id=eq.${u.saleId}`, {
      method: "PATCH",
      body: JSON.stringify({ customer_id: u.customerId }),
    });
    applied++;
  }
  console.log(`Aplicados: ${applied} enlaces.`);
} else if (updates.length > 0) {
  console.log("Dry-run: nada modificado. Corre con --apply para enlazar.");
} else {
  console.log("Nada que enlazar.");
}
