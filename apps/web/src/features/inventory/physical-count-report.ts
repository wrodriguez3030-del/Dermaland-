// Lógica PURA del reporte de Inventario físico (conteo físico).
//
// Sin React ni DOM ni xlsx: toma un conteo (InventoryCount) con sus ítems y
// escaneos y deriva todas las filas/KPIs listas para mostrar o exportar.
// Testeable de forma aislada. NO toca DGII, secuencias ni datos: solo lee y
// agrega. Resuelve nombres legibles (producto, marca, laboratorio, sucursal,
// usuario) mediante `lookups`, de modo que el resultado NO expone ids internos
// ni almacén/warehouse.

import type {
  InventoryCount,
  InventoryCountItem,
  InventoryCountScan,
  InventoryMovement,
} from "@/types";

// ─── Etiquetas ───────────────────────────────────────────────────────────────

export const COUNT_STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  in_progress: "En progreso",
  paused: "Pausado",
  submitted: "Enviado",
  reviewed: "Revisado",
  approved: "Aprobado",
  rejected: "Rechazado",
  adjusted: "Ajustado",
  cancelled: "Cancelado",
};

export const COUNT_TYPE_LABEL: Record<string, string> = {
  full: "Total",
  partial: "Parcial",
  spot: "Spot",
};

const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  count_adjustment: "Ajuste por conteo",
  adjustment_positive: "Ajuste (aumento)",
  adjustment_negative: "Ajuste (disminución)",
};

/** Estado por diferencia, según las reglas del reporte (basado en el signo). */
export function differenceStatusLabel(difference: number): string {
  if (difference === 0) return "Correcto";
  return difference < 0 ? "Faltante" : "Sobrante";
}

function differenceTypeLabel(difference: number): string {
  return difference < 0 ? "Faltante" : "Sobrante";
}

function recommendedAction(difference: number): string {
  if (difference === 0) return "Sin ajuste";
  return difference < 0 ? "Ajustar disminución" : "Ajustar aumento";
}

function scanResultLabel(scan: InventoryCountScan, found: boolean): string {
  if (!found) return "No encontrado";
  if (scan.syncStatus === "failed") return "Error";
  if (scan.scanSource === "manual") return "Manual";
  return "Sumado";
}

// ─── Resolutores ─────────────────────────────────────────────────────────────

export interface ProductLite {
  sku?: string;
  barcode?: string;
  name?: string;
  brandId?: string;
  categoryId?: string;
  laboratoryId?: string;
  cost?: number;
}

export interface CountLookups {
  product: (id: string) => ProductLite | undefined;
  /** Costo del lote si se conoce; si no, se cae al costo del producto. */
  lotUnitCost: (lotId: string | undefined) => number | undefined;
  brandName: (id: string | undefined) => string;
  categoryName: (id: string | undefined) => string;
  labName: (id: string | undefined) => string;
  branchName: (id: string | undefined) => string;
  userName: (id: string | undefined) => string;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function itemUnitCost(item: InventoryCountItem, lk: CountLookups): number {
  const fromLot = lk.lotUnitCost(item.productLotId);
  if (fromLot != null) return fromLot;
  return lk.product(item.productId)?.cost ?? 0;
}

// ─── Tipos del informe (todo legible, SIN ids internos) ──────────────────────

export interface PhysicalCountSummary {
  businessName: string;
  reportName: string;
  countNumber: string;
  branchName: string;
  countTypeLabel: string;
  statusLabel: string;
  startedAt: string;
  closedAt: string;
  startedByName: string;
  approvedByName: string;
  generatedAt: string;
  totalSystemProducts: number;
  totalScannedProducts: number;
  totalScans: number;
  productsMatch: number;
  productsShortage: number;
  productsOverage: number;
  shortageValue: number;
  overageValue: number;
  netDifferenceValue: number;
  notes: string;
}

export interface CountDetailRow {
  sku: string;
  barcode: string;
  product: string;
  laboratory: string;
  brand: string;
  category: string;
  branch: string;
  lot: string;
  expiresAt: string;
  systemStock: number;
  counted: number;
  difference: number;
  unitCost: number;
  differenceValue: number;
  statusLabel: string;
  notes: string;
}

export interface CountDiffRow {
  product: string;
  sku: string;
  lot: string;
  branch: string;
  system: number;
  counted: number;
  difference: number;
  diffType: string;
  unitCost: number;
  differenceValue: number;
  recommendedAction: string;
  notes: string;
}

export interface CountScanRow {
  dateTime: string;
  scannedCode: string;
  productFound: string;
  sku: string;
  barcode: string;
  branch: string;
  user: string;
  result: string;
  addedQty: number;
  accumulatedQty: number;
  device: string;
  notes: string;
}

export interface NotFoundRow {
  dateTime: string;
  scannedCode: string;
  user: string;
  branch: string;
  timesScanned: number;
  suggestedAction: string;
  notes: string;
}

export interface AdjustmentRow {
  product: string;
  sku: string;
  lot: string;
  branch: string;
  previousQty: number | null;
  countedQty: number | null;
  adjustment: number;
  movement: string;
  user: string;
  date: string;
  reason: string;
}

export interface PhysicalCountReport {
  summary: PhysicalCountSummary;
  detail: CountDetailRow[];
  differences: CountDiffRow[];
  scans: CountScanRow[];
  notFound: NotFoundRow[];
  adjustments: AdjustmentRow[];
}

export interface BuildPhysicalCountInput {
  count: InventoryCount;
  items: InventoryCountItem[];
  scans: InventoryCountScan[];
  /** Movimientos de inventario cuyo `reference` apunta a este conteo. */
  movements: InventoryMovement[];
  lookups: CountLookups;
  businessName: string;
  generatedAt: string;
}

// ─── Construcción del informe ────────────────────────────────────────────────

export function buildPhysicalCountReport(
  input: BuildPhysicalCountInput,
): PhysicalCountReport {
  const { count, items, scans, movements, lookups: lk } = input;

  // Detalle contado (una fila por ítem del conteo).
  const detail: CountDetailRow[] = items.map((it) => {
    const product = lk.product(it.productId);
    const cost = itemUnitCost(it, lk);
    const diffValue = round2(it.differenceQuantity * cost);
    return {
      sku: it.productSku || product?.sku || "",
      barcode: product?.barcode ?? "",
      product: it.productName || product?.name || "",
      laboratory: lk.labName(product?.laboratoryId),
      brand: lk.brandName(product?.brandId),
      category: lk.categoryName(product?.categoryId),
      branch: lk.branchName(count.branchId),
      lot: it.lotNumber ?? "",
      expiresAt: it.expiresAt ?? "",
      systemStock: it.expectedQuantity,
      counted: it.countedQuantity,
      difference: it.differenceQuantity,
      unitCost: round2(cost),
      differenceValue: diffValue,
      statusLabel: differenceStatusLabel(it.differenceQuantity),
      notes: "",
    };
  });

  // Diferencias (solo ítems con diferencia ≠ 0).
  const differences: CountDiffRow[] = items
    .filter((it) => it.differenceQuantity !== 0)
    .map((it) => {
      const cost = itemUnitCost(it, lk);
      return {
        product: it.productName,
        sku: it.productSku,
        lot: it.lotNumber ?? "",
        branch: lk.branchName(count.branchId),
        system: it.expectedQuantity,
        counted: it.countedQuantity,
        difference: it.differenceQuantity,
        diffType: differenceTypeLabel(it.differenceQuantity),
        unitCost: round2(cost),
        differenceValue: round2(it.differenceQuantity * cost),
        recommendedAction: recommendedAction(it.differenceQuantity),
        notes: "",
      };
    });

  // Escaneos (orden cronológico, cantidad acumulada por producto).
  const sortedScans = [...scans].sort((a, b) =>
    a.scannedAt < b.scannedAt ? -1 : a.scannedAt > b.scannedAt ? 1 : 0,
  );
  const acc = new Map<string, number>();
  const scanRows: CountScanRow[] = [];
  const notFoundAgg = new Map<
    string,
    { dateTime: string; user: string; branch: string; count: number }
  >();
  for (const s of sortedScans) {
    const product = lk.product(s.productId);
    const found = !!product;
    const accumulated = (acc.get(s.productId) ?? 0) + s.scannedQuantity;
    acc.set(s.productId, accumulated);
    scanRows.push({
      dateTime: s.scannedAt,
      scannedCode: s.barcode ?? "",
      productFound: product?.name ?? "—",
      sku: product?.sku ?? "",
      barcode: product?.barcode ?? s.barcode ?? "",
      branch: lk.branchName(s.branchId),
      user: s.scannedByName,
      result: scanResultLabel(s, found),
      addedQty: s.scannedQuantity,
      accumulatedQty: accumulated,
      device: s.deviceId,
      notes: s.notes ?? "",
    });
    if (!found) {
      const key = s.barcode ?? "(sin código)";
      const prev = notFoundAgg.get(key);
      if (prev) prev.count += 1;
      else
        notFoundAgg.set(key, {
          dateTime: s.scannedAt,
          user: s.scannedByName,
          branch: lk.branchName(s.branchId),
          count: 1,
        });
    }
  }

  const notFound: NotFoundRow[] = [...notFoundAgg.entries()].map(
    ([code, v]) => ({
      dateTime: v.dateTime,
      scannedCode: code,
      user: v.user,
      branch: v.branch,
      timesScanned: v.count,
      suggestedAction: "Crear producto",
      notes: "",
    }),
  );

  // Ajustes generados (movimientos cuyo reference apunta a este conteo).
  const itemByKey = new Map<string, InventoryCountItem>();
  for (const it of items) {
    itemByKey.set(`${it.productId}|${it.productLotId ?? ""}`, it);
  }
  const adjustments: AdjustmentRow[] = movements
    .filter((m) => m.reference === count.id)
    .map((m) => {
      const it =
        itemByKey.get(`${m.productId}|${m.lotId ?? ""}`) ??
        items.find((x) => x.productId === m.productId);
      const product = lk.product(m.productId);
      return {
        product: it?.productName || product?.name || "",
        sku: it?.productSku || product?.sku || "",
        lot: it?.lotNumber ?? "",
        branch: lk.branchName(m.branchId),
        previousQty: it ? it.expectedQuantity : null,
        countedQty: it ? it.countedQuantity : null,
        adjustment: m.quantity,
        movement: MOVEMENT_TYPE_LABEL[m.type] ?? m.type,
        user: m.userName,
        date: m.createdAt,
        reason: m.reason ?? "",
      };
    });

  // KPIs / resumen.
  const productsMatch = items.filter((i) => i.differenceQuantity === 0).length;
  const productsShortage = items.filter((i) => i.differenceQuantity < 0).length;
  const productsOverage = items.filter((i) => i.differenceQuantity > 0).length;
  let shortageValue = 0;
  let overageValue = 0;
  for (const it of items) {
    const value = it.differenceQuantity * itemUnitCost(it, lk);
    if (it.differenceQuantity < 0) shortageValue += -value;
    else if (it.differenceQuantity > 0) overageValue += value;
  }
  const distinctSystemProducts = new Set(items.map((i) => i.productId)).size;
  const distinctScannedProducts =
    scans.length > 0
      ? new Set(scans.map((s) => s.productId)).size
      : items.filter((i) => i.countedQuantity > 0).length;
  const totalScans = scans.length > 0 ? scans.length : count.scanCount;

  const closedAt =
    count.approvedAt ?? count.submittedAt ?? count.cancelledAt ?? "";

  const summary: PhysicalCountSummary = {
    businessName: input.businessName || "DermaLand",
    reportName: "Inventario físico",
    countNumber: count.countNumber,
    branchName: lk.branchName(count.branchId),
    countTypeLabel: COUNT_TYPE_LABEL[count.countType] ?? count.countType,
    statusLabel: COUNT_STATUS_LABEL[count.status] ?? count.status,
    startedAt: count.startedAt ?? count.createdAt ?? "",
    closedAt,
    startedByName:
      lk.userName(count.createdBy) ||
      lk.userName(count.assignedTo?.[0]) ||
      "—",
    approvedByName: lk.userName(count.approvedBy) || "—",
    generatedAt: input.generatedAt,
    totalSystemProducts: distinctSystemProducts,
    totalScannedProducts: distinctScannedProducts,
    totalScans,
    productsMatch,
    productsShortage,
    productsOverage,
    shortageValue: round2(shortageValue),
    overageValue: round2(overageValue),
    netDifferenceValue: round2(overageValue - shortageValue),
    notes: count.notes ?? "",
  };

  return { summary, detail, differences, scans: scanRows, notFound, adjustments };
}

// ─── Lista de conteos (exportación desde la pantalla general) ────────────────

export interface CountListRow {
  countNumber: string;
  branch: string;
  typeLabel: string;
  statusLabel: string;
  startedAt: string;
  closedAt: string;
  scans: number;
  items: number;
  notes: string;
}

export function buildCountsList(
  counts: InventoryCount[],
  lk: Pick<CountLookups, "branchName">,
): CountListRow[] {
  return counts.map((c) => ({
    countNumber: c.countNumber,
    branch: lk.branchName(c.branchId),
    typeLabel: COUNT_TYPE_LABEL[c.countType] ?? c.countType,
    statusLabel: COUNT_STATUS_LABEL[c.status] ?? c.status,
    startedAt: c.startedAt ?? c.createdAt ?? "",
    closedAt: c.approvedAt ?? c.submittedAt ?? c.cancelledAt ?? "",
    scans: c.scanCount,
    items: c.itemCount,
    notes: c.notes ?? "",
  }));
}
