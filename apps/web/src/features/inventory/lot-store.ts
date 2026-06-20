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
const KEY_STATUS = "dermaland.lots.status";
const KEY_NOTES = "dermaland.lots.notes";
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

function readStatusOverrides(): Record<string, ProductLot["status"]> {
  const v = safeRead<Record<string, ProductLot["status"]>>(KEY_STATUS, {});
  return v && typeof v === "object" ? v : {};
}

function readNotesOverrides(): Record<string, string> {
  const v = safeRead<Record<string, string>>(KEY_NOTES, {});
  return v && typeof v === "object" ? v : {};
}

function readNewMoves(): InventoryMovement[] {
  const v = safeRead<InventoryMovement[]>(KEY_MOVES, []);
  return Array.isArray(v) ? v : [];
}

// ─── Lectura ────────────────────────────────────────────────────────────────

/** Todos los lotes (seed + nuevos), con `currentQuantity`, `status` y `notes` ajustados. */
export function listAllLots(): ProductLot[] {
  const qtyOv = readQtyOverrides();
  const statusOv = readStatusOverrides();
  const notesOv = readNotesOverrides();
  function applyOverrides(l: ProductLot): ProductLot {
    const patch: Partial<ProductLot> = {};
    if (qtyOv[l.id] != null) patch.currentQuantity = qtyOv[l.id];
    if (statusOv[l.id] != null) patch.status = statusOv[l.id];
    if (notesOv[l.id] != null) patch.notes = notesOv[l.id];
    return Object.keys(patch).length ? { ...l, ...patch } : l;
  }
  const seed = mockProductLots.map(applyOverrides);
  const local = readNewLots().map(applyOverrides);
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
  safeWrite(KEY_STATUS, {});
  safeWrite(KEY_NOTES, {});
  safeWrite(KEY_MOVES, []);
}

// ─── Cuarentena: liberar / recall ─────────────────────────────────────────────

export type LotActionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Libera un lote de cuarentena en local (status → "available").
 * Registra movimiento `quarantine_release`.
 */
export function releaseLotLocal(lotId: string, reason: string): LotActionResult {
  if (!reason.trim()) return { ok: false, error: "Indica el motivo de liberación." };
  const lot = listAllLots().find((l) => l.id === lotId);
  if (!lot) return { ok: false, error: "Lote no encontrado." };

  const statusOv = readStatusOverrides();
  statusOv[lotId] = "available";
  safeWrite(KEY_STATUS, statusOv);

  pushMovement({
    productId: lot.productId,
    lotId: lot.id,
    warehouseId: lot.warehouseId,
    branchId: lot.branchId,
    type: "release",
    quantity: 0,
    reason: reason.trim(),
    reference: lot.lotNumber,
  });

  return { ok: true };
}

/**
 * Envía un lote a recall en local (status → "recalled").
 * Registra movimiento `lot_recalled`.
 */
export function recallLotLocal(lotId: string, reason: string): LotActionResult {
  if (!reason.trim()) return { ok: false, error: "Indica el motivo del recall." };
  const lot = listAllLots().find((l) => l.id === lotId);
  if (!lot) return { ok: false, error: "Lote no encontrado." };

  const statusOv = readStatusOverrides();
  statusOv[lotId] = "recalled";
  safeWrite(KEY_STATUS, statusOv);

  pushMovement({
    productId: lot.productId,
    lotId: lot.id,
    warehouseId: lot.warehouseId,
    branchId: lot.branchId,
    type: "expiry",
    quantity: 0,
    reason: reason.trim(),
    reference: lot.lotNumber,
  });

  return { ok: true };
}

/**
 * Envía un lote a cuarentena en local (status → "quarantine").
 * Registra movimiento tipo `quarantine`.
 */
export function quarantineLotLocal(lotId: string, reason: string): LotActionResult {
  if (!reason.trim()) return { ok: false, error: "Indica el motivo de cuarentena." };
  const lot = listAllLots().find((l) => l.id === lotId);
  if (!lot) return { ok: false, error: "Lote no encontrado." };

  const statusOv = readStatusOverrides();
  statusOv[lotId] = "quarantine";
  safeWrite(KEY_STATUS, statusOv);

  pushMovement({
    productId: lot.productId,
    lotId: lot.id,
    warehouseId: lot.warehouseId,
    branchId: lot.branchId,
    type: "quarantine",
    quantity: 0,
    reason: reason.trim(),
    reference: lot.lotNumber,
  });

  return { ok: true };
}

/**
 * Actualiza la nota/motivo de un lote en local.
 */
export function updateLotNoteLocal(lotId: string, notes: string): LotActionResult {
  const lot = listAllLots().find((l) => l.id === lotId);
  if (!lot) return { ok: false, error: "Lote no encontrado." };
  const notesOv = readNotesOverrides();
  notesOv[lotId] = notes;
  safeWrite(KEY_NOTES, notesOv);
  return { ok: true };
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

// ─── Backend (local vs Supabase) ─────────────────────────────────────────────

/**
 * Modo del backend de lotes/inventario:
 *  - "local"    → este store (localStorage), por equipo (modo demo actual).
 *  - "supabase" → fuente ÚNICA compartida vía /api/lots (RLS business_id).
 *
 * Se activa con `NEXT_PUBLIC_DATA_SOURCE=supabase`.
 */
export const LOT_BACKEND: "local" | "supabase" =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase"
    ? "supabase"
    : "local";

function notifyInventoryChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

export async function fetchLotsFromServer(productId?: string): Promise<ProductLot[]> {
  const url = productId ? `/api/lots?productId=${encodeURIComponent(productId)}` : "/api/lots";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as { lots: ProductLot[] }).lots;
}

export function useAllLots(): ProductLot[] {
  const [list, setList] = React.useState<ProductLot[]>(() =>
    LOT_BACKEND === "supabase" ? [] : listAllLots(),
  );
  React.useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (LOT_BACKEND === "supabase") {
        fetchLotsFromServer()
          .then((l) => { if (alive) setList(l); })
          .catch(() => { if (alive) setList(listAllLots()); });
      } else {
        setList(listAllLots());
      }
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      alive = false;
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return list;
}

export function useProductLots(productId: string): ProductLot[] {
  const [list, setList] = React.useState<ProductLot[]>(() =>
    LOT_BACKEND === "supabase" ? [] : listLotsByProduct(productId),
  );
  React.useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (LOT_BACKEND === "supabase") {
        fetchLotsFromServer(productId)
          .then((l) => {
            if (alive) {
              setList(
                [...l].sort(
                  (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
                ),
              );
            }
          })
          .catch(() => { if (alive) setList(listLotsByProduct(productId)); });
      } else {
        setList(listLotsByProduct(productId));
      }
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      alive = false;
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [productId]);
  return list;
}

export async function fetchMovementsFromServer(opts?: {
  productId?: string;
  limit?: number;
}): Promise<InventoryMovement[]> {
  const params = new URLSearchParams();
  if (opts?.productId) params.set("productId", opts.productId);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  const url = params.size ? `/api/movements?${params.toString()}` : "/api/movements";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as { movements: InventoryMovement[] }).movements;
}

export function useAllMovements(limit?: number): InventoryMovement[] {
  const [list, setList] = React.useState<InventoryMovement[]>(() =>
    LOT_BACKEND === "supabase" ? [] : listAllMovements(),
  );
  React.useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (LOT_BACKEND === "supabase") {
        fetchMovementsFromServer({ limit })
          .then((m) => { if (alive) setList(m); })
          .catch(() => { if (alive) setList(listAllMovements()); });
      } else {
        setList(listAllMovements());
      }
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      alive = false;
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [limit]);
  return list;
}

export function useProductMovements(productId: string): InventoryMovement[] {
  const [list, setList] = React.useState<InventoryMovement[]>(() =>
    LOT_BACKEND === "supabase" ? [] : listMovementsByProduct(productId),
  );
  React.useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (LOT_BACKEND === "supabase") {
        fetchMovementsFromServer({ productId })
          .then((m) => {
            if (alive) {
              setList(
                [...m].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
              );
            }
          })
          .catch(() => { if (alive) setList(listMovementsByProduct(productId)); });
      } else {
        setList(listMovementsByProduct(productId));
      }
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      alive = false;
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [productId]);
  return list;
}

export async function addLotAnywhere(input: AddLotInput, requireExpiry = true): Promise<AddLotResult> {
  if (LOT_BACKEND === "local") {
    return addLot(input, requireExpiry);
  }
  // supabase path
  const missing = validateLot(input, requireExpiry);
  if (missing.length > 0) {
    return { ok: false, error: "Complete los campos requeridos del lote.", missingFields: missing };
  }
  try {
    const payload = {
      productId: input.productId,
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      lotNumber: input.lotNumber,
      initialQuantity: input.initialQuantity,
      currentQuantity: input.initialQuantity,
      expiresAt: input.expiresAt,
      receivedAt: new Date().toISOString(),
      unitCost: input.unitCost ?? 0,
      status: "available",
      supplierId: input.supplierId,
      notes: input.notes,
    };
    const res = await fetch("/api/lots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as { lot?: ProductLot; error?: string };
    if (!res.ok || !body.lot) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    notifyInventoryChanged();
    return { ok: true, lot: body.lot };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function adjustStockAnywhere(input: AdjustStockInput): Promise<AdjustResult> {
  if (LOT_BACKEND === "local") {
    return adjustStock(input);
  }
  // supabase path
  if (!(typeof input.newQuantity === "number" && input.newQuantity >= 0)) {
    return { ok: false, error: "La nueva cantidad debe ser 0 o mayor." };
  }
  if (!input.reason?.trim()) {
    return { ok: false, error: "Indica el motivo del ajuste." };
  }
  try {
    const res = await fetch(`/api/lots/${input.lotId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newQuantity: input.newQuantity, reason: input.reason }),
    });
    const body = (await res.json().catch(() => ({}))) as { lot?: ProductLot; delta?: number; error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    notifyInventoryChanged();
    return { ok: true, delta: typeof body.delta === "number" ? body.delta : 0 };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Wrapper gated: libera un lote vía API (supabase) o local. */
export async function releaseLotAnywhere(
  lotId: string,
  opts: { reason: string; responsible?: string },
): Promise<LotActionResult> {
  if (LOT_BACKEND === "local") {
    const res = releaseLotLocal(lotId, opts.reason);
    if (res.ok) notifyInventoryChanged();
    return res;
  }
  try {
    const res = await fetch(`/api/lots/${lotId}/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: opts.reason, responsible: opts.responsible }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    notifyInventoryChanged();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Wrapper gated: envía un lote a recall vía API (supabase) o local. */
export async function recallLotAnywhere(
  lotId: string,
  opts: { reason: string },
): Promise<LotActionResult> {
  if (LOT_BACKEND === "local") {
    const res = recallLotLocal(lotId, opts.reason);
    if (res.ok) notifyInventoryChanged();
    return res;
  }
  try {
    const res = await fetch(`/api/lots/${lotId}/recall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: opts.reason }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    notifyInventoryChanged();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Wrapper gated: envía un lote a cuarentena vía API (supabase) o local. */
export async function quarantineLotAnywhere(
  lotId: string,
  opts: { reason: string },
): Promise<LotActionResult> {
  if (LOT_BACKEND === "local") {
    const res = quarantineLotLocal(lotId, opts.reason);
    if (res.ok) notifyInventoryChanged();
    return res;
  }
  try {
    const res = await fetch(`/api/lots/${lotId}/quarantine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: opts.reason }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    notifyInventoryChanged();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Variante PURA de `stockBranchSummary` que recibe los lotes ya cargados.
 * Útil para páginas que computan desde los hooks reactivos.
 */
export function summarizeLotsByBranch(lots: ProductLot[]): BranchStockSummary[] {
  const map = new Map<string, BranchStockSummary>();
  for (const lot of lots) {
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

// ─── Helpers PUROS de stock por sucursal (única fuente para POS y Productos) ──
//
// Estas funciones reciben los lotes ya cargados (de `useAllLots()`) para que
// funcionen igual con datos de Supabase o locales, sin tocar el store interno.
// Un lote es VENDIBLE en una sucursal si:
//   - productId coincide
//   - branchId === sucursal pedida
//   - currentQuantity > 0
//   - status === "available" (NO quarantine/recalled)
//   - no está vencido (expiryStatus !== "expired")

/** ¿Es este lote vendible (disponible para venta)? */
function isLotSellable(lot: ProductLot): boolean {
  return (
    lot.currentQuantity > 0 &&
    lot.status === "available" &&
    expiryStatus(lot.expiresAt) !== "expired"
  );
}

/**
 * Stock vendible de un producto en una sucursal concreta.
 * Suma todos los lotes vendibles de esa sucursal.
 */
export function sellableStockForBranch(
  lots: ProductLot[],
  productId: string,
  branchId: string,
): number {
  return lots
    .filter((l) => l.productId === productId && l.branchId === branchId && isLotSellable(l))
    .reduce((s, l) => s + l.currentQuantity, 0);
}

/**
 * Stock vendible total de un producto sumando todas las sucursales activas.
 * `activeBranchIds` filtra solo sucursales en operación (excluye inactivas).
 */
export function totalSellableStock(
  lots: ProductLot[],
  productId: string,
  activeBranchIds: Set<string>,
): number {
  return lots
    .filter(
      (l) =>
        l.productId === productId &&
        activeBranchIds.has(l.branchId) &&
        isLotSellable(l),
    )
    .reduce((s, l) => s + l.currentQuantity, 0);
}

export interface BranchStockRow {
  branchId: string;
  available: number;
  lots: number;
  soon: number;
  expired: number;
}

/**
 * Resumen de stock por sucursal de un producto (solo sucursales que tienen lotes).
 * `available` = suma vendible; `soon` = lotes próximos a vencer; `expired` = vencidos.
 */
export function stockByBranchForProduct(
  lots: ProductLot[],
  productId: string,
): BranchStockRow[] {
  const map = new Map<string, BranchStockRow>();
  for (const lot of lots.filter((l) => l.productId === productId)) {
    let row = map.get(lot.branchId);
    if (!row) {
      row = { branchId: lot.branchId, available: 0, lots: 0, soon: 0, expired: 0 };
      map.set(lot.branchId, row);
    }
    row.lots += 1;
    if (isLotSellable(lot)) row.available += lot.currentQuantity;
    const st = expiryStatus(lot.expiresAt);
    if (st === "expired") row.expired += 1;
    else if (st === "soon") row.soon += 1;
  }
  return [...map.values()];
}

/**
 * Lista de lotes vendibles FEFO para un producto en una sucursal concreta.
 *
 * Misma regla que `isLotSellable` (disponible, no vencido, qty > 0).
 * Ordenados por fecha de vencimiento ascendente; lotes sin fecha al final.
 * Útil en `finalizeCharge` para descontar stock sin releer el store.
 */
export function fefoLotsForBranch(
  lots: ProductLot[],
  productId: string,
  branchId: string,
): ProductLot[] {
  return lots
    .filter((l) => l.productId === productId && l.branchId === branchId && isLotSellable(l))
    .sort((a, b) => {
      const aHasDate = !!a.expiresAt;
      const bHasDate = !!b.expiresAt;
      if (!aHasDate && !bHasDate) return 0;
      if (!aHasDate) return 1; // sin fecha al final
      if (!bHasDate) return -1;
      return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
    });
}

/**
 * Próximo lote vendible FEFO (el más próximo a vencer) de un producto en una sucursal.
 * Retorna `null` si no hay lote vendible en esa sucursal.
 */
export function nextFefoLotForBranch(
  lots: ProductLot[],
  productId: string,
  branchId: string,
): ProductLot | null {
  const candidates = lots
    .filter((l) => l.productId === productId && l.branchId === branchId && isLotSellable(l))
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
  return candidates[0] ?? null;
}

export type LotBlockReason =
  | "expired"
  | "quarantine"
  | "recall"
  | "no-lot"
  | "depleted"
  | "inactive-branch";

/**
 * Por qué no se puede vender un producto en una sucursal.
 * Retorna `null` si hay al menos un lote vendible.
 *
 * Distingue dos casos de "sin stock disponible":
 *  - "no-lot"    → no existe NINGÚN lote del producto en esa sucursal.
 *  - "depleted"  → hay lote(s) en la sucursal pero todos con qty 0 / agotados
 *                  (status "available" pero currentQuantity === 0).
 */
export function lotBlockReason(
  lots: ProductLot[],
  productId: string,
  branchId: string,
  activeBranchIds?: Set<string>,
): LotBlockReason | null {
  // branchId vacío → aún cargando; no clasificar como inactiva.
  if (!branchId) return null;
  if (activeBranchIds && !activeBranchIds.has(branchId)) {
    return "inactive-branch";
  }
  const productLots = lots.filter(
    (l) => l.productId === productId && l.branchId === branchId,
  );
  if (productLots.length === 0) return "no-lot";

  // Si hay alguno vendible → no hay bloqueo.
  if (productLots.some(isLotSellable)) return null;

  // Clasificar el bloqueo más relevante.
  if (productLots.some((l) => expiryStatus(l.expiresAt) === "expired")) return "expired";
  if (productLots.some((l) => l.status === "quarantine")) return "quarantine";
  if (productLots.some((l) => l.status === "recalled")) return "recall";

  // Hay lotes en estado "available" pero con cantidad 0: agotados en sucursal.
  if (productLots.some((l) => l.status === "available" && l.currentQuantity === 0)) {
    return "depleted";
  }
  return "no-lot";
}
