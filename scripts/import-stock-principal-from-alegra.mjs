#!/usr/bin/env node
/**
 * Carga el STOCK REAL de DermaLand Principal desde dos export de Alegra.
 *
 * Unifica por NOMBRE dos archivos que el usuario exporta de Alegra:
 *   1. "CODIGO DE BARRA.xlsx"     → columnas: Nombre | Código de barras
 *   2. "CANTIDAD PRINCIPAL.xlsx"  → columnas: Producto/servicio | Cantidad en Principal
 *
 * El primero solo sirve para EMPAREJAR con alta confianza (el de cantidad no trae
 * código de barras). El dato que se carga es la CANTIDAD, y solo a la sucursal
 * DermaLand Principal.
 *
 * REGLAS DE SEGURIDAD (no negociables):
 *  - DRY-RUN por defecto. Sin `--apply` no escribe absolutamente nada.
 *  - NO toca la tabla `products`: ni precio, ni costo, ni código de barras, ni
 *    nombre. Solo stock (`product_lots`) + bitácora (`inventory_movements`).
 *  - NO crea productos. Lo que no empareja se reporta y se omite.
 *  - NO crea lotes con vencimiento inventado (`expires_at` es NOT NULL): si un
 *    producto necesitara un lote nuevo, se reporta y se omite.
 *  - NO toca Dermaland Cutis ni ninguna otra sucursal.
 *  - `business_id` y `branch_id` son constantes del código, nunca del archivo.
 *  - Cantidades negativas en el archivo se reportan y se omiten.
 *
 * Cómo reparte el ajuste dentro de los lotes de un producto:
 *  - Faltante (objetivo < actual): descuenta por FEFO — primero el lote que
 *    vence antes.
 *  - Sobrante (objetivo > actual): suma al lote recibido más recientemente.
 *  - Igual: no hace nada.
 *
 * Uso:
 *   node scripts/import-stock-principal-from-alegra.mjs "<barras.xlsx>" "<cantidad.xlsx>"
 *   node scripts/import-stock-principal-from-alegra.mjs "<barras.xlsx>" "<cantidad.xlsx>" --apply
 *
 * Flags:
 *   --apply          Escribe los cambios (sin esto es simulación).
 *   --zero-missing   Pone en 0 los productos de la BD que NO aparecen en el
 *                    archivo de cantidad (el archivo se trata como inventario
 *                    completo). Sin este flag se dejan intactos y se reportan.
 *
 * Salida: consola + data/stock-import-<stamp>/*.json
 * Lee apps/web/.env.local (service_role). NUNCA imprime claves.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const ExcelJS = require("exceljs");

// ── constantes del negocio (NUNCA salen del archivo) ──
const BUSINESS_ID = "00000000-0000-0000-0000-00000000d001"; // DermaLand SRL
const BRANCH_ID = "00000000-0000-0000-0000-00000000b001"; // DermaLand Principal
const ACTOR_ID = "2f707d5c-65c2-4388-b2b9-592693414b9f";
const ACTOR_NAME = "Dario";

const BACKFILL_IDX = process.argv.indexOf("--backfill-movements");
const IS_BACKFILL = BACKFILL_IDX !== -1;
// en modo recuperación el argumento posicional es el directorio del plan, no los xlsx
const args = process.argv
  .slice(2)
  .filter((a, i) => !a.startsWith("--") && (!IS_BACKFILL || i + 2 !== BACKFILL_IDX + 1));
const APPLY = process.argv.includes("--apply");
const ZERO_MISSING = process.argv.includes("--zero-missing");
const [BARCODE_XLSX, QTY_XLSX] = args;

if (!IS_BACKFILL && (!BARCODE_XLSX || !QTY_XLSX)) {
  console.error(
    'Uso: node scripts/import-stock-principal-from-alegra.mjs "<barras.xlsx>" "<cantidad.xlsx>" [--apply] [--zero-missing]',
  );
  process.exit(1);
}

// ── credenciales ──
const env = {};
for (const line of readFileSync(path.join(root, "apps/web/.env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en apps/web/.env.local");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// ── normalización de nombre (misma que import-barcodes-from-alegra.mjs) ──
const UNITS = "ML|MG|GR|G|KG|L|CC|OZ|UI|CAPS|CAP|TABLETAS|TABLETA|TABS|TAB|COMP|SOBRES|SOBRE|UND|UD|EN";
function norm(raw) {
  let s = String(raw ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  s = s.replace(/[^A-Z0-9+%.\s]/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(new RegExp(`(\\d)\\s+(${UNITS})\\b`, "g"), "$1$2").replace(/SPF\s+(\d)/g, "SPF$1");
  return s.replace(/\s+/g, " ").trim();
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

/**
 * Lee una hoja ubicando las columnas por el TEXTO de la cabecera (fila 1), no
 * por posición. Así acepta los distintos export de Alegra sin tocar el script:
 * el de 2 columnas ("Nombre" | "Cantidad…") y el completo de 13 donde el nombre
 * va en B y la cantidad en E.
 *
 * `spec` = { clave: [alias de cabecera aceptados…] }. Si una clave no aparece en
 * la cabecera, lanza con un mensaje que dice qué columnas SÍ trae el archivo.
 */
async function readSheet(file, spec) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];

  const headerKey = (s) =>
    String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const headers = [];
  for (let c = 1; c <= ws.columnCount; c++) headers[c] = headerKey(cellText(ws.getRow(1).getCell(c).value));

  const colOf = {};
  for (const [key, aliases] of Object.entries(spec)) {
    const wanted = aliases.map(headerKey);
    const idx = headers.findIndex((h) => h && wanted.includes(h));
    if (idx === -1) {
      throw new Error(
        `"${path.basename(file)}" no trae la columna ${aliases.map((a) => `"${a}"`).join(" ni ")}.\n` +
          `        Columnas encontradas: ${headers.filter(Boolean).join(" · ")}`,
      );
    }
    colOf[key] = idx;
  }

  const out = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const get = (c) => cellText(ws.getRow(r).getCell(c).value).trim();
    const o = { row: r };
    for (const [key, col] of Object.entries(colOf)) o[key] = get(col);
    if (o.name) out.push(o);
  }
  console.log(
    `  ${path.basename(file)} → ${Object.entries(colOf)
      .map(([k, c]) => `${k}=col ${String.fromCharCode(64 + c)}`)
      .join(", ")}`,
  );
  return out;
}

async function fetchAllPages(pathAndQuery) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${URL_}/rest/v1/${pathAndQuery}&order=id&offset=${offset}&limit=1000`, {
      headers: H,
    });
    if (!res.ok) throw new Error(`GET ${pathAndQuery} → ${res.status}`);
    const batch = await res.json();
    out.push(...batch);
    if (batch.length < 1000) break;
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════
// MODO RECUPERACIÓN: repone SOLO los `inventory_movements` de una corrida
// anterior cuyo ajuste de lotes SÍ se aplicó pero cuya bitácora falló.
// No toca `product_lots`. Es idempotente: omite los movimientos ya presentes.
//   node scripts/import-stock-principal-from-alegra.mjs --backfill-movements data/stock-import-<stamp>
const bfIdx = process.argv.indexOf("--backfill-movements");
if (bfIdx !== -1) {
  const dir = path.resolve(root, process.argv[bfIdx + 1] ?? "");
  const plan = JSON.parse(readFileSync(path.join(dir, "plan.json"), "utf8"));
  const stamp = path.basename(dir).replace("stock-import-", "");
  const reference = `ALEGRA-${stamp}`;
  console.log(`\n🔧 Reponiendo bitácora de ${path.basename(dir)} (referencia ${reference})\n`);

  const lotRows = await fetchAllPages(
    `product_lots?select=id,warehouse_id&branch_id=eq.${BRANCH_ID}`,
  );
  const whByLot = new Map(lotRows.map((l) => [l.id, l.warehouse_id]));
  const existing = await fetchAllPages(
    `inventory_movements?select=product_id&reference=eq.${reference}`,
  );
  const done = new Set(existing.map((m) => m.product_id));
  console.log(`  plan: ${plan.length} ajustes · ya registrados: ${done.size}`);

  let ok = 0;
  let fail = 0;
  for (const p of plan) {
    if (done.has(p.productId)) continue;
    const warehouseId = whByLot.get(p.changes[0].lotId);
    if (!warehouseId) {
      console.error(`  ❌ ${p.name}: no se encontró el almacén del lote`);
      fail++;
      continue;
    }
    const res = await fetch(`${URL_}/rest/v1/inventory_movements`, {
      method: "POST",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        branch_id: BRANCH_ID,
        product_id: p.productId,
        lot_id: p.changes[0].lotId,
        warehouse_id: warehouseId,
        type: p.delta > 0 ? "adjustment_positive" : "adjustment_negative",
        quantity: Math.abs(p.delta),
        reason: `Importación Alegra ${stamp.slice(0, 8)} — ajuste de inventario a conteo real`,
        reference,
        user_id: ACTOR_ID,
        user_name: ACTOR_NAME,
      }),
    });
    if (res.ok) ok++;
    else {
      fail++;
      console.error(`  ❌ ${p.name}: ${res.status} ${await res.text()}`);
    }
  }
  console.log(`\n✅ Bitácora repuesta: ${ok} movimientos nuevos · ${fail} fallos\n`);
  process.exit(fail > 0 ? 1 : 0);
}

console.log(APPLY ? "\n⚠️  MODO APLICAR — se van a escribir cambios\n" : "\n🔍 SIMULACIÓN (dry-run) — no se escribe nada\n");

// 1) leer y unificar los dos archivos
console.log("Columnas detectadas por cabecera:");
const bcRows = await readSheet(BARCODE_XLSX, {
  name: ["Nombre", "Producto/servicio"],
  bc: ["Código de barras", "Codigo de barras", "Código de barra"],
});
const qtyRows = await readSheet(QTY_XLSX, {
  name: ["Producto/servicio", "Nombre"],
  qty: ["Cantidad en Principal"],
});
console.log(`Archivos: ${bcRows.length} filas de código de barras · ${qtyRows.length} filas de cantidad`);

const bcByName = new Map();
for (const r of bcRows) {
  const k = norm(r.name);
  let bc = r.bc.replace(/\D/g, "");
  if (bc.length === 12) bc = `0${bc}`;
  if (!bc) continue;
  if (!bcByName.has(k)) bcByName.set(k, new Set());
  bcByName.get(k).add(bc);
}

const unified = qtyRows.map((r) => {
  const key = norm(r.name);
  const set = bcByName.get(key);
  const qty = Number.parseInt(r.qty, 10);
  return {
    row: r.row,
    name: r.name,
    key,
    barcode: set && set.size === 1 ? [...set][0] : null,
    qty: Number.isFinite(qty) ? qty : null,
  };
});

// 2) traer productos y lotes de Principal
const products = await fetchAllPages(
  `products?select=id,name,barcode&business_id=eq.${BUSINESS_ID}&deleted_at=is.null`,
);
const lots = await fetchAllPages(
  `product_lots?select=id,product_id,warehouse_id,current_quantity,initial_quantity,lot_number,expires_at,received_at&branch_id=eq.${BRANCH_ID}`,
);
console.log(`Base: ${products.length} productos · ${lots.length} lotes en Principal\n`);

const byBarcode = new Map();
const byName = new Map();
for (const p of products) {
  if (p.barcode) {
    const k = String(p.barcode).trim();
    if (k) {
      if (!byBarcode.has(k)) byBarcode.set(k, []);
      byBarcode.get(k).push(p);
    }
  }
  const k = norm(p.name);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(p);
}
const lotsByProduct = new Map();
for (const l of lots) {
  if (!lotsByProduct.has(l.product_id)) lotsByProduct.set(l.product_id, []);
  lotsByProduct.get(l.product_id).push(l);
}

// 3) emparejar + acumular objetivo por producto
const targets = new Map(); // productId → { qty, rows[] }
const skipped = { sinMatch: [], negativas: [], sinCantidad: [] };

for (const u of unified) {
  if (u.qty === null) {
    skipped.sinCantidad.push(u);
    continue;
  }
  if (u.qty < 0) {
    skipped.negativas.push(u);
    continue;
  }
  let match = null;
  if (u.barcode) {
    const hits = byBarcode.get(u.barcode) ?? [];
    if (hits.length === 1) match = hits[0];
  }
  if (!match) {
    const hits = byName.get(u.key) ?? [];
    if (hits.length === 1) match = hits[0];
  }
  if (!match) {
    skipped.sinMatch.push(u);
    continue;
  }
  if (!targets.has(match.id)) targets.set(match.id, { product: match, qty: 0, rows: [] });
  const t = targets.get(match.id);
  t.qty += u.qty; // colisiones: se suman
  t.rows.push(u);
}

// 4) productos de la BD que no vienen en el archivo
const missing = products.filter((p) => !targets.has(p.id));
if (ZERO_MISSING) {
  for (const p of missing) targets.set(p.id, { product: p, qty: 0, rows: [], zeroed: true });
}

// 5) calcular el plan de ajuste
const plan = [];
const noLot = [];
for (const [productId, t] of targets) {
  const productLots = (lotsByProduct.get(productId) ?? []).slice();
  const current = productLots.reduce((a, l) => a + (l.current_quantity || 0), 0);
  const delta = t.qty - current;
  if (delta === 0) continue;
  if (productLots.length === 0) {
    noLot.push({ name: t.product.name, target: t.qty });
    continue; // no inventamos vencimiento
  }
  const changes = [];
  if (delta < 0) {
    // FEFO: consume primero el que vence antes
    let pending = -delta;
    const fefo = productLots
      .filter((l) => (l.current_quantity || 0) > 0)
      .sort((a, b) => String(a.expires_at).localeCompare(String(b.expires_at)));
    for (const l of fefo) {
      if (pending <= 0) break;
      const take = Math.min(pending, l.current_quantity);
      changes.push({
        lotId: l.id,
        lotNumber: l.lot_number,
        warehouseId: l.warehouse_id,
        from: l.current_quantity,
        to: l.current_quantity - take,
      });
      pending -= take;
    }
    if (pending > 0) {
      // no debería pasar (current ya suma todo), pero lo dejamos explícito
      noLot.push({ name: t.product.name, target: t.qty, note: `faltaron ${pending} u. por descontar` });
      continue;
    }
  } else {
    // sobrante: al lote recibido más recientemente
    const newest = productLots
      .slice()
      .sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)))[0];
    changes.push({
      lotId: newest.id,
      lotNumber: newest.lot_number,
      warehouseId: newest.warehouse_id,
      from: newest.current_quantity,
      to: newest.current_quantity + delta,
    });
  }
  plan.push({
    productId,
    name: t.product.name,
    current,
    target: t.qty,
    delta,
    zeroed: Boolean(t.zeroed),
    changes,
  });
}

// 6) reporte
const sube = plan.filter((p) => p.delta > 0);
const baja = plan.filter((p) => p.delta < 0);
console.log("═══ PLAN DE AJUSTE — DermaLand Principal ═══");
console.log(`  filas del archivo          : ${unified.length}`);
console.log(`  emparejadas                : ${unified.length - skipped.sinMatch.length - skipped.negativas.length - skipped.sinCantidad.length}`);
console.log(`  productos objetivo         : ${targets.size}`);
console.log("  ─────────────────────────────────────────");
console.log(`  productos que SUBEN        : ${sube.length}  (+${sube.reduce((a, p) => a + p.delta, 0)} u.)`);
console.log(`  productos que BAJAN        : ${baja.length}  (${baja.reduce((a, p) => a + p.delta, 0)} u.)`);
console.log(`  sin cambio                 : ${targets.size - plan.length}`);
console.log("  ─────────────────────────────────────────");
const stockAntes = lots.reduce((a, l) => a + (l.current_quantity || 0), 0);
const stockDespues = stockAntes + plan.reduce((a, p) => a + p.delta, 0);
console.log(`  stock ANTES                : ${stockAntes} u.`);
console.log(`  stock DESPUÉS              : ${stockDespues} u.`);
console.log("  ─────────────────────────────────────────");
console.log(`  OMITIDOS sin emparejar     : ${skipped.sinMatch.length} (${skipped.sinMatch.reduce((a, u) => a + (u.qty || 0), 0)} u. que NO se cargan)`);
console.log(`  OMITIDOS cantidad negativa : ${skipped.negativas.length}`);
console.log(`  OMITIDOS sin cantidad      : ${skipped.sinCantidad.length}`);
console.log(`  OMITIDOS sin lote          : ${noLot.length}`);
console.log(
  `  productos de la BD fuera del archivo: ${missing.length}` +
    (ZERO_MISSING ? " → SE PONEN EN 0" : " → se dejan intactos"),
);

// 7) guardar reporte
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13);
const outDir = path.join(root, "data", `stock-import-${stamp}`);
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "plan.json"), JSON.stringify(plan, null, 1));
writeFileSync(path.join(outDir, "omitidos.json"), JSON.stringify({ ...skipped, noLot, missing: missing.map((p) => p.name) }, null, 1));
console.log(`\n  detalle → data/stock-import-${stamp}/`);

if (!APPLY) {
  console.log("\n🔍 Simulación terminada. Nada se escribió. Agrega --apply para ejecutar.\n");
  process.exit(0);
}

// 8) aplicar
console.log("\n⏳ Aplicando…");
const reference = `ALEGRA-${stamp}`;
let okLots = 0;
let okMoves = 0;
let fails = 0;

for (const p of plan) {
  try {
    for (const c of p.changes) {
      const res = await fetch(`${URL_}/rest/v1/product_lots?id=eq.${c.lotId}`, {
        method: "PATCH",
        headers: { ...H, Prefer: "return=minimal" },
        body: JSON.stringify({ current_quantity: c.to, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`lote ${c.lotNumber} → ${res.status} ${await res.text()}`);
      okLots++;
    }
    const mv = await fetch(`${URL_}/rest/v1/inventory_movements`, {
      method: "POST",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        branch_id: BRANCH_ID,
        product_id: p.productId,
        lot_id: p.changes[0].lotId,
        warehouse_id: p.changes[0].warehouseId, // NOT NULL en inventory_movements
        type: p.delta > 0 ? "adjustment_positive" : "adjustment_negative",
        quantity: Math.abs(p.delta),
        reason: `Importación Alegra ${stamp.slice(0, 8)} — ajuste de inventario a conteo real`,
        reference,
        user_id: ACTOR_ID,
        user_name: ACTOR_NAME,
      }),
    });
    if (!mv.ok) throw new Error(`movimiento → ${mv.status} ${await mv.text()}`);
    okMoves++;
  } catch (e) {
    fails++;
    console.error(`  ❌ ${p.name}: ${e.message}`);
  }
}

console.log(`\n✅ Listo: ${okLots} lotes actualizados · ${okMoves} movimientos registrados · ${fails} fallos`);
console.log(`   referencia de auditoría: ${reference}\n`);
