"use client";

import * as React from "react";
import type { InventoryMovement, ProductLot } from "@/types";
import { mockProductLots } from "@/lib/mock-data/catalog";
import { mockInventoryMovements } from "@/lib/mock-data/inventory-movements";
import { mockBusiness } from "@/lib/mock-data/tenancy";

/**
 * Store de lotes y movimientos de inventario — MVP (localStorage).
 *
 * El catálogo de productos vive global, pero el STOCK vive por lote, sucursal
 * y almacén. Aquí combinamos los lotes/movimientos seed con los creados desde
 * la UI:
 *
 *  - `dermaland.lots`         → lotes nuevos creados desde la UI (array)
 *  - `dermaland.lots.qty`     → overrides de `currentQuantity` por ajustes
 *  - `dermaland.movements`    → movimientos creados (entradas/ajustes)
 *
 * Producción: se reemplaza por repositorio Supabase (`product_lots`,
 * `inventory_movements`) — el contrato `addLot` / `adjustStock` mapea a
 * INSERT de lote + INSERT de movimiento dentro de una transacción.
 */

const KEY_LOTS = "dermaland.lots";
const KEY_QTY = "dermaland.lots.qty";
const KEY_MOVES = "dermaland.movements";
const CHANGE_EVENT = "dermaland:inventory-changed";

const ACTOR = { userId: "usr_cashier_1", userName: "Rosa Peralta" };

// ─── Persistencia ─────────────────────────────────────────────────────────────

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function readNewLots(): ProductLot[] {
  const v = safeRead<ProductLot[]>(KEY_LOTS, []);
  return Array.isArray(v) ? v : [];
}

function readQtyOverrides(): Record<string, number> {
  const v = safeRead<Record<string, number>>(KEY_QTY, {});
  return v && typeof v === "object" ? v : {};
}

function readNewMoves(): InventoryMovement[] {
  const v = safeRead<InventoryMovement[]>(KEY_MOVES, []);
  return Array.isArray(v) ? v : [];
}

// ─── Lectura ────────────────────────────────────────────────────────────────

/** Todos los lotes (seed + nuevos), con `currentQuantity` ajustado. */
export function listAllLots(): ProductLot[] {
  const overrides = readQtyOverrides();
  const seed = mockProductLots.map((l) =>
    overrides[l.id] != null ? { ...l, currentQuantity: overrides[l.id]! } : l,
  );
  const local = readNewLots().map((l) =>
    overrides[l.id] != null ? { ...l, currentQuantity: overrides[l.id]! } : l,
  );
  return [...seed, ...local];
}

export function listLotsByProduct(productId: string): ProductLot[] {
  return listAllLots()
    .filter((l) => l.productId === productId)
    .sort(
      (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
    );
}

/** Stock disponible total (sólo lotes `available`). */
export function availableStock(productId: string): number {
  return listAllLots()
    .filter((l) => l.productId === productId && l.status === "available")
    .reduce((s, l) => s + l.currentQuantity, 0);
}

export function listAllMovements(): InventoryMovement[] {
  return [...readNewMoves(), ...mockInventoryMovements];
}

export function listMovementsByProduct(productId: string): InventoryMovement[] {
  return listAllMovements()
    .filter((m) => m.productId === productId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

// ─── Estado de vencimiento ────────────────────────────────────────────────────

export type ExpiryStatus = "expired" | "soon" | "warn" | "ok";

/** Clasifica un lote por su fecha de vencimiento (soon < 30d, warn < 90d). */
export function expiryStatus(expiresAt: string, ref: Date = new Date()): ExpiryStatus {
  const days = Math.ceil(
    (new Date(expiresAt).getTime() - ref.getTime()) / 86_400_000,
  );
  if (days < 0) return "expired";
  if (days < 30) return "soon";
  if (days < 90) return "warn";
  return "ok";
}

// ─── Stock por sucursal / almacén ───────────────────────────────────────────

export interface BranchStockGroup {
  branchId: string;
  warehouseId: string;
  lots: ProductLot[];
  available: number;
}

export interface BranchStockSummary {
  branchId: string;
  lots: number;
  available: number;
  expired: number;
  soon: number;
}

/**
 * Stock de un producto agrupado SÓLO por sucursal (sin almacén) — base de la
 * sección "Stock por sucursal" que ve el usuario.
 */
export function stockBranchSummary(productId: string): BranchStockSummary[] {
  const map = new Map<string, BranchStockSummary>();
  for (const lot of listLotsByProduct(productId)) {
    let g = map.get(lot.branchId);
    if (!g) {
      g = { branchId: lot.branchId, lots: 0, available: 0, expired: 0, soon: 0 };
      map.set(lot.branchId, g);
    }
    g.lots += 1;
    if (lot.status === "available") g.available += lot.currentQuantity;
    const st = expiryStatus(lot.expiresAt);
    if (st === "expired") g.expired += 1;
    else if (st === "soon") g.soon += 1;
  }
  return [...map.values()];
}

/** Agrupa los lotes disponibles de un producto por sucursal + almacén. */
export function stockByBranch(productId: string): BranchStockGroup[] {
  const map = new Map<string, BranchStockGroup>();
  for (const lot of listLotsByProduct(productId)) {
    const key = `${lot.branchId}__${lot.warehouseId}`;
    let g = map.get(key);
    if (!g) {
      g = { branchId: lot.branchId, warehouseId: lot.warehouseId, lots: [], available: 0 };
      map.set(key, g);
    }
    g.lots.push(lot);
    if (lot.status === "available") g.available += lot.currentQuantity;
  }
  return [...map.values()];
}

// ─── Mutaciones ─────────────────────────────────────────────────────────────

export interface AddLotInput {
  productId: string;
  branchId: string;
  warehouseId: string;
  lotNumber: string;
  initialQuantity: number;
  expiresAt: string;
  unitCost?: number;
  supplierId?: string;
  notes?: string;
  /** Motivo del movimiento de entrada. */
  reason?: string;
}

export type AddLotResult =
  | { ok: true; lot: ProductLot }
  | { ok: false; error: string; missingFields?: string[] };

function genId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rand}`;
}

/** Valida un borrador de lote. `requireExpiry` exige fecha de vencimiento. */
export function validateLot(
  input: Partial<AddLotInput>,
  requireExpiry = true,
): string[] {
  const missing: string[] = [];
  if (!input.lotNumber?.trim()) missing.push("lotNumber");
  if (!input.branchId) missing.push("branchId");
  if (!input.warehouseId) missing.push("warehouseId");
  if (!(typeof input.initialQuantity === "number" && input.initialQuantity > 0))
    missing.push("initialQuantity");
  if (requireExpiry && !input.expiresAt) missing.push("expiresAt");
  return missing;
}

export function addLot(input: AddLotInput, requireExpiry = true): AddLotResult {
  const missing = validateLot(input, requireExpiry);
  if (missing.length > 0) {
    return { ok: false, error: "Complete los campos requeridos del lote.", missingFields: missing };
  }

  const now = new Date().toISOString();
  const lot: ProductLot = {
    id: genId("lot"),
    businessId: mockBusiness.id,
    branchId: input.branchId,
    productId: input.productId,
    warehouseId: input.warehouseId,
    lotNumber: input.lotNumber.trim(),
    expiresAt: input.expiresAt,
    receivedAt: now,
    initialQuantity: input.initialQuantity,
    currentQuantity: input.initialQuantity,
    unitCost: input.unitCost ?? 0,
    status: "available",
    supplierId: input.supplierId || undefined,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  const lots = readNewLots();
  safeWrite(KEY_LOTS, [...lots, lot]);

  // Movimiento de entrada por el lote inicial.
  pushMovement({
    productId: input.productId,
    lotId: lot.id,
    warehouseId: input.warehouseId,
    branchId: input.branchId,
    type: "entry_purchase",
    quantity: input.initialQuantity,
    reason: input.reason || "Entrada inicial",
    reference: lot.lotNumber,
  });

  return { ok: true, lot };
}

export interface AdjustStockInput {
  lotId: string;
  productId: string;
  warehouseId: string;
  branchId: string;
  /** Nueva cantidad absoluta del lote. */
  newQuantity: number;
  reason: string;
}

export type AdjustResult =
  | { ok: true; delta: number }
  | { ok: false; error: string };

export function adjustStock(input: AdjustStockInput): AdjustResult {
  if (!(typeof input.newQuantity === "number" && input.newQuantity >= 0)) {
    return { ok: false, error: "La nueva cantidad debe ser 0 o mayor." };
  }
  if (!input.reason?.trim()) {
    return { ok: false, error: "Indica el motivo del ajuste." };
  }
  const lot = listAllLots().find((l) => l.id === input.lotId);
  if (!lot) return { ok: false, error: "Lote no encontrado." };

  const delta = input.newQuantity - lot.currentQuantity;
  const overrides = readQtyOverrides();
  overrides[input.lotId] = input.newQuantity;
  safeWrite(KEY_QTY, overrides);

  pushMovement({
    productId: input.productId,
    lotId: input.lotId,
    warehouseId: input.warehouseId,
    branchId: input.branchId,
    type: delta >= 0 ? "adjustment_positive" : "adjustment_negative",
    quantity: delta,
    reason: input.reason.trim(),
    reference: lot.lotNumber,
  });

  return { ok: true, delta };
}

export interface TransferStockInput {
  originLotId: string;
  destBranchId: string;
  destWarehouseId: string;
  quantity: number;
  /** Referencia común de la transferencia (número). */
  reference: string;
  notes?: string;
}

export type TransferStockResult =
  | { ok: true; destLotId: string }
  | { ok: false; error: string };

/**
 * Mueve `quantity` de un lote de origen a un almacén destino, preservando
 * número de lote y fecha de vencimiento. Descuenta del origen, crea (o suma a)
 * un lote equivalente en destino y registra `transfer_out` + `transfer_in` con
 * la misma referencia. No abre acceso cross-business (todo `mockBusiness.id`).
 */
export function transferStock(input: TransferStockInput): TransferStockResult {
  const origin = listAllLots().find((l) => l.id === input.originLotId);
  if (!origin) return { ok: false, error: "Lote de origen no encontrado." };
  if (origin.status !== "available") {
    return { ok: false, error: `El lote ${origin.lotNumber} no está disponible (${origin.status}).` };
  }
  if (!(input.quantity > 0)) {
    return { ok: false, error: "La cantidad a transferir debe ser mayor que 0." };
  }
  if (input.quantity > origin.currentQuantity) {
    return { ok: false, error: "La cantidad a transferir supera el stock disponible." };
  }
  if (origin.warehouseId === input.destWarehouseId) {
    return { ok: false, error: "La sucursal origen y destino no pueden ser iguales." };
  }

  // Descontar del origen.
  const overrides = readQtyOverrides();
  overrides[origin.id] = origin.currentQuantity - input.quantity;
  safeWrite(KEY_QTY, overrides);

  // Crear lote equivalente en destino (conserva lote y vencimiento).
  const now = new Date().toISOString();
  const destLot: ProductLot = {
    id: genId("lot"),
    businessId: mockBusiness.id,
    branchId: input.destBranchId,
    productId: origin.productId,
    warehouseId: input.destWarehouseId,
    lotNumber: origin.lotNumber,
    expiresAt: origin.expiresAt,
    receivedAt: now,
    initialQuantity: input.quantity,
    currentQuantity: input.quantity,
    unitCost: origin.unitCost,
    status: "available",
    notes: `Transferencia ${input.reference}`,
    createdAt: now,
    updatedAt: now,
  };
  safeWrite(KEY_LOTS, [...readNewLots(), destLot]);

  // Movimientos en pareja con referencia común.
  pushMovement({
    productId: origin.productId,
    lotId: origin.id,
    warehouseId: origin.warehouseId,
    branchId: origin.branchId,
    type: "transfer_out",
    quantity: -input.quantity,
    reason: input.notes || "Transferencia entre sucursales",
    reference: input.reference,
  });
  pushMovement({
    productId: origin.productId,
    lotId: destLot.id,
    warehouseId: input.destWarehouseId,
    branchId: input.destBranchId,
    type: "transfer_in",
    quantity: input.quantity,
    reason: input.notes || "Transferencia entre sucursales",
    reference: input.reference,
  });

  return { ok: true, destLotId: destLot.id };
}

function pushMovement(
  m: Omit<
    InventoryMovement,
    "id" | "userId" | "userName" | "createdAt" | "businessId"
  >,
): void {
  const moves = readNewMoves();
  const movement: InventoryMovement = {
    ...m,
    id: genId("mov"),
    businessId: mockBusiness.id,
    userId: ACTOR.userId,
    userName: ACTOR.userName,
    createdAt: new Date().toISOString(),
  };
  safeWrite(KEY_MOVES, [movement, ...moves]);
}

export function clearLocalInventory(): void {
  safeWrite(KEY_LOTS, []);
  safeWrite(KEY_QTY, {});
  safeWrite(KEY_MOVES, []);
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

/** Tick reactivo: re-renderiza al cambiar el inventario local. */
export function useInventoryTick(): number {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(CHANGE_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(CHANGE_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);
  return tick;
}
