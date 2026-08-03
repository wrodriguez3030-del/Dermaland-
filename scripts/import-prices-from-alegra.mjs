#!/usr/bin/env node
/**
 * Carga PRECIO, COSTO e ITBIS del catálogo desde el export de Alegra
 * "Productos-servicios".
 *
 * Por qué existe: 1 339 de 1 355 productos tienen `price = 0` y el POS bloquea
 * vender con precio 0, así que el catálogo es prácticamente invendible. Este
 * script cierra ese hueco.
 *
 * CONVENCIÓN DE PRECIOS DE DERMALAND (verificada en el código):
 *   - `products.price` es ITBIS-INCLUIDO  → columna "Precio total"
 *   - `products.cost`  es SIN ITBIS       → columna "Costo inicial"
 *   Se comprobó que `Precio total = Precio base × (1 + ITBIS)` cuadra en las
 *   1 443 filas del archivo, y coincide con el motor `features/products/pricing.ts`.
 *
 * REGLAS DE SEGURIDAD (no negociables):
 *  - DRY-RUN por defecto. Sin `--apply` no escribe nada.
 *  - NO crea productos. Lo que no empareja se reporta y se omite.
 *  - NO pisa un `price > 0` ya existente con uno distinto: lo reporta para que
 *    una persona decida.
 *  - NO pisa un `barcode` ya asignado con uno distinto: lo reporta.
 *  - NO toca stock, lotes ni movimientos.
 *  - `business_id` es constante del código, nunca del archivo.
 *  - Las columnas se ubican por el TEXTO de la cabecera, no por posición.
 *
 * Uso:
 *   node scripts/import-prices-from-alegra.mjs "<productos-servicios.xlsx>"
 *   node scripts/import-prices-from-alegra.mjs "<archivo.xlsx>" --apply
 *
 * Salida: consola + data/price-import-<stamp>/*.json
 * Lee apps/web/.env.local (service_role). NUNCA imprime claves.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const ExcelJS = require("exceljs");

const BUSINESS_ID = "00000000-0000-0000-0000-00000000d001"; // DermaLand SRL

const XLSX = process.argv.slice(2).find((a) => !a.startsWith("--"));
const APPLY = process.argv.includes("--apply");
/**
 * `--overwrite`: Alegra manda sobre TODO. Pisa precios, costos, ITBIS y
 * descripciones que ya tengan valor distinto en el sistema. Sin este flag el
 * script es conservador: solo rellena lo que está vacío y reporta los choques.
 */
const OVERWRITE = process.argv.includes("--overwrite");
if (!XLSX) {
  console.error('Uso: node scripts/import-prices-from-alegra.mjs "<archivo.xlsx>" [--apply]');
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
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// ── normalización (misma que el resto de importadores de Alegra) ──
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
  return (10 - (s % 10)) % 10 === d[12];
}
function cellText(v) {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("result" in v) return String(v.result ?? "");
    if ("text" in v) return String(v.text ?? "");
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
  }
  return String(v);
}
/** Dinero: acepta 1234.56 y rechaza basura. Devuelve NaN si no es un número limpio. */
function money(raw) {
  const s = String(raw ?? "").trim();
  if (s === "") return Number.NaN;
  const limpio = s.replace(/(\d)[,\s](?=\d{3}(?:\D|$))/g, "$1");
  if (!/^[+-]?\d+(\.\d+)?$/.test(limpio)) return Number.NaN;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : Number.NaN;
}

const headerKey = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

async function fetchAllPages(q) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${URL_}/rest/v1/${q}&order=id&offset=${off}&limit=1000`, { headers: H });
    if (!r.ok) throw new Error(`GET ${q} → ${r.status}`);
    const b = await r.json();
    out.push(...b);
    if (b.length < 1000) break;
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════
console.log(APPLY ? "\n⚠️  MODO APLICAR — se van a escribir cambios\n" : "\n🔍 SIMULACIÓN (dry-run) — no se escribe nada\n");

// 1) leer el Excel ubicando columnas por cabecera
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX);
const ws = wb.worksheets[0];
const headers = [];
for (let c = 1; c <= ws.columnCount; c++) headers[c] = headerKey(cellText(ws.getRow(1).getCell(c).value));

function col(aliases, etiqueta) {
  const wanted = aliases.map(headerKey);
  const idx = headers.findIndex((h) => h && wanted.includes(h));
  if (idx === -1) {
    console.error(`El archivo no trae la columna "${etiqueta}".`);
    console.error(`Columnas encontradas: ${headers.filter(Boolean).join(" · ")}`);
    process.exit(1);
  }
  return idx;
}
const C = {
  tipo: col(["Tipo de nota débito"], "Tipo"),
  name: col(["Nombre", "Producto/servicio"], "Nombre"),
  desc: col(["Descripción"], "Descripción"),
  unidad: col(["Unidad de medida"], "Unidad de medida"),
  costo: col(["Costo inicial"], "Costo inicial"),
  itbis: col(["Impuesto"], "Impuesto"),
  total: col(["Precio total"], "Precio total"),
  bc: col(["Código de barras"], "Código de barras"),
};
console.log(
  "Columnas detectadas:",
  Object.entries(C)
    .map(([k, i]) => `${k}=${String.fromCharCode(64 + i)}`)
    .join(", "),
);

const rows = [];
for (let r = 2; r <= ws.rowCount; r++) {
  const g = (c) => cellText(ws.getRow(r).getCell(c).value).trim();
  const name = g(C.name);
  if (!name) continue;
  let bc = g(C.bc).replace(/\D/g, "");
  if (bc.length === 12) bc = `0${bc}`;
  rows.push({
    excelRow: r,
    tipo: g(C.tipo),
    name,
    desc: g(C.desc),
    unidad: g(C.unidad),
    costo: money(g(C.costo)),
    itbis: money(g(C.itbis)),
    price: money(g(C.total)),
    bc,
  });
}
console.log(`Filas del archivo: ${rows.length}`);

// 2) productos de la base (paginado — PostgREST corta en 1000)
const products = await fetchAllPages(
  `products?select=id,name,barcode,price,cost,itbis_rate,description&business_id=eq.${BUSINESS_ID}&deleted_at=is.null`,
);
console.log(`Productos en la base: ${products.length}\n`);

const byBc = new Map();
const byName = new Map();
for (const p of products) {
  if (p.barcode) {
    const k = String(p.barcode).trim();
    if (k) (byBc.get(k) ?? byBc.set(k, []).get(k)).push(p);
  }
  const k = norm(p.name);
  (byName.get(k) ?? byName.set(k, []).get(k)).push(p);
}

// 3) emparejar y decidir
const updates = new Map(); // productId → { patch, product, row }
const omitidos = { sinMatch: [], datosMalos: [], colision: [], conflictoPrecio: [], conflictoBarcode: [] };
const vistos = new Map();

for (const row of rows) {
  if (!Number.isFinite(row.price) || row.price <= 0) {
    omitidos.datosMalos.push({ ...row, motivo: "Precio total ausente o no numérico" });
    continue;
  }
  let m = null;
  if (row.bc) {
    const hits = byBc.get(row.bc) ?? [];
    if (hits.length === 1) m = hits[0];
  }
  if (!m) {
    const hits = byName.get(norm(row.name)) ?? [];
    if (hits.length === 1) m = hits[0];
  }
  if (!m) {
    omitidos.sinMatch.push(row);
    continue;
  }
  const prev = vistos.get(m.id);
  if (prev) {
    omitidos.colision.push({ producto: m.name, filas: [prev.excelRow, row.excelRow] });
    updates.delete(m.id); // ambiguo: no tocar
    continue;
  }
  vistos.set(m.id, row);

  const patch = {};
  const precioBD = Number(m.price);
  if (precioBD > 0 && Math.abs(precioBD - row.price) > 0.01 && !OVERWRITE) {
    omitidos.conflictoPrecio.push({
      producto: m.name,
      bd: precioBD,
      archivo: row.price,
    });
  } else if (precioBD !== row.price) {
    patch.price = row.price;
  }

  // Costo: sin --overwrite solo rellena el que está en 0; con --overwrite,
  // Alegra manda siempre.
  if (Number.isFinite(row.costo) && row.costo > 0) {
    if (OVERWRITE ? Number(m.cost) !== row.costo : Number(m.cost) === 0) patch.cost = row.costo;
  }
  if (Number.isFinite(row.itbis) && Number(m.itbis_rate) !== row.itbis) patch.itbis_rate = row.itbis;

  if (row.bc && ean13ok(row.bc)) {
    if (!m.barcode) {
      patch.barcode = row.bc;
    } else if (String(m.barcode).trim() !== row.bc) {
      // El código de barras identifica el producto físico: pisarlo puede
      // apuntar a otro artículo. Se reporta SIEMPRE, incluso con --overwrite.
      omitidos.conflictoBarcode.push({ producto: m.name, bd: m.barcode, archivo: row.bc });
    }
  }

  if (row.desc && (OVERWRITE ? m.description !== row.desc : !m.description)) {
    patch.description = row.desc;
  }

  if (Object.keys(patch).length > 0) updates.set(m.id, { patch, product: m, row });
}

// 4) reporte
const list = [...updates.values()];
console.log("═══ PLAN DE ACTUALIZACIÓN DE CATÁLOGO ═══");
console.log(`  productos a actualizar     : ${list.length}`);
console.log(`    · ganan PRECIO           : ${list.filter((u) => u.patch.price !== undefined).length}`);
console.log(`    · ganan COSTO            : ${list.filter((u) => u.patch.cost !== undefined).length}`);
console.log(`    · ajustan ITBIS          : ${list.filter((u) => u.patch.itbis_rate !== undefined).length}`);
console.log(`    · ganan CÓDIGO DE BARRAS : ${list.filter((u) => u.patch.barcode !== undefined).length}`);
console.log(`    · ganan DESCRIPCIÓN      : ${list.filter((u) => u.patch.description !== undefined).length}`);
console.log("  ─────────────────────────────────────");
console.log(`  OMITIDOS sin emparejar     : ${omitidos.sinMatch.length}`);
console.log(`  OMITIDOS datos inválidos   : ${omitidos.datosMalos.length}`);
console.log(`  OMITIDOS colisión          : ${omitidos.colision.length}`);
console.log(`  REVISAR conflicto precio   : ${omitidos.conflictoPrecio.length}`);
console.log(`  REVISAR conflicto barcode  : ${omitidos.conflictoBarcode.length}`);

const quedanEnCero =
  products.filter((p) => Number(p.price) === 0).length -
  list.filter((u) => u.patch.price !== undefined).length;
console.log(`\n  productos con precio 0 ANTES : ${products.filter((p) => Number(p.price) === 0).length}`);
console.log(`  productos con precio 0 DESPUÉS: ${quedanEnCero}`);

if (omitidos.conflictoPrecio.length) {
  console.log("\n=== CONFLICTOS DE PRECIO (no se tocan) ===");
  omitidos.conflictoPrecio.forEach((c) =>
    console.log(`   ${c.producto.slice(0, 48).padEnd(50)} BD: ${c.bd} → archivo: ${c.archivo}`),
  );
}

const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13);
const outDir = path.join(root, "data", `price-import-${stamp}`);
mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, "plan.json"),
  JSON.stringify(list.map((u) => ({ id: u.product.id, name: u.product.name, patch: u.patch })), null, 1),
);
writeFileSync(path.join(outDir, "omitidos.json"), JSON.stringify(omitidos, null, 1));
console.log(`\n  detalle → data/price-import-${stamp}/`);

if (!APPLY) {
  console.log("\n🔍 Simulación terminada. Nada se escribió. Agrega --apply para ejecutar.\n");
  process.exit(0);
}

// 5) aplicar
console.log("\n⏳ Aplicando…");
let ok = 0;
let fail = 0;
for (const u of list) {
  const res = await fetch(`${URL_}/rest/v1/products?id=eq.${u.product.id}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ ...u.patch, updated_at: new Date().toISOString() }),
  });
  if (res.ok) ok++;
  else {
    fail++;
    console.error(`  ❌ ${u.product.name}: ${res.status} ${await res.text()}`);
  }
}
console.log(`\n✅ Listo: ${ok} productos actualizados · ${fail} fallos\n`);
