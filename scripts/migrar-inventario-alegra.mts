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
  type BranchAdjustment,
  type PlanLot,
  type PlanProduct,
} from "../apps/web/src/features/inventory/alegra-import";
import { computeSalePrice, DEFAULT_MARGIN_PERCENT } from "../apps/web/src/features/products/pricing";
import { nextSkuAfter, nextSkuFromSkus } from "../apps/web/src/features/products/product-sku";
import { parseProductName } from "../apps/web/src/lib/import/product-parser";

// ─── Constantes del negocio ───────────────────────────────────────────────
const BUSINESS_ID = "00000000-0000-0000-0000-00000000d001"; // DermaLand (NO la cuenta CNTTEST)
const OWNER_USER_ID = "2f707d5c-65c2-4388-b2b9-592693414b9f"; // Dario (admin) — autorizó la migración
const USER_NAME = "Dario (script migración Alegra)";
const ITBIS_RATE = 18;
const DIAS_VENCIMIENTO_PROVISIONAL = 365;
/** Costo (DOP) por debajo del cual se considera relleno y NO se deriva precio. */
const COSTO_MINIMO_CREIBLE = 10;
const CONCURRENCY = 4;

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

const env = Object.fromEntries(
  readFileSync(path.join(ROOT, "apps/web/.env.local"), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en apps/web/.env.local");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function getAll<T>(pathQ: string): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const r = await fetch(`${URL}/rest/v1/${pathQ}`, {
      headers: { ...H, Range: `${from}-${from + page - 1}`, "Range-Unit": "items" },
    });
    if (!r.ok) throw new Error(`GET ${pathQ} → ${r.status} ${await r.text()}`);
    const j = (await r.json()) as T[];
    out.push(...j);
    if (j.length < page) break;
  }
  return out;
}
async function insert<T>(table: string, row: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  const text = await r.text();
  if (!r.ok) {
    const err = new Error(`POST ${table} → ${r.status} ${text}`) as Error & { code?: string };
    try {
      err.code = (JSON.parse(text) as { code?: string }).code;
    } catch {
      /* sin código */
    }
    throw err;
  }
  return (JSON.parse(text) as T[])[0]!;
}
async function patch(table: string, filter: string, body: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${table}?${filter} → ${r.status} ${await r.text()}`);
}

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

// ─── Tipos de la base ─────────────────────────────────────────────────────
interface DbProduct {
  id: string;
  sku: string | null;
  name: string;
  active: boolean;
  deleted_at: string | null;
  brand_id: string | null;
  laboratory_id: string | null;
}
interface DbLot {
  id: string;
  branch_id: string;
  product_id: string;
  warehouse_id: string;
  lot_number: string;
  expires_at: string;
  received_at: string;
  current_quantity: number;
  status: string;
}
interface DbBranch { id: string; name: string; status: string }
interface DbWarehouse { id: string; branch_id: string; is_main: boolean }
interface Named { id: string; name: string }

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

// ─── Fuentes de la base ───────────────────────────────────────────────────
const B = `business_id=eq.${BUSINESS_ID}`;
async function loadDb() {
  const [branches, warehouses, products, lots, brands, labs, cats] = await Promise.all([
    getAll<DbBranch>(`branches?select=id,name,status&${B}&deleted_at=is.null`),
    getAll<DbWarehouse>(`warehouses?select=id,branch_id,is_main&${B}`),
    getAll<DbProduct>(`products?select=id,sku,name,active,deleted_at,brand_id,laboratory_id&${B}&deleted_at=is.null&order=id`),
    getAll<DbLot>(`product_lots?select=id,branch_id,product_id,warehouse_id,lot_number,expires_at,received_at,current_quantity,status&${B}&order=id`),
    getAll<Named>(`brands?select=id,name&${B}`),
    getAll<Named>(`laboratories?select=id,name&${B}`),
    getAll<Named>(`product_categories?select=id,name&${B}`),
  ]);
  // Misma regla que pickImportBranches (v0.139.1): Principal por nombre; la
  // segunda = la única otra sucursal activa.
  const principales = branches.filter((b) => key(b.name).includes("principal"));
  if (principales.length !== 1) throw new Error(`Sucursal Principal ambigua o ausente: ${branches.map((b) => b.name).join(" · ")}`);
  const principal = principales[0]!;
  const otras = branches.filter((b) => b.id !== principal.id && b.status !== "inactive");
  if (otras.length !== 1) throw new Error(`Segunda sucursal ambigua o ausente: ${otras.map((b) => b.name).join(" · ")}`);
  const segunda = otras[0]!;
  const wh = (branchId: string) => {
    const ws = warehouses.filter((w) => w.branch_id === branchId);
    const w = ws.find((x) => x.is_main) ?? ws[0];
    if (!w) throw new Error(`La sucursal ${branchId} no tiene almacén.`);
    return w.id;
  };
  return {
    principal,
    segunda,
    whPrincipal: wh(principal.id),
    whSegunda: wh(segunda.id),
    products,
    lots,
    brands,
    labs,
    cats,
  };
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
  db: Awaited<ReturnType<typeof loadDb>>,
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

// ─── Aplicación del plan (misma semántica que alegra-import-apply.ts) ─────
interface Fallo { productName: string; error: string; stockAplicado: boolean }
interface Resultado {
  appliedPrincipal: number;
  appliedSegunda: number;
  lotsUpdated: number;
  lotsCreated: number;
  movements: number;
  failures: Fallo[];
}

async function aplicarAjuste(
  adj: BranchAdjustment,
  branchId: string,
  reference: string,
  reason: string,
  counter: "appliedPrincipal" | "appliedSegunda",
  res: Resultado,
): Promise<void> {
  const touched: Array<{ lotId: string; from: number }> = [];
  let created = 0;
  let updated = 0;
  try {
    let lotId: string;
    let warehouseId: string;
    if (adj.newLot) {
      const lot = await insert<{ id: string }>("product_lots", {
        business_id: BUSINESS_ID,
        branch_id: branchId,
        product_id: adj.productId,
        warehouse_id: adj.newLot.warehouseId,
        lot_number: `AJU-${reference}`,
        expires_at: adj.newLot.expiresAt,
        received_at: new Date().toISOString(),
        initial_quantity: adj.newLot.quantity,
        current_quantity: adj.newLot.quantity,
        unit_cost: 0,
        status: "available",
      });
      created = 1;
      lotId = lot.id;
      warehouseId = adj.newLot.warehouseId;
      touched.push({ lotId: lot.id, from: 0 });
    } else {
      const first = adj.lotChanges[0];
      if (!first) throw new Error("El plan no trae ningún lote que ajustar para este producto.");
      for (const c of adj.lotChanges) {
        await patch("product_lots", `id=eq.${c.lotId}&${B}`, { current_quantity: c.to, updated_at: new Date().toISOString() });
        touched.push({ lotId: c.lotId, from: c.from });
        updated++;
      }
      lotId = first.lotId;
      warehouseId = first.warehouseId;
    }
    await insert("inventory_movements", {
      business_id: BUSINESS_ID,
      branch_id: branchId,
      product_id: adj.productId,
      lot_id: lotId,
      warehouse_id: warehouseId,
      type: adj.delta > 0 ? "adjustment_positive" : "adjustment_negative",
      quantity: Math.abs(adj.delta),
      reason,
      reference,
      user_id: OWNER_USER_ID,
      user_name: USER_NAME,
    });
    res.movements++;
    res[counter]++;
    res.lotsUpdated += updated;
    res.lotsCreated += created;
  } catch (e) {
    let stockAplicado = false;
    if (touched.length > 0) {
      for (const t of touched) {
        try {
          await patch("product_lots", `id=eq.${t.lotId}&${B}`, { current_quantity: t.from, updated_at: new Date().toISOString() });
        } catch {
          stockAplicado = true;
        }
      }
    }
    res.failures.push({ productName: adj.productName, error: (e as Error).message, stockAplicado });
  }
}

async function correr<T>(items: T[], fn: (x: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      const it = items[i];
      if (it === undefined) return;
      await fn(it);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

function fuentesPlan(db: Awaited<ReturnType<typeof loadDb>>) {
  const toPlan = (l: DbLot): PlanLot => ({
    id: l.id,
    productId: l.product_id,
    warehouseId: l.warehouse_id,
    quantity: l.current_quantity,
    expiresAt: l.expires_at,
    receivedAt: l.received_at,
    lotNumber: l.lot_number,
  });
  const ajustables = db.lots.filter((l) => l.status !== "quarantine" && l.status !== "recalled");
  return {
    products: db.products.map((p): PlanProduct => ({ id: p.id, name: p.name })),
    principalLots: ajustables.filter((l) => l.branch_id === db.principal.id).map(toPlan),
    cutisLots: ajustables.filter((l) => l.branch_id === db.segunda.id).map(toPlan),
  };
}

function verificar(rows: FileRow[], db: Awaited<ReturnType<typeof loadDb>>) {
  const byName = new Map<string, DbProduct[]>();
  for (const p of db.products) {
    const k = normalizeProductName(p.name);
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }
  const stock = new Map<string, { p: number; s: number }>();
  for (const l of db.lots) {
    if (l.status === "quarantine" || l.status === "recalled") continue;
    const s = stock.get(l.product_id) ?? { p: 0, s: 0 };
    if (l.branch_id === db.principal.id) s.p += l.current_quantity;
    else if (l.branch_id === db.segunda.id) s.s += l.current_quantity;
    stock.set(l.product_id, s);
  }
  const objetivo = new Map<string, { name: string; p: number; s: number; rows: number[] }>();
  const sinProducto: FileRow[] = [];
  for (const r of rows) {
    if (!Number.isFinite(r.qtyPrincipal) || !Number.isFinite(r.qtyTotal) || r.qtyPrincipal < 0 || r.qtyTotal < r.qtyPrincipal) continue;
    const hits = byName.get(normalizeProductName(r.name)) ?? [];
    if (hits.length !== 1) {
      sinProducto.push(r);
      continue;
    }
    const id = hits[0]!.id;
    const o = objetivo.get(id) ?? { name: hits[0]!.name, p: 0, s: 0, rows: [] };
    o.p += r.qtyPrincipal;
    o.s += r.qtyTotal - r.qtyPrincipal;
    o.rows.push(r.rowNumber);
    objetivo.set(id, o);
  }
  const noCuadran: Array<{ name: string; rows: number[]; alegraP: number; dbP: number; alegraS: number; dbS: number }> = [];
  for (const [id, o] of objetivo) {
    const s = stock.get(id) ?? { p: 0, s: 0 };
    if (s.p !== o.p || s.s !== o.s) noCuadran.push({ name: o.name, rows: o.rows, alegraP: o.p, dbP: s.p, alegraS: o.s, dbS: s.s });
  }
  return { comparados: objetivo.size, cuadran: objetivo.size - noCuadran.length, noCuadran, sinProducto };
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(APPLY ? "\n⚠️  MODO APLICAR — se van a escribir cambios en PRODUCCIÓN\n" : "\n🔍 SIMULACIÓN (dry-run) — no se escribe nada\n");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const outDir = path.join(ROOT, "backups", `alegra-migracion-${stamp}`);
  mkdirSync(outDir, { recursive: true });
  const reporte: Record<string, unknown> = { archivo: FILE, apply: APPLY, inicio: new Date().toISOString() };

  const rows = await readFile(FILE!);
  const db = await loadDb();
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
  const res: Resultado = { appliedPrincipal: 0, appliedSegunda: 0, lotsUpdated: 0, lotsCreated: 0, movements: 0, failures: [] };
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
  const db2 = await loadDb();
  const fuentes = fuentesPlan(db2);
  const plan = buildImportPlan({ rows: simRows, ...fuentes, cutisWarehouseId: db2.whSegunda, zeroMissing: false, today });
  console.log(`▶ Plan real: Principal ${plan.principal.length} · Segunda ${plan.cutis.length} (${plan.cutis.filter((a) => a.newLot).length} lotes nuevos) · omitidos ${plan.skipped.length} · no emparejados ${plan.unmatched.length}`);
  await correr(
    [
      ...plan.principal.map((adj) => ({ adj, branchId: db2.principal.id, counter: "appliedPrincipal" as const })),
      ...plan.cutis.map((adj) => ({ adj, branchId: db2.segunda.id, counter: "appliedSegunda" as const })),
    ],
    (j) => aplicarAjuste(j.adj, j.branchId, reference, reason, j.counter, res),
  );
  console.log(`✓ Ajustes aplicados: Principal ${res.appliedPrincipal} · Segunda ${res.appliedSegunda} · lotes actualizados ${res.lotsUpdated} · lotes creados ${res.lotsCreated} · movimientos ${res.movements} · fallos ${res.failures.length}`);
  for (const f of res.failures) console.log(`    ✗ ${f.productName}: ${f.error}${f.stockAplicado ? "  [STOCK QUEDÓ A MEDIAS: revisar a mano]" : ""}`);

  // 4) Verificación releyendo la base
  const db3 = await loadDb();
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
