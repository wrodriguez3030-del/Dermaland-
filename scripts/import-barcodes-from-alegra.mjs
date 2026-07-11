#!/usr/bin/env node
/**
 * Importa códigos de barra (EAN-13) desde un export de Alegra a la tabla
 * `products` de Supabase, emparejando por NOMBRE normalizado.
 *
 * REGLAS DE SEGURIDAD (no negociables):
 *  - Solo UPDATE de productos EXISTENTES cuyo `barcode` está NULL. Nunca crea
 *    productos (no duplica) ni sobrescribe barcodes ya asignados.
 *  - Solo aplica matches de ALTA CONFIANZA: nombre exacto tras normalizar
 *    (mayúsculas, sin acentos, unidad pegada "30 ML"→"30ML", "SPF 50"→"SPF50")
 *    Y dígito de control EAN-13 válido. Un mismo nombre que empareja 2+
 *    productos, o 2 filas del Excel que empatan al mismo producto, se descartan.
 *  - UPC-12 (12 dígitos) se guardan como EAN-13 con un "0" adelante (convención
 *    de la casa: todos los barcodes son de 13 dígitos).
 *
 * El Excel debe tener 2 columnas: "Nombre" y "Código de barra (EAN-13)".
 *
 * Uso:
 *   node scripts/import-barcodes-from-alegra.mjs "<archivo.xlsx>"            # DRY-RUN (no escribe)
 *   node scripts/import-barcodes-from-alegra.mjs "<archivo.xlsx>" --apply    # aplica los UPDATE
 *
 * Salida: consola + data/barcode-import-<fecha>/*.json
 * Usa SUPABASE_SERVICE_ROLE_KEY de apps/web/.env.local. NUNCA imprime claves.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// exceljs vive en apps/web/node_modules
const require = createRequire(path.join(root, "apps/web/package.json"));
const ExcelJS = require("exceljs");

const XLSX = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!XLSX) {
  console.error('Uso: node scripts/import-barcodes-from-alegra.mjs "<archivo.xlsx>" [--apply]');
  process.exit(1);
}

const env = {};
for (const line of readFileSync(path.join(root, "apps/web/.env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// ── normalización ──
const UNITS = "ML|MG|GR|G|KG|L|CC|OZ|UI|CAPS|CAP|TABLETAS|TABLETA|TABS|TAB|COMP|SOBRES|SOBRE|UND|UD|EN";
function norm(raw) {
  let s = String(raw ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  s = s.replace(/[^A-Z0-9+%.\s]/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(new RegExp(`(\\d)\\s+(${UNITS})\\b`, "g"), "$1$2").replace(/SPF\s+(\d)/g, "SPF$1");
  return s.replace(/\s+/g, " ").trim();
}
function ean13ok(c) {
  if (!/^\d{13}$/.test(c)) return false;
  const d = c.split("").map(Number);
  let s = 0;
  for (let i = 0; i < 12; i++) s += d[i] * (i % 2 === 0 ? 1 : 3);
  return ((10 - (s % 10)) % 10) === d[12];
}

// ── leer Excel ──
function cellText(v) {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("result" in v) return String(v.result ?? "");
    if ("text" in v) return String(v.text ?? "");
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
  }
  return String(v);
}
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX);
const ws = wb.worksheets[0];
const excel = [];
for (let r = 2; r <= ws.rowCount; r++) {
  const name = cellText(ws.getRow(r).getCell(1).value).trim();
  const bc = cellText(ws.getRow(r).getCell(2).value).replace(/\D/g, "");
  if (name || bc) excel.push({ row: r, name, barcode: bc });
}

// ── traer productos activos ──
async function fetchAll() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${URL_}/rest/v1/products?deleted_at=is.null&select=id,sku,name,barcode`, {
      headers: { ...headers, Range: `${from}-${from + 999}`, Prefer: "count=exact" },
    });
    if (!res.ok) throw new Error(`GET products: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
const products = await fetchAll();
const byNorm = new Map();
const barcodeOwner = new Map();
for (const p of products) {
  const nk = norm(p.name);
  (byNorm.get(nk) ?? byNorm.set(nk, []).get(nk)).push(p);
  if (p.barcode) barcodeOwner.set(String(p.barcode).replace(/\D/g, ""), p);
}

// ── emparejar ──
const plan = [], review = [], noMatch = [];
const assigned = new Map();
for (const e of excel) {
  if (!e.barcode) { review.push({ ...e, reason: "sin_barcode_en_excel" }); continue; }
  if (e.barcode.length !== 12 && e.barcode.length !== 13) {
    review.push({ ...e, reason: `ean_longitud_invalida(${e.barcode.length})` }); continue;
  }
  const c13 = e.barcode.length === 12 ? "0" + e.barcode : e.barcode;
  if (!ean13ok(c13)) { review.push({ ...e, reason: "check_digit_invalido", c13 }); continue; }
  const cands = byNorm.get(norm(e.name));
  if (!cands) { noMatch.push({ ...e }); continue; }
  if (cands.length > 1) { review.push({ ...e, reason: "multiple_productos", dbNames: cands.map((c) => c.name) }); continue; }
  const p = cands[0];
  const owner = barcodeOwner.get(e.barcode) || barcodeOwner.get(c13);
  if (owner && owner.id !== p.id) { review.push({ ...e, reason: "barcode_ya_usado_por_otro", dbOwner: owner.name }); continue; }
  if (p.barcode) { if (p.barcode.replace(/\D/g, "") !== c13) review.push({ ...e, reason: "producto_ya_tiene_otro_barcode", dbBarcode: p.barcode }); continue; }
  if (assigned.has(p.id)) { review.push({ ...e, reason: "producto_asignado_por_2_filas", dbName: p.name }); continue; }
  assigned.set(p.id, e);
  plan.push({ id: p.id, sku: p.sku, name: p.name, excelName: e.name, barcode: c13 });
}

// ── salida ──
const stamp = new Date().toISOString().slice(0, 10);
const outDir = path.join(root, `data/barcode-import-${stamp}`);
mkdirSync(outDir, { recursive: true });
const summary = {
  fecha: stamp, aplicado: APPLY,
  excelFilas: excel.length, productosActivos: products.length,
  planAsignaciones: plan.length, paraRevisar: review.length, sinMatch: noMatch.length,
};
writeFileSync(path.join(outDir, "barcode-plan.json"), JSON.stringify(plan, null, 2));
writeFileSync(path.join(outDir, "barcode-review.json"), JSON.stringify({ review, noMatch }, null, 2));
writeFileSync(path.join(outDir, "barcode-summary.json"), JSON.stringify(summary, null, 2));
console.log("=== RESUMEN ===\n" + JSON.stringify(summary, null, 2));

if (!APPLY) {
  console.log(`\nDRY-RUN: no se escribió nada. Revisa ${outDir}. Reejecuta con --apply para aplicar ${plan.length} UPDATE.`);
  process.exit(0);
}

// ── aplicar (PATCH con guarda barcode=is.null) ──
let ok = 0, skip = 0, err = 0;
const affected = [];
const chunk = 20;
for (let i = 0; i < plan.length; i += chunk) {
  const batch = plan.slice(i, i + chunk);
  await Promise.all(batch.map(async (a) => {
    const res = await fetch(
      `${URL_}/rest/v1/products?id=eq.${a.id}&barcode=is.null&deleted_at=is.null`,
      { method: "PATCH", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify({ barcode: a.barcode }) },
    );
    if (!res.ok) { err++; return; }
    const rows = await res.json();
    if (rows.length === 1) { ok++; affected.push({ id: a.id, barcode: a.barcode }); }
    else skip++;
  }));
  process.stdout.write(`\r  ${Math.min(i + chunk, plan.length)}/${plan.length} (ok=${ok} skip=${skip} err=${err})`);
}
console.log("");
writeFileSync(path.join(outDir, "barcode-affected.json"), JSON.stringify(affected, null, 2));
console.log(`=== APLICADO: ok=${ok} skip=${skip} err=${err}. Reversible: ${outDir}/barcode-affected.json ===`);
