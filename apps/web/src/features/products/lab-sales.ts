import type { Laboratory, Product, Proforma } from "@/types";

/**
 * Agregación de ventas por laboratorio (puro, testeable).
 *
 * Las ventas salen de las proformas/comprobantes: por cada ítem vendido se
 * busca el producto y su `laboratoryId`, y se suma el monto y las unidades al
 * laboratorio correspondiente. Los productos sin laboratorio (o cuyo laboratorio
 * no está en la lista) se acumulan en una fila "Sin laboratorio" opcional
 * (`includeUnassigned`), que NO cuenta como laboratorio activo. Laboratorios sin
 * ventas aparecen con 0.
 *
 * Respeta el scope del negocio porque opera sobre proformas ya filtradas por
 * `business_id` (mismo tenant); admite filtros por sucursal y rango de fechas.
 */

const SALE_STATUSES = new Set<Proforma["status"]>([
  "paid",
  "partially_paid",
  "issued",
  "pending_ecf",
  "converted_to_ecf",
]);

const UNASSIGNED = "__none__";

export interface LabSalesRow {
  lab: Laboratory;
  totalMoney: number;
  units: number;
  /** Ventas distintas donde aparece el laboratorio. */
  transactions: number;
  /** Productos distintos vendidos del laboratorio. */
  productsSold: number;
  /** Ranking 1-based por monto vendido (desc); 0 para "Sin laboratorio". */
  rank: number;
  /** % del monto frente al laboratorio líder (0..100). */
  percentOfLeader: number;
  /** true en la fila sintética "Sin laboratorio". */
  isUnassigned?: boolean;
}

/**
 * Una fila del histórico migrado de Alegra, ya sumada por la función SQL
 * `ventas_por_laboratorio` (los agregados de PostgREST están apagados en este
 * proyecto, así que la suma se hace en la base, no en el navegador).
 *
 * `laboratorioId` vacío —o de un laboratorio que ya no está en el catálogo—
 * cae en «Sin laboratorio»: son RD$9,5 millones del histórico y descartarlos
 * dejaría el ranking sin cuadrar con el total del negocio.
 */
export interface LabAlegraRow {
  laboratorioId: string;
  total: number;
  unidades: number;
  /** Facturas DISTINTAS: una factura con dos productos del mismo lab es UNA venta. */
  facturas: number;
  /** Productos distintos vendidos de ese laboratorio. */
  productos: number;
}

export interface LabSalesFilters {
  branchId?: string;
  /** ISO date (inclusive). */
  from?: string;
  /** ISO date (inclusive). */
  to?: string;
  /** Incluir la fila "Sin laboratorio" con las ventas no asignadas. */
  includeUnassigned?: boolean;
}

export function computeLabSales(
  laboratories: Laboratory[],
  products: Product[],
  proformas: Proforma[],
  filters: LabSalesFilters = {},
  /**
   * Mitad del histórico migrado (ya filtrada por fecha y sucursal en la base:
   * los filtros de `filters` NO se le vuelven a aplicar aquí, porque estas
   * filas llegan sumadas y sin fecha).
   */
  alegra: LabAlegraRow[] = [],
): LabSalesRow[] {
  const validLabIds = new Set(laboratories.map((l) => l.id));
  const productLab = new Map<string, string>();
  for (const p of products) {
    if (p.laboratoryId) productLab.set(p.id, p.laboratoryId);
  }

  const money = new Map<string, number>();
  const units = new Map<string, number>();
  const sales = new Map<string, Set<string>>();
  const prods = new Map<string, Set<string>>();
  // Alegra llega ya contado por la base: son números, no conjuntos. Se suman
  // aparte y se añaden al final, porque no se pueden meter en un `Set`.
  const ventasAlegra = new Map<string, number>();
  const productosAlegra = new Map<string, number>();
  const ensure = (id: string) => {
    if (!money.has(id)) {
      money.set(id, 0);
      units.set(id, 0);
      sales.set(id, new Set());
      prods.set(id, new Set());
    }
  };
  for (const l of laboratories) ensure(l.id);
  ensure(UNASSIGNED);

  const fromTs = filters.from ? new Date(filters.from).getTime() : -Infinity;
  const toTs = filters.to ? new Date(filters.to).getTime() + 86_399_999 : Infinity;

  for (const pf of proformas) {
    if (!SALE_STATUSES.has(pf.status)) continue;
    if (filters.branchId && pf.branchId !== filters.branchId) continue;
    const ts = new Date(pf.createdAt).getTime();
    if (ts < fromTs || ts > toTs) continue;
    for (const item of pf.items) {
      const found = productLab.get(item.productId);
      const labId = found && validLabIds.has(found) ? found : UNASSIGNED;
      money.set(labId, (money.get(labId) ?? 0) + (item.total || 0));
      units.set(labId, (units.get(labId) ?? 0) + (item.quantity || 0));
      sales.get(labId)!.add(pf.id);
      prods.get(labId)!.add(item.productId);
    }
  }

  // ── mitad del histórico migrado ─────────────────────────────────────────
  // Un `laboratorioId` vacío, o que no está en el catálogo (borrado, o de otro
  // negocio), va a «Sin laboratorio»: mismo criterio que arriba con los
  // productos del sistema. Ni se inventa una fila ni se pierde el dinero.
  for (const fila of alegra) {
    const labId =
      fila.laboratorioId && validLabIds.has(fila.laboratorioId)
        ? fila.laboratorioId
        : UNASSIGNED;
    ensure(labId);
    money.set(labId, (money.get(labId) ?? 0) + (fila.total || 0));
    units.set(labId, (units.get(labId) ?? 0) + (fila.unidades || 0));
    ventasAlegra.set(labId, (ventasAlegra.get(labId) ?? 0) + (fila.facturas || 0));
    productosAlegra.set(labId, (productosAlegra.get(labId) ?? 0) + (fila.productos || 0));
  }

  const realRows: LabSalesRow[] = laboratories
    .map((lab) => ({
      lab,
      totalMoney: money.get(lab.id) ?? 0,
      units: units.get(lab.id) ?? 0,
      transactions: (sales.get(lab.id)?.size ?? 0) + (ventasAlegra.get(lab.id) ?? 0),
      productsSold: (prods.get(lab.id)?.size ?? 0) + (productosAlegra.get(lab.id) ?? 0),
      rank: 0,
      percentOfLeader: 0,
    }))
    .sort(
      (a, b) =>
        b.totalMoney - a.totalMoney ||
        b.units - a.units ||
        a.lab.name.localeCompare(b.lab.name),
    );

  const leader = realRows[0]?.totalMoney ?? 0;
  realRows.forEach((r, i) => {
    r.rank = i + 1;
    r.percentOfLeader = leader > 0 ? Math.round((r.totalMoney / leader) * 100) : 0;
  });

  const rows = [...realRows];
  const noneMoney = money.get(UNASSIGNED) ?? 0;
  const noneUnits = units.get(UNASSIGNED) ?? 0;
  if (filters.includeUnassigned && (noneMoney > 0 || noneUnits > 0)) {
    rows.push({
      lab: {
        id: "",
        name: "Sin laboratorio",
        businessId: "",
        createdAt: "",
        updatedAt: "",
      } as Laboratory,
      totalMoney: noneMoney,
      units: noneUnits,
      transactions:
        (sales.get(UNASSIGNED)?.size ?? 0) + (ventasAlegra.get(UNASSIGNED) ?? 0),
      productsSold:
        (prods.get(UNASSIGNED)?.size ?? 0) + (productosAlegra.get(UNASSIGNED) ?? 0),
      rank: 0,
      percentOfLeader: leader > 0 ? Math.round((noneMoney / leader) * 100) : 0,
      isUnassigned: true,
    });
  }
  return rows;
}

export interface LabProductRow {
  labId: string;
  labName: string;
  productId: string;
  sku: string;
  name: string;
  units: number;
  total: number;
}

/** Ventas por producto dentro de cada laboratorio (para el detalle/Excel). */
export function computeLabProductSales(
  laboratories: Laboratory[],
  products: Product[],
  proformas: Proforma[],
  filters: LabSalesFilters = {},
): LabProductRow[] {
  const labName = new Map(laboratories.map((l) => [l.id, l.name]));
  const validLabIds = new Set(laboratories.map((l) => l.id));
  const productLab = new Map<string, string>();
  for (const p of products) {
    if (p.laboratoryId) productLab.set(p.id, p.laboratoryId);
  }
  const fromTs = filters.from ? new Date(filters.from).getTime() : -Infinity;
  const toTs = filters.to ? new Date(filters.to).getTime() + 86_399_999 : Infinity;

  const acc = new Map<string, LabProductRow>();
  for (const pf of proformas) {
    if (!SALE_STATUSES.has(pf.status)) continue;
    if (filters.branchId && pf.branchId !== filters.branchId) continue;
    const ts = new Date(pf.createdAt).getTime();
    if (ts < fromTs || ts > toTs) continue;
    for (const item of pf.items) {
      const found = productLab.get(item.productId);
      const labId = found && validLabIds.has(found) ? found : "";
      if (labId === "" && !filters.includeUnassigned) continue;
      const key = `${labId}|${item.productId}`;
      const row =
        acc.get(key) ??
        acc
          .set(key, {
            labId,
            labName: labId ? labName.get(labId) ?? "Laboratorio" : "Sin laboratorio",
            productId: item.productId,
            sku: item.productSku,
            name: item.productName,
            units: 0,
            total: 0,
          })
          .get(key)!;
      row.units += item.quantity || 0;
      row.total += item.total || 0;
    }
  }
  return [...acc.values()].sort(
    (a, b) => a.labName.localeCompare(b.labName) || b.total - a.total,
  );
}

export interface LabSalesSummary {
  leader?: LabSalesRow;
  totalLabs: number;
  totalMoney: number;
  totalUnits: number;
  top3: LabSalesRow[];
  hasSales: boolean;
  /** Hay ventas de productos sin laboratorio asignado. */
  hasUnassigned: boolean;
}

export function summarizeLabSales(rows: LabSalesRow[]): LabSalesSummary {
  const totalMoney = rows.reduce((s, r) => s + r.totalMoney, 0);
  const totalUnits = rows.reduce((s, r) => s + r.units, 0);
  const realRows = rows.filter((r) => !r.isUnassigned);
  return {
    leader: realRows.find((r) => r.totalMoney > 0),
    totalLabs: realRows.length,
    totalMoney,
    totalUnits,
    top3: realRows.filter((r) => r.totalMoney > 0).slice(0, 3),
    hasSales: totalMoney > 0,
    hasUnassigned: rows.some((r) => r.isUnassigned && (r.totalMoney > 0 || r.units > 0)),
  };
}
