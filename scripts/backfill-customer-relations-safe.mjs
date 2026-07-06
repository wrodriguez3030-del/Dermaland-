#!/usr/bin/env node
/**
 * BACKFILL SEGURO de relaciones cliente↔ventas. Dry-run por defecto.
 *
 *   node scripts/backfill-customer-relations-safe.mjs                    # dry-run
 *   node scripts/backfill-customer-relations-safe.mjs --apply            # enlaza customer_id
 *   node scripts/backfill-customer-relations-safe.mjs --apply --link-conversions
 *       # además enlaza pares proforma→factura ÚNICOS e inequívocos
 *       # (source_proforma_id) para eliminar el doble conteo
 *
 * Reglas (idénticas a la auditoría):
 *  1. Solo ventas con customer_id NULL — nunca re-asigna un id existente.
 *  2. Match por documento normalizado; si no, teléfono normalizado; nombre NO
 *     se usa. Ambiguos (2+ clientes) NO se tocan.
 *  3. Walk-in / consumidor final sin datos NO se toca.
 *  4. Conversiones: solo pares 1:1 (misma identidad, mismo total, factura
 *     posterior ≤45 días, sin enlace previo). Pares ambiguos NO se tocan.
 *  5. NUNCA borra nada. Auditoría completa en data/customer-relations-backfill-log.json.
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
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");
const LINK_CONVERSIONS = process.argv.includes("--link-conversions");

const normDoc = (v) => (v ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
const normPhone = (v) => {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
};

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

async function fetchAll(basePath) {
  let out = [];
  for (let off = 0; ; off += 1000) {
    const page = await rest(`${basePath}&limit=1000&offset=${off}`);
    out = out.concat(page);
    if (page.length < 1000) break;
  }
  return out;
}

const clients = await fetchAll(
  "/rest/v1/clients?select=id,customer_number,document_number,phone,email&deleted_at=is.null&order=created_at",
);
// source_proforma_id requiere mig 0022; sin ella el backfill de customer_id
// funciona igual, pero --link-conversions queda bloqueado.
let migration0022 = true;
let sales;
try {
  sales = await fetchAll(
    "/rest/v1/proformas?select=id,number,customer_id,customer_name,customer_document,customer_phone,document_kind,status,total,source_proforma_id,created_at&order=created_at",
  );
} catch {
  migration0022 = false;
  sales = (
    await fetchAll(
      "/rest/v1/proformas?select=id,number,customer_id,customer_name,customer_document,customer_phone,document_kind,status,total,created_at&order=created_at",
    )
  ).map((s) => ({ ...s, source_proforma_id: null }));
}
if (LINK_CONVERSIONS && !migration0022) {
  console.error(
    "--link-conversions requiere la migración 0022 (source_proforma_id). Aplícala primero.",
  );
  process.exit(1);
}

const byDoc = new Map();
const byPhone = new Map();
for (const c of clients) {
  const d = normDoc(c.document_number);
  const p = normPhone(c.phone);
  if (d) byDoc.set(d, [...(byDoc.get(d) ?? []), c]);
  if (p) byPhone.set(p, [...(byPhone.get(p) ?? []), c]);
}

// ── Fase 1: customer_id para ventas sin cliente ─────────────────────────────
const report = {
  modo: APPLY ? "APPLY" : "dry-run",
  linkConversions: LINK_CONVERSIONS,
  revisadas: 0,
  porDocumento: 0,
  porTelefono: 0,
  walkInSinDatos: 0,
  ambiguas: 0,
  sinMatch: 0,
};
const customerLinks = [];

for (const s of sales) {
  if (s.customer_id) continue;
  report.revisadas++;
  const d = normDoc(s.customer_document);
  const p = normPhone(s.customer_phone);
  if (!d && !p) {
    report.walkInSinDatos++;
    continue;
  }
  let match = null;
  let via = null;
  if (d && byDoc.has(d)) {
    const cs = byDoc.get(d);
    if (cs.length === 1) [match, via] = [cs[0], "porDocumento"];
    else { report.ambiguas++; continue; }
  } else if (p && byPhone.has(p)) {
    const cs = byPhone.get(p);
    if (cs.length === 1) [match, via] = [cs[0], "porTelefono"];
    else { report.ambiguas++; continue; }
  }
  if (!match) { report.sinMatch++; continue; }
  report[via]++;
  customerLinks.push({
    saleId: s.id,
    number: s.number,
    customerId: match.id,
    cliente: match.customer_number,
    via,
  });
}

// ── Fase 2: enlaces proforma→factura (solo pares 1:1 inequívocos) ───────────
const EXCLUDED = new Set(["cancelled", "draft", "expired", "voided"]);
const DAYS45 = 45 * 24 * 60 * 60 * 1000;
const identity = (s) =>
  s.customer_id || normDoc(s.customer_document) || normPhone(s.customer_phone) || null;

const linkedSourceIds = new Set(sales.map((s) => s.source_proforma_id).filter(Boolean));
const proformasPagadas = sales.filter(
  (s) =>
    s.document_kind !== "invoice" &&
    ["paid", "partially_paid"].includes(s.status) &&
    !linkedSourceIds.has(s.id),
);
const facturas = sales.filter(
  (s) => s.document_kind === "invoice" && !EXCLUDED.has(s.status) && !s.source_proforma_id,
);

const conversionLinks = [];
const usedInvoices = new Set();
for (const prof of proformasPagadas) {
  const idn = identity(prof);
  if (!idn) continue;
  const candidates = facturas.filter((f) => {
    if (usedInvoices.has(f.id)) return false;
    if (identity(f) !== idn) return false;
    if (Number(f.total) !== Number(prof.total)) return false;
    const dt = new Date(f.created_at) - new Date(prof.created_at);
    return dt >= 0 && dt <= DAYS45;
  });
  // SOLO pares únicos e inequívocos (1 proforma ↔ 1 factura).
  if (candidates.length === 1) {
    usedInvoices.add(candidates[0].id);
    conversionLinks.push({
      proforma: prof.number,
      proformaId: prof.id,
      factura: candidates[0].number,
      facturaId: candidates[0].id,
      total: Number(prof.total),
    });
  }
}

report.enlacesCustomerId = customerLinks.length;
report.enlacesConversionUnicos = conversionLinks.length;

console.log("=== BACKFILL SEGURO cliente↔ventas ===");
console.log(JSON.stringify(report, null, 2));
for (const u of customerLinks.slice(0, 15))
  console.log(`  customer_id: ${u.number} → ${u.cliente} (${u.via})`);
for (const c of conversionLinks.slice(0, 15))
  console.log(`  conversión:  ${c.factura}.source_proforma_id → ${c.proforma} (RD$${c.total})`);

// ── Aplicar (solo con --apply) ──────────────────────────────────────────────
const applied = { customerId: 0, conversions: 0 };
if (APPLY) {
  for (const u of customerLinks) {
    // Guard: solo si sigue NULL (nunca pisar un enlace existente).
    await rest(`/rest/v1/proformas?id=eq.${u.saleId}&customer_id=is.null`, {
      method: "PATCH",
      body: JSON.stringify({ customer_id: u.customerId }),
    });
    applied.customerId++;
  }
  if (LINK_CONVERSIONS) {
    for (const c of conversionLinks) {
      await rest(
        `/rest/v1/proformas?id=eq.${c.facturaId}&source_proforma_id=is.null`,
        {
          method: "PATCH",
          body: JSON.stringify({ source_proforma_id: c.proformaId }),
        },
      );
      applied.conversions++;
    }
  }
  console.log(`\nAplicado: ${applied.customerId} customer_id · ${applied.conversions} conversiones.`);
} else {
  console.log("\nDry-run: nada modificado. Usa --apply para aplicar.");
}

// ── Auditoría persistente ───────────────────────────────────────────────────
mkdirSync(path.join(root, "data"), { recursive: true });
const logPath = path.join(root, "data", "customer-relations-backfill-log.json");
let log = [];
try {
  log = JSON.parse(readFileSync(logPath, "utf8"));
} catch {
  /* primer log */
}
log.push({
  fecha: new Date().toISOString(),
  ...report,
  aplicado: applied,
  customerLinks,
  conversionLinks,
});
writeFileSync(logPath, JSON.stringify(log, null, 2));
console.log(`Auditoría: ${path.relative(root, logPath)}`);
