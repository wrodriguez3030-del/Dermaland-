#!/usr/bin/env node
/**
 * AUDITORÍA (solo lectura) de relaciones cliente↔ventas en Supabase.
 * NO modifica nada. Reporta:
 *  - totales de clientes y ventas
 *  - facturas y proformas sin customer_id
 *  - ventas con customer_id inválido (cliente inexistente = huérfanas)
 *  - matches posibles por documento / teléfono normalizados (únicos)
 *  - ambiguos (2+ clientes con la misma identidad)
 *  - clientes potencialmente duplicados entre sí (mismo doc/teléfono)
 *  - pares proforma↔factura sospechosos de DOBLE CONTEO (misma identidad,
 *    mismo total, factura posterior ≤45 días, sin enlace source_proforma_id)
 *
 * Uso:  node scripts/audit-customer-sales-relations.mjs
 * Salida: consola + data/customer-relations-audit.json
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
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Normalizadores — mismas reglas que features/customers/customer-normalization.ts
const normDoc = (v) => (v ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
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

async function fetchAll(basePath) {
  let out = [];
  for (let off = 0; ; off += 1000) {
    const page = await rest(`${basePath}&limit=1000&offset=${off}`);
    out = out.concat(page);
    if (page.length < 1000) break;
  }
  return out;
}

// ── 1. Datos ────────────────────────────────────────────────────────────────
const clients = await fetchAll(
  "/rest/v1/clients?select=id,customer_number,first_name,last_name,document_number,phone,email,deleted_at&order=created_at",
);
// source_proforma_id existe desde mig 0022; si aún no está aplicada, se
// audita igual (todas las ventas cuentan como no-enlazadas).
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

const activeClients = clients.filter((c) => !c.deleted_at);
const clientIds = new Set(clients.map((c) => c.id));
const byDoc = new Map();
const byPhone = new Map();
const byEmail = new Map();
for (const c of activeClients) {
  const d = normDoc(c.document_number);
  const p = normPhone(c.phone);
  const e = normEmail(c.email);
  if (d) byDoc.set(d, [...(byDoc.get(d) ?? []), c]);
  if (p) byPhone.set(p, [...(byPhone.get(p) ?? []), c]);
  if (e) byEmail.set(e, [...(byEmail.get(e) ?? []), c]);
}

// ── 2. Clientes duplicados entre sí ────────────────────────────────────────
const dupClients = [];
for (const [d, list] of byDoc) {
  if (list.length > 1)
    dupClients.push({ via: "documento", valor: d, clientes: list.map((c) => c.customer_number) });
}
for (const [p, list] of byPhone) {
  if (list.length > 1)
    dupClients.push({ via: "telefono", valor: p, clientes: list.map((c) => c.customer_number) });
}

// ── 3. Ventas: nulls, huérfanas, matches ────────────────────────────────────
const EXCLUDED = new Set(["cancelled", "draft", "expired", "voided"]);
const stats = {
  totalClientes: activeClients.length,
  clientesEliminados: clients.length - activeClients.length,
  totalVentas: sales.length,
  facturasSinCliente: 0,
  proformasSinCliente: 0,
  ventasHuerfanas: [], // customer_id apunta a cliente inexistente
  matchesPorDocumento: 0,
  matchesPorTelefono: 0,
  matchesPorEmail: 0, // proformas no guardan email → esperado 0
  ambiguas: 0,
  sinDatosWalkIn: 0,
  sinMatch: 0,
};
const proposedLinks = [];

for (const s of sales) {
  if (s.customer_id) {
    if (!clientIds.has(s.customer_id)) {
      stats.ventasHuerfanas.push({ number: s.number, customer_name: s.customer_name });
    }
    continue;
  }
  if (s.document_kind === "invoice") stats.facturasSinCliente++;
  else stats.proformasSinCliente++;

  const d = normDoc(s.customer_document);
  const p = normPhone(s.customer_phone);
  if (!d && !p) {
    stats.sinDatosWalkIn++;
    continue;
  }
  let matched = null;
  let via = null;
  if (d && byDoc.has(d)) {
    const cs = byDoc.get(d);
    if (cs.length === 1) [matched, via] = [cs[0], "matchesPorDocumento"];
    else { stats.ambiguas++; continue; }
  } else if (p && byPhone.has(p)) {
    const cs = byPhone.get(p);
    if (cs.length === 1) [matched, via] = [cs[0], "matchesPorTelefono"];
    else { stats.ambiguas++; continue; }
  }
  if (!matched) { stats.sinMatch++; continue; }
  stats[via]++;
  proposedLinks.push({
    saleNumber: s.number,
    saleId: s.id,
    cliente: matched.customer_number,
    via: via.replace("matchesPor", "").toLowerCase(),
  });
}

// ── 4. Posibles dobles conteos proforma↔factura ─────────────────────────────
// Misma identidad de cliente + mismo total + factura POSTERIOR (≤45 días) +
// proforma no anulada + sin enlace source_proforma_id todavía.
const DAYS45 = 45 * 24 * 60 * 60 * 1000;
const saleIdentity = (s) =>
  s.customer_id || normDoc(s.customer_document) || normPhone(s.customer_phone) || null;

const proformasPagadas = sales.filter(
  (s) =>
    s.document_kind !== "invoice" &&
    !EXCLUDED.has(s.status) &&
    ["paid", "partially_paid"].includes(s.status),
);
const facturas = sales.filter(
  (s) => s.document_kind === "invoice" && !EXCLUDED.has(s.status),
);
const linkedSourceIds = new Set(sales.map((s) => s.source_proforma_id).filter(Boolean));

const possibleDoubleCounts = [];
for (const prof of proformasPagadas) {
  if (linkedSourceIds.has(prof.id)) continue; // ya enlazada
  const idn = saleIdentity(prof);
  if (!idn) continue;
  const candidates = facturas.filter((f) => {
    if (f.source_proforma_id) return false;
    if (saleIdentity(f) !== idn) return false;
    if (Number(f.total) !== Number(prof.total)) return false;
    const dt = new Date(f.created_at) - new Date(prof.created_at);
    return dt >= 0 && dt <= DAYS45;
  });
  if (candidates.length > 0) {
    possibleDoubleCounts.push({
      proforma: prof.number,
      proformaId: prof.id,
      total: Number(prof.total),
      facturas: candidates.map((f) => ({ number: f.number, id: f.id })),
      unico: candidates.length === 1,
    });
  }
}

// ── 5. Reporte ──────────────────────────────────────────────────────────────
const report = {
  generadoEn: new Date().toISOString(),
  migracion0022Aplicada: migration0022,
  resumen: {
    ...stats,
    ventasHuerfanas: stats.ventasHuerfanas.length,
    clientesDuplicadosEntreSi: dupClients.length,
    posiblesDoblesConteos: possibleDoubleCounts.length,
    enlacesPropuestos: proposedLinks.length,
  },
  detalle: {
    ventasHuerfanas: stats.ventasHuerfanas,
    clientesDuplicados: dupClients,
    posiblesDoblesConteos: possibleDoubleCounts,
    enlacesPropuestos: proposedLinks,
  },
};

console.log("=== AUDITORÍA cliente↔ventas (solo lectura) ===");
console.log(JSON.stringify(report.resumen, null, 2));
if (dupClients.length) {
  console.log("\nClientes duplicados entre sí:");
  for (const d of dupClients.slice(0, 10))
    console.log(`  [${d.via}] ${d.valor}: ${d.clientes.join(", ")}`);
}
if (possibleDoubleCounts.length) {
  console.log("\nPosibles dobles conteos proforma↔factura:");
  for (const d of possibleDoubleCounts.slice(0, 10))
    console.log(
      `  ${d.proforma} (RD$${d.total}) ↔ ${d.facturas.map((f) => f.number).join(", ")}${d.unico ? " [único]" : " [ambiguo]"}`,
    );
}
if (proposedLinks.length) {
  console.log("\nEnlaces customer_id propuestos (primeros 15):");
  for (const u of proposedLinks.slice(0, 15))
    console.log(`  ${u.saleNumber} → ${u.cliente} (vía ${u.via})`);
}

mkdirSync(path.join(root, "data"), { recursive: true });
const outPath = path.join(root, "data", "customer-relations-audit.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`\nReporte completo: ${path.relative(root, outPath)}`);
console.log("Nada fue modificado (auditoría de solo lectura).");
