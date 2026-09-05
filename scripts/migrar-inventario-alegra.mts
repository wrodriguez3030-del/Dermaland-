#!/usr/bin/env -S npx tsx
/**
 * Migra el inventario COMPLETO desde el export de Alegra "Valor de inventario":
 *
 *  1. CREA en el catálogo los productos que Alegra trae y DermaLand no tiene
 *     (activos en Alegra, o con stock aunque estén inactivos).
 *  2. RENOMBRA los productos que existen con otro nombre (lista explícita
 *     `RENOMBRES`, verificada a mano; nunca adivina).
 *  3. Da de alta el LOTE INICIAL en Principal de cada producto nuevo, con
 *     vencimiento PROVISIONAL a 1 año (misma convención que la carga inicial
 *     `INIT-DERM` del 2026-06-19). Sin ese lote el importador no puede heredar
 *     un vencimiento para la segunda sucursal.
 *  4. Aplica el plan del importador (`buildImportPlan`, el MISMO motor puro que
 *     usa *Inventario → Importar desde Alegra*) en las dos sucursales, con la
 *     misma escritura que `alegra-import-apply.ts`: ajuste de lotes por FEFO,
 *     lote heredado en la segunda sucursal, un movimiento por producto y
 *     compensación si algo falla a mitad de un producto.
 *  5. Verifica al final, releyendo la base, que cada fila del archivo cuadra.
 *
 * Reglas de seguridad:
 *  - DRY-RUN por defecto. Sin `--apply` no escribe nada.
 *  - `business_id` es constante del código, nunca del archivo.
 *  - Precio de los productos nuevos = regla por defecto de la app
 *    (costo + ITBIS 18 % + margen 30 %, `features/products/pricing.ts`).
 *    Con costo 0 o de relleno (< 10 DOP) el precio queda 0 y el POS no lo deja
 *    vender hasta ponerle precio.
 *  - No toca lotes en cuarentena ni en recall (igual que el importador).
 *  - Toma respaldo antes: `node scripts/backup/rest-json-backup.mjs`.
 *
 * Uso:
 *   apps/web/node_modules/.bin/tsx scripts/migrar-inventario-alegra.mts "<archivo.xlsx>"
 *   apps/web/node_modules/.bin/tsx scripts/migrar-inventario-alegra.mts "<archivo.xlsx>" --apply
 *
 * Salida: consola + backups/alegra-migracion-<stamp>/reporte.json (gitignored).
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildImportPlan,
  normalizeProductName,
  resolveColumns,
  type AlegraRow,
} from "../apps/web/src/features/inventory/alegra-import";
import { computeSalePrice, DEFAULT_MARGIN_PERCENT } from "../apps/web/src/features/products/pricing";
import { nextSkuAfter, nextSkuFromSkus } from "../apps/web/src/features/products/product-sku";
import { parseProductName } from "../apps/web/src/lib/import/product-parser";
import { loadEnv, makeRest } from "./lib/supabase-rest.mts";
import {
  B,
  BUSINESS_ID,
  aplicarPlan,
  fuentesPlan,
  loadDb,
  nuevoResultado,
  verificar,
  type DbProduct,
  type DbState,
} from "./lib/stock-apply.mts";

// ─── Constantes del negocio ───────────────────────────────────────────────
const OWNER_USER_ID = "2f707d5c-65c2-4388-b2b9-592693414b9f"; // Dario (admin) — autorizó la migración
const USER_NAME = "Dario (script migración Alegra)";
const ITBIS_RATE = 18;
const DIAS_VENCIMIENTO_PROVISIONAL = 365;
/** Costo (DOP) por debajo del cual se considera relleno y NO se deriva precio. */
const COSTO_MINIMO_CREIBLE = 10;

/** Productos que existen en DermaLand con OTRO nombre (verificados a mano el 2026-09-05). */
const RENOMBRES: Array<{ dermaland: string; alegra: string }> = [
  { dermaland: "Bella Aurora Repigment 12 75 ML", alegra: "BELLA AURORA REPIGMENT 12 CREMA 75 ML" },
  { dermaland: "Sesderma Azelac RU GEL Crema 50 ML", alegra: "SESDERMA AZELAC RU GEL CREMA DEPIGMENTANTE 50 ML" },
  { dermaland: "Uriage Crema Lavante 500 ML.", alegra: "URIAGE DERMA-PHY CREMA LAVANTE 500 ML." },
];

/** categoryId del parser → nombre real en `product_categories`. */
const CATEGORIA_POR_PARSER: Record<string, string> = {
  cat_solar: "Protección solar",
  cat_facial: "Cuidado facial",
  cat_acne: "Acné y piel grasa",
  cat_capilar: "Capilar / Tricología",
  cat_pediatria: "Pediatría dermatológica",
  cat_atopica: "Piel atópica / sensible",
  cat_corporal: "Cuidado corporal",
  cat_oral: "Suplementos orales",
};

// ─── Infra ────────────────────────────────────────────────────────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "apps/web/package.json"));
const ExcelJS = require("exceljs");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FILE = args.find((a) => !a.startsWith("--"));
if (!FILE) {
  console.error("Uso: tsx scripts/migrar-inventario-alegra.mts <archivo.xlsx> [--apply]");
  process.exit(1);
}

const env = loadEnv(ROOT);
const rest = makeRest(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
const { insert, patch } = rest;

const key = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const pad = (n: number) => String(n).padStart(2, "0");
function importReference(now: Date): string {
  return `ALEGRA-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
}
function todayRD(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
}
function plusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function toInt(v: unknown): number {
  if (typeof v === "number") return Number.isInteger(v) ? v : Number.NaN;
  const s = String(v ?? "").trim();
  if (s === "") return Number.NaN;
  const sinMiles = s.replace(/(\d)[.,  ](?=\d{3}(?:\D|$))/g, "$1");
  if (!/^[+-]?\d+$/.test(sinMiles)) return Number.NaN;
  return Number(sinMiles);
}
function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if ("result" in o) return String(o.result ?? "");
    if ("text" in o) return String(o.text ?? "");
    if ("richText" in o) return ((o.richText as Array<{ text?: string }>) ?? []).map((t) => t.text ?? "").join("");
  }
  return String(value);
}

interface FileRow extends AlegraRow {
  cost: number;
  estado: string;
}

// ─── Lectura del archivo ──────────────────────────────────────────────────
async function readFile(file: string): Promise<FileRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("El archivo no tiene hojas.");
  const rowCount = ws.rowCount;
  const colCount = ws.columnCount;
  const matrix: string[][] = [];
  for (let r = 1; r <= rowCount; r++) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= colCount; c++) cells.push(cellText(row.getCell(c).value));
    matrix.push(cells);
  }
  const [header, ...body] = matrix;
  const col = resolveColumns(header ?? []);
  const hk = (header ?? []).map(key);
  const costIdx = hk.findIndex((h) => h === "costo promedio");
  const estadoIdx = hk.findIndex((h) => h === "estado");
  const out: FileRow[] = [];
  body.forEach((cells, i) => {
    const name = String(cells[col.name] ?? "").trim();
    if (!name) return;
    const cost = costIdx >= 0 ? Number(String(cells[costIdx] ?? "0").replace(",", ".")) : 0;
    out.push({
      rowNumber: i + 2,
      name,
      qtyPrincipal: toInt(cells[col.qtyPrincipal]),
      qtyTotal: toInt(cells[col.qtyTotal]),
      cost: Number.isFinite(cost) ? Math.round(cost * 100) / 100 : 0,
      estado: estadoIdx >= 0 ? String(cells[estadoIdx] ?? "").trim() : "",
    });
  });
  return out;
}

// ─── Productos nuevos ─────────────────────────────────────────────────────
interface NuevoProducto {
  rows: number[];
  alegraName: string;
  row: Record<string, unknown>;
  qtyPrincipal: number;
  qtyTotal: number;
}

function planNuevosProductos(
  rows: FileRow[],
  db: DbState,
): { nuevos: NuevoProducto[]; ambiguas: FileRow[]; omitidasInactivas: FileRow[] } {
  const byName = new Map<string, DbProduct[]>();
  for (const p of db.products) {
    const k = normalizeProductName(p.name);
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }
  // Los renombres se resuelven ANTES: esas filas ya tienen dueño.
  const renombradas = new Set(RENOMBRES.map((r) => normalizeProductName(r.alegra)));

  const brandByKey = new Map(db.brands.map((b) => [key(b.name), b.id]));
  const catByName = new Map(db.cats.map((c) => [c.name, c.id]));
  // Laboratorio mayoritario por marca, según el catálogo existente.
  const labVotes = new Map<string, Map<string, number>>();
  for (const p of db.products) {
    if (!p.brand_id || !p.laboratory_id) continue;
    const m = labVotes.get(p.brand_id) ?? new Map<string, number>();
    m.set(p.laboratory_id, (m.get(p.laboratory_id) ?? 0) + 1);
    labVotes.set(p.brand_id, m);
  }
  const labForBrand = (brandId: string | null): string | null => {
    if (!brandId) return null;
    const m = labVotes.get(brandId);
    if (!m) return null;
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  };

  const skus = db.products.map((p) => p.sku);
  let sku = nextSkuFromSkus(skus);
  const nuevosPorClave = new Map<string, NuevoProducto>();
  const ambiguas: FileRow[] = [];
  const omitidasInactivas: FileRow[] = [];

  for (const r of rows) {
    if (!Number.isFinite(r.qtyPrincipal) || !Number.isFinite(r.qtyTotal) || r.qtyPrincipal < 0 || r.qtyTotal < 0) continue;
    const k = normalizeProductName(r.name);
    if (renombradas.has(k)) continue;
    const hits = byName.get(k) ?? [];
    if (hits.length === 1) continue;
    if (hits.length > 1) {
      ambiguas.push(r);
      continue;
    }
    const activo = key(r.estado) === "activo";
    if (!activo && r.qtyTotal === 0) {
      omitidasInactivas.push(r);
      continue;
    }
    const ya = nuevosPorClave.get(k);
    if (ya) {
      ya.rows.push(r.rowNumber);
      ya.qtyPrincipal += r.qtyPrincipal;
      ya.qtyTotal += r.qtyTotal;
      continue;
    }
    const parsed = parseProductName(r.name);
    // El nombre limpio DEBE seguir emparejando con Alegra; si no, se conserva el crudo.
    const name = normalizeProductName(parsed.name) === k ? parsed.name : r.name;
    const brandId = parsed.brandName ? (brandByKey.get(key(parsed.brandName)) ?? null) : null;
    const categoryId = catByName.get(CATEGORIA_POR_PARSER[parsed.categoryId] ?? "Cuidado facial") ?? null;
    // Un costo por debajo de COSTO_MINIMO_CREIBLE es un relleno de Alegra (p. ej. "1"),
    // no un costo real: el precio queda en 0 y el POS bloquea la venta hasta que
    // alguien le ponga precio. Nunca se vende a RD$1,53 por un dato de relleno.
    const price = r.cost >= COSTO_MINIMO_CREIBLE ? computeSalePrice({ cost: r.cost, itbisRate: ITBIS_RATE, marginPercent: DEFAULT_MARGIN_PERCENT }) : 0;
    const desc = [parsed.useType, parsed.skinType ? `Ideal para ${parsed.skinType.toLowerCase()}` : null, parsed.brandName ? `Marca ${parsed.brandName}` : null]
      .filter(Boolean)
      .join(". ");
    nuevosPorClave.set(k, {
      rows: [r.rowNumber],
      alegraName: r.name,
      qtyPrincipal: r.qtyPrincipal,
      qtyTotal: r.qtyTotal,
      row: {
        business_id: BUSINESS_ID,
        sku,
        barcode: null,
        name,
        description: desc ? `${desc}.` : null,
        brand_id: brandId,
        laboratory_id: labForBrand(brandId),
        category_id: categoryId,
        unit: "unidad",
        pharmaceutical_form: parsed.pharmaceuticalForm ?? null,
        presentation: parsed.content ? parsed.content.toLowerCase() : null,
        requires_prescription: false,
        controlled: false,
        cost: r.cost,
        price,
        itbis_rate: ITBIS_RATE,
        min_stock: 0,
        max_stock: 0,
        active: activo,
        sellable: true,
      },
    });
    sku = nextSkuAfter(sku);
  }
  return { nuevos: [...nuevosPorClave.values()], ambiguas, omitidasInactivas };
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(APPLY ? "\n⚠️  MODO APLICAR — se van a escribir cambios en PRODUCCIÓN\n" : "\n🔍 SIMULACIÓN (dry-run) — no se escribe nada\n");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const outDir = path.join(ROOT, "backups", `alegra-migracion-${stamp}`);
  mkdirSync(outDir, { recursive: true });
  const reporte: Record<string, unknown> = { archivo: FILE, apply: APPLY, inicio: new Date().toISOString() };

  const rows = await readFile(FILE!);
  const db = await loadDb(rest);
  console.log(`Archivo: ${rows.length} filas · Catálogo: ${db.products.length} productos · Lotes: ${db.lots.length}`);
  console.log(`Sucursales: Principal = "${db.principal.name}" · Segunda = "${db.segunda.name}"\n`);

  // 1) Renombres
  const renombres = RENOMBRES.map((r) => {
    const p = db.products.find((x) => x.name === r.dermaland);
    const fila = rows.find((x) => normalizeProductName(x.name) === normalizeProductName(r.alegra));
    const nuevoNombre = parseProductName(r.alegra).name;
    const nombreFinal = normalizeProductName(nuevoNombre) === normalizeProductName(r.alegra) ? nuevoNombre : r.alegra;
    return { ...r, productId: p?.id ?? null, fila: fila?.rowNumber ?? null, nombreFinal };
  });
  console.log("── Renombres");
  for (const r of renombres) {
    console.log(`  ${r.productId ? "✓" : "✗ NO ENCONTRADO"} "${r.dermaland}" → "${r.nombreFinal}" (fila ${r.fila ?? "?"})`);
  }
  reporte.renombres = renombres;

  // 2) Productos nuevos
  const { nuevos, ambiguas, omitidasInactivas } = planNuevosProductos(rows, db);
  console.log(`\n── Productos nuevos: ${nuevos.length} (omitidos por inactivos sin stock: ${omitidasInactivas.length}; ambiguos: ${ambiguas.length})`);
  for (const n of nuevos) {
    const r = n.row;
    console.log(`  ${r.sku}  ${String(r.name).padEnd(62).slice(0, 62)} costo ${String(r.cost).padStart(9)}  precio ${String(r.price).padStart(9)}  P=${n.qtyPrincipal} S=${n.qtyTotal - n.qtyPrincipal}${r.active ? "" : "  [inactivo]"}${r.brand_id ? "" : "  [sin marca]"}`);
  }
  reporte.nuevos = nuevos;
  reporte.omitidasInactivas = omitidasInactivas;
  reporte.ambiguas = ambiguas;

  const today = todayRD();
  const vencimientoProvisional = plusDays(today, DIAS_VENCIMIENTO_PROVISIONAL);
  const reference = importReference(new Date());
  const reason = `Importación Alegra ${reference} — ajuste de inventario a conteo real`;
  const reasonNuevo = `Importación Alegra ${reference} — producto nuevo: lote inicial con vencimiento provisional a 1 año (${vencimientoProvisional})`;

  // 3) Simulación del plan con los productos/lotes que existirían tras el alta.
  const simProducts: PlanProduct[] = [
    ...db.products.map((p) => ({ id: p.id, name: renombres.find((r) => r.productId === p.id)?.nombreFinal ?? p.name })),
    ...nuevos.map((n) => ({ id: `nuevo:${n.row.sku}`, name: String(n.row.name) })),
  ];
  const simLotsPrincipal: PlanLot[] = [
    ...fuentesPlan(db).principalLots,
    ...nuevos.map((n): PlanLot => ({
      id: `lote-nuevo:${n.row.sku}`,
      productId: `nuevo:${n.row.sku}`,
      warehouseId: db.whPrincipal,
      quantity: n.qtyPrincipal,
      expiresAt: vencimientoProvisional,
      receivedAt: new Date().toISOString(),
      lotNumber: `AJU-${reference}`,
    })),
  ];
  const simRows: AlegraRow[] = rows.map(({ rowNumber, name, qtyPrincipal, qtyTotal }) => ({ rowNumber, name, qtyPrincipal, qtyTotal }));
  const simPlan = buildImportPlan({
    rows: simRows,
    products: simProducts,
    principalLots: simLotsPrincipal,
    cutisLots: fuentesPlan(db).cutisLots,
    cutisWarehouseId: db.whSegunda,
    zeroMissing: false,
    today,
  });
  // Los productos nuevos ya nacen con su cantidad de Principal en el lote inicial: el plan no debe tocarlos ahí.
  const ajustesPrincipalExistentes = simPlan.principal.filter((a) => !a.productId.startsWith("nuevo:"));
  console.log("\n── Plan del importador (tras el alta)");
  console.log(`  Principal: ${ajustesPrincipalExistentes.length} productos a ajustar (${simPlan.totals.principalBefore} → ${simPlan.totals.principalAfter} uds)`);
  console.log(`  Segunda:   ${simPlan.cutis.length} productos a ajustar, ${simPlan.cutis.filter((a) => a.newLot).length} lotes nuevos (${simPlan.totals.cutisBefore} → ${simPlan.totals.cutisAfter} uds)`);
  console.log(`  Lotes iniciales en Principal para productos nuevos: ${nuevos.filter((n) => n.qtyPrincipal > 0 || n.qtyTotal > n.qtyPrincipal).length} (${nuevos.reduce((a, n) => a + n.qtyPrincipal, 0)} uds)`);
  console.log(`  No emparejados: ${simPlan.unmatched.length} · Omitidos: ${simPlan.skipped.length} · Colisiones (filas duplicadas sumadas): ${simPlan.collisions.length}`);
  for (const u of simPlan.unmatched) console.log(`    · sin producto: fila ${u.rowNumber} ${u.name} (P=${u.principal} S=${u.cutis})`);
  for (const s of simPlan.skipped) console.log(`    · omitido: fila ${s.rowNumber} ${s.name} — ${s.error}`);
  for (const c of simPlan.collisions) console.log(`    · suma filas ${c.rows.join("+")}: ${c.productName}`);
  reporte.planSimulado = { totals: simPlan.totals, principal: ajustesPrincipalExistentes.length, segunda: simPlan.cutis.length, unmatched: simPlan.unmatched, skipped: simPlan.skipped, collisions: simPlan.collisions };

  if (!APPLY) {
    writeFileSync(path.join(outDir, "reporte.json"), JSON.stringify(reporte, null, 2));
    console.log(`\nSimulación guardada en ${outDir}/reporte.json. Para aplicar: añade --apply\n`);
    return;
  }

  // ─── APLICAR ───
  console.log(`\n▶ Referencia de auditoría: ${reference}`);
  const creados: Array<{ id: string; sku: string; name: string; qtyPrincipal: number; qtyTotal: number }> = [];
  const fallosAlta: Array<{ name: string; error: string }> = [];

  // 3a) Renombres
  for (const r of renombres) {
    if (!r.productId) continue;
    await patch("products", `id=eq.${r.productId}&${B}`, { name: r.nombreFinal, updated_at: new Date().toISOString() });
  }
  console.log(`✓ Renombrados: ${renombres.filter((r) => r.productId).length}`);

  // 3b) Productos nuevos (reintento de SKU ante colisión, como product.create)
  for (const n of nuevos) {
    let sku = String(n.row.sku);
    let ok = false;
    for (let attempt = 0; attempt < 10 && !ok; attempt++) {
      try {
        const p = await insert<{ id: string }>("products", { ...n.row, sku });
        creados.push({ id: p.id, sku, name: String(n.row.name), qtyPrincipal: n.qtyPrincipal, qtyTotal: n.qtyTotal });
        ok = true;
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === "23505" && /sku/i.test(err.message)) {
          sku = nextSkuAfter(sku);
          continue;
        }
        fallosAlta.push({ name: String(n.row.name), error: err.message });
        break;
      }
    }
  }
  console.log(`✓ Productos creados: ${creados.length}${fallosAlta.length ? ` · fallos: ${fallosAlta.length}` : ""}`);
  for (const f of fallosAlta) console.log(`    ✗ ${f.name}: ${f.error}`);

  // 3c) Lote inicial en Principal (con su movimiento si trae unidades)
  const res = nuevoResultado();
  let lotesIniciales = 0;
  for (const c of creados) {
    if (c.qtyPrincipal === 0 && c.qtyTotal === 0) continue;
    try {
      const lot = await insert<{ id: string }>("product_lots", {
        business_id: BUSINESS_ID,
        branch_id: db.principal.id,
        product_id: c.id,
        warehouse_id: db.whPrincipal,
        lot_number: `AJU-${reference}`,
        expires_at: vencimientoProvisional,
        received_at: new Date().toISOString(),
        initial_quantity: c.qtyPrincipal,
        current_quantity: c.qtyPrincipal,
        unit_cost: Number(nuevos.find((n) => n.row.sku === c.sku)?.row.cost ?? 0),
        status: "available",
      });
      lotesIniciales++;
      if (c.qtyPrincipal > 0) {
        await insert("inventory_movements", {
          business_id: BUSINESS_ID,
          branch_id: db.principal.id,
          product_id: c.id,
          lot_id: lot.id,
          warehouse_id: db.whPrincipal,
          type: "adjustment_positive",
          quantity: c.qtyPrincipal,
          reason: reasonNuevo,
          reference,
          user_id: OWNER_USER_ID,
          user_name: USER_NAME,
        });
        res.movements++;
      }
    } catch (e) {
      res.failures.push({ productName: c.name, error: (e as Error).message, stockAplicado: false });
    }
  }
  console.log(`✓ Lotes iniciales en Principal: ${lotesIniciales}`);

  // 3d) Plan real contra la base ya actualizada, y aplicación
  const db2 = await loadDb(rest);
  const fuentes = fuentesPlan(db2);
  const plan = buildImportPlan({ rows: simRows, ...fuentes, cutisWarehouseId: db2.whSegunda, zeroMissing: false, today });
  console.log(`▶ Plan real: Principal ${plan.principal.length} · Segunda ${plan.cutis.length} (${plan.cutis.filter((a) => a.newLot).length} lotes nuevos) · omitidos ${plan.skipped.length} · no emparejados ${plan.unmatched.length}`);
  await aplicarPlan(rest, db2, plan, { reference, reason, userId: OWNER_USER_ID, userName: USER_NAME, res });
  console.log(`✓ Ajustes aplicados: Principal ${res.appliedPrincipal} · Segunda ${res.appliedSegunda} · lotes actualizados ${res.lotsUpdated} · lotes creados ${res.lotsCreated} · movimientos ${res.movements} · fallos ${res.failures.length}`);
  for (const f of res.failures) console.log(`    ✗ ${f.productName}: ${f.error}${f.stockAplicado ? "  [STOCK QUEDÓ A MEDIAS: revisar a mano]" : ""}`);

  // 4) Verificación releyendo la base
  const db3 = await loadDb(rest);
  const v = verificar(rows, db3);
  console.log(`\n── Verificación final: ${v.cuadran}/${v.comparados} productos cuadran · ${v.noCuadran.length} no cuadran · ${v.sinProducto.length} filas sin producto`);
  for (const x of v.noCuadran.slice(0, 40)) console.log(`    ≠ ${x.name} (filas ${x.rows.join(",")}): Alegra P=${x.alegraP} S=${x.alegraS} | DermaLand P=${x.dbP} S=${x.dbS}`);
  for (const r of v.sinProducto) console.log(`    · sin producto: fila ${r.rowNumber} ${r.name} (${r.estado}, total ${r.qtyTotal})`);
  const totalP = db3.lots.filter((l) => l.branch_id === db3.principal.id && l.status !== "quarantine" && l.status !== "recalled").reduce((a, l) => a + l.current_quantity, 0);
  const totalS = db3.lots.filter((l) => l.branch_id === db3.segunda.id && l.status !== "quarantine" && l.status !== "recalled").reduce((a, l) => a + l.current_quantity, 0);
  console.log(`  Stock final: Principal ${totalP} uds · ${db3.segunda.name} ${totalS} uds · productos en catálogo ${db3.products.length}`);

  Object.assign(reporte, { reference, creados, fallosAlta, lotesIniciales, resultado: res, verificacion: v, stockFinal: { principal: totalP, segunda: totalS }, fin: new Date().toISOString() });
  writeFileSync(path.join(outDir, "reporte.json"), JSON.stringify(reporte, null, 2));
  console.log(`\nReporte guardado en ${outDir}/reporte.json\n`);
}

main().catch((e) => {
  console.error("\n✗ Error:", e);
  process.exit(1);
});
