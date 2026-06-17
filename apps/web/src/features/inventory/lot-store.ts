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
