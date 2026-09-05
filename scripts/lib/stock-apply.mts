/**
 * Lectura de la base y APLICACIÓN del plan de stock, compartidas por
 * `migrar-inventario-alegra.mts` y `alegra-sync.mts`.
 *
 * La escritura tiene la MISMA semántica que `alegra-import-apply.ts` (la de la
 * pantalla): cada producto es su unidad atómica-con-compensación, se registra
 * un movimiento por producto, y si algo falla a mitad se revierten los lotes ya
 * tocados. Los lotes en cuarentena o recall quedan siempre fuera.
 */
import type {
  AlegraRow,
  BranchAdjustment,
  ImportPlan,
  PlanLot,
  PlanProduct,
} from "../../apps/web/src/features/inventory/alegra-import";
import { normalizeProductName } from "../../apps/web/src/features/inventory/alegra-import";
import type { Rest } from "./supabase-rest.mts";

/** DermaLand. NUNCA sale de un archivo ni de una API: es constante del código. */
export const BUSINESS_ID = "00000000-0000-0000-0000-00000000d001";
export const B = `business_id=eq.${BUSINESS_ID}`;
/** Productos procesados en paralelo. Acotado para no saturar PostgREST. */
export const CONCURRENCY = 4;

export interface DbProduct {
  id: string;
  sku: string | null;
  name: string;
  active: boolean;
  deleted_at: string | null;
  brand_id: string | null;
  laboratory_id: string | null;
  alegra_id?: string | null;
}
export interface DbLot {
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
export interface DbBranch {
  id: string;
  name: string;
  status: string;
}
export interface DbWarehouse {
  id: string;
  branch_id: string;
  is_main: boolean;
}
export interface Named {
  id: string;
  name: string;
}

export interface DbState {
  principal: DbBranch;
  segunda: DbBranch;
  whPrincipal: string;
  whSegunda: string;
  products: DbProduct[];
  lots: DbLot[];
  brands: Named[];
  labs: Named[];
  cats: Named[];
}

const key = (s: string): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export async function loadDb(rest: Rest): Promise<DbState> {
  const [branches, warehouses, products, lots, brands, labs, cats] = await Promise.all([
    rest.getAll<DbBranch>(`branches?select=id,name,status&${B}&deleted_at=is.null`),
    rest.getAll<DbWarehouse>(`warehouses?select=id,branch_id,is_main&${B}`),
    rest.getAll<DbProduct>(
      `products?select=id,sku,name,active,deleted_at,brand_id,laboratory_id,alegra_id&${B}&deleted_at=is.null&order=id`,
    ),
    rest.getAll<DbLot>(
      `product_lots?select=id,branch_id,product_id,warehouse_id,lot_number,expires_at,received_at,current_quantity,status&${B}&order=id`,
    ),
    rest.getAll<Named>(`brands?select=id,name&${B}`),
    rest.getAll<Named>(`laboratories?select=id,name&${B}`),
    rest.getAll<Named>(`product_categories?select=id,name&${B}`),
  ]);
  // Misma regla que pickImportBranches (v0.139.1): Principal por nombre; la
  // segunda = la única otra sucursal activa.
  const principales = branches.filter((b) => key(b.name).includes("principal"));
  if (principales.length !== 1) {
    throw new Error(`Sucursal Principal ambigua o ausente: ${branches.map((b) => b.name).join(" · ")}`);
  }
  const principal = principales[0]!;
  const otras = branches.filter((b) => b.id !== principal.id && b.status !== "inactive");
  if (otras.length !== 1) {
    throw new Error(`Segunda sucursal ambigua o ausente: ${otras.map((b) => b.name).join(" · ")}`);
  }
  const segunda = otras[0]!;
  const wh = (branchId: string): string => {
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

export function fuentesPlan(db: DbState): {
  products: PlanProduct[];
  principalLots: PlanLot[];
  cutisLots: PlanLot[];
} {
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

export interface Fallo {
  productName: string;
  error: string;
  stockAplicado: boolean;
}
export interface Resultado {
  appliedPrincipal: number;
  appliedSegunda: number;
  lotsUpdated: number;
  lotsCreated: number;
  movements: number;
  failures: Fallo[];
}

export function nuevoResultado(): Resultado {
  return {
    appliedPrincipal: 0,
    appliedSegunda: 0,
    lotsUpdated: 0,
    lotsCreated: 0,
    movements: 0,
    failures: [],
  };
}

async function aplicarAjuste(
  rest: Rest,
  adj: BranchAdjustment,
  branchId: string,
  counter: "appliedPrincipal" | "appliedSegunda",
  opts: { reference: string; reason: string; userId: string; userName: string },
  res: Resultado,
): Promise<void> {
  const touched: Array<{ lotId: string; from: number }> = [];
  let created = 0;
  let updated = 0;
  try {
    let lotId: string;
    let warehouseId: string;
    if (adj.newLot) {
      const lot = await rest.insert<{ id: string }>("product_lots", {
        business_id: BUSINESS_ID,
        branch_id: branchId,
        product_id: adj.productId,
        warehouse_id: adj.newLot.warehouseId,
        lot_number: `AJU-${opts.reference}`,
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
        await rest.patch("product_lots", `id=eq.${c.lotId}&${B}`, {
          current_quantity: c.to,
          updated_at: new Date().toISOString(),
        });
        touched.push({ lotId: c.lotId, from: c.from });
        updated++;
      }
      lotId = first.lotId;
      warehouseId = first.warehouseId;
    }
    await rest.insert("inventory_movements", {
      business_id: BUSINESS_ID,
      branch_id: branchId,
      product_id: adj.productId,
      lot_id: lotId,
      warehouse_id: warehouseId,
      type: adj.delta > 0 ? "adjustment_positive" : "adjustment_negative",
      quantity: Math.abs(adj.delta),
      reason: opts.reason,
      reference: opts.reference,
      user_id: opts.userId,
      user_name: opts.userName,
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
          await rest.patch("product_lots", `id=eq.${t.lotId}&${B}`, {
            current_quantity: t.from,
            updated_at: new Date().toISOString(),
          });
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
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor++;
      const it = items[i];
      if (it === undefined) return;
      await fn(it);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

/**
 * Aplica el plan en las dos sucursales. Con `res` acumula sobre un resultado
 * previo (el script de migración ya contó ahí los lotes iniciales).
 */
export async function aplicarPlan(
  rest: Rest,
  db: DbState,
  plan: ImportPlan,
  opts: { reference: string; reason: string; userId: string; userName: string; res?: Resultado },
): Promise<Resultado> {
  const res = opts.res ?? nuevoResultado();
  const jobs = [
    ...plan.principal.map((adj) => ({ adj, branchId: db.principal.id, counter: "appliedPrincipal" as const })),
    ...plan.cutis.map((adj) => ({ adj, branchId: db.segunda.id, counter: "appliedSegunda" as const })),
  ];
  await correr(jobs, (j) => aplicarAjuste(rest, j.adj, j.branchId, j.counter, opts, res));
  return res;
}

export interface VerificacionDesajuste {
  name: string;
  rows: number[];
  alegraP: number;
  dbP: number;
  alegraS: number;
  dbS: number;
}

/** Relee la base y compara, fila a fila, contra lo que declara el origen. */
export function verificar<R extends AlegraRow>(
  rows: R[],
  db: DbState,
): { comparados: number; cuadran: number; noCuadran: VerificacionDesajuste[]; sinProducto: R[] } {
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
  const sinProducto: R[] = [];
  for (const r of rows) {
    if (
      !Number.isFinite(r.qtyPrincipal) ||
      !Number.isFinite(r.qtyTotal) ||
      r.qtyPrincipal < 0 ||
      r.qtyTotal < r.qtyPrincipal
    ) {
      continue;
    }
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
  const noCuadran: VerificacionDesajuste[] = [];
  for (const [id, o] of objetivo) {
    const s = stock.get(id) ?? { p: 0, s: 0 };
    if (s.p !== o.p || s.s !== o.s) {
      noCuadran.push({ name: o.name, rows: o.rows, alegraP: o.p, dbP: s.p, alegraS: o.s, dbS: s.s });
    }
  }
  return { comparados: objetivo.size, cuadran: objetivo.size - noCuadran.length, noCuadran, sinProducto };
}
