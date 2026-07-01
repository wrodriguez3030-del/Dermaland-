"use client";

// Store CLIENTE (localStorage) de sesiones de Inventario físico por escaneo.
//
// Mientras el módulo no tenga backend propio, esta capa hace funcional el flujo
// real: crear inventario, escanear (lector/cámara/manual), sumar cantidades y
// comparar contra el stock del sistema. Copia el patrón de `lot-store.ts`
// (localStorage + CustomEvent + hook con useState/effect). NO toca DGII,
// secuencias ni datos fiscales; solo guarda el conteo en el navegador.

import * as React from "react";
import type {
  InventoryCount,
  InventoryCountItem,
  InventoryCountScan,
  InventoryCountStatus,
  Product,
} from "@/types";

const KEY = "dermaland.count-sessions";
const CHANGE_EVENT = "dermaland:count-session-changed";

export type CountType = "full" | "partial" | "spot";
export type CountSessionStatus =
  | "draft"
  | "in_progress"
  | "reviewing"
  | "approved"
  | "cancelled";
export type ScanResult =
  | "found"
  | "not_found"
  | "duplicate_sum"
  | "manual"
  | "error";
export type ScanSource = "reader" | "camera" | "manual";

export interface CountSessionItem {
  productId: string;
  sku: string;
  productName: string;
  barcode?: string;
  countedQuantity: number;
  lastScannedAt: string;
  notes?: string;
}

export interface CountScanEvent {
  id: string;
  at: string;
  scannedCode: string;
  productId?: string;
  productName?: string;
  result: ScanResult;
  source: ScanSource;
  quantityDelta: number;
  accumulated: number;
}

export interface CountSession {
  id: string;
  code: string;
  name: string;
  branchId: string;
  type: CountType;
  status: CountSessionStatus;
  categoryId?: string;
  brandId?: string;
  laboratoryId?: string;
  notes?: string;
  startedByName?: string;
  startedAt: string;
  closedAt?: string;
  approvedAt?: string;
  approvedWithAdjustments?: boolean;
  items: CountSessionItem[];
  scans: CountScanEvent[];
  createdAt: string;
  updatedAt: string;
}

// ─── Persistencia ────────────────────────────────────────────────────────────

function safeRead(): CountSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CountSession[]) : [];
  } catch {
    return [];
  }
}

function safeWrite(list: CountSession[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function nowIso(): string {
  return new Date().toISOString();
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Código legible del inventario, p. ej. INV-20260630-3F2A (sin UUID). */
function genCode(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV-${stamp}-${rand}`;
}

// ─── Lecturas ────────────────────────────────────────────────────────────────

export function listSessions(): CountSession[] {
  return [...safeRead()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getSession(id: string): CountSession | undefined {
  return safeRead().find((s) => s.id === id);
}

// ─── Escrituras ──────────────────────────────────────────────────────────────

export interface CreateSessionInput {
  name: string;
  branchId: string;
  type: CountType;
  categoryId?: string;
  brandId?: string;
  laboratoryId?: string;
  notes?: string;
  startedByName?: string;
}

export function createSession(input: CreateSessionInput): CountSession {
  const ts = nowIso();
  const session: CountSession = {
    id: genId("pc"),
    code: genCode(),
    name: input.name.trim() || "Inventario físico",
    branchId: input.branchId,
    type: input.type,
    status: "in_progress",
    categoryId: input.categoryId || undefined,
    brandId: input.brandId || undefined,
    laboratoryId: input.laboratoryId || undefined,
    notes: input.notes?.trim() || undefined,
    startedByName: input.startedByName,
    startedAt: ts,
    items: [],
    scans: [],
    createdAt: ts,
    updatedAt: ts,
  };
  safeWrite([session, ...safeRead()]);
  return session;
}

function mutate(
  id: string,
  fn: (s: CountSession) => CountSession,
): CountSession | undefined {
  const list = safeRead();
  const idx = list.findIndex((s) => s.id === id);
  if (idx < 0) return undefined;
  const next = { ...fn(list[idx]!), updatedAt: nowIso() };
  list[idx] = next;
  safeWrite(list);
  return next;
}

/** Busca un producto por código de barra (exacto) o SKU (case-insensitive). */
export function findProductByCode(
  products: Product[],
  rawCode: string,
): Product | undefined {
  const code = rawCode.trim();
  if (!code) return undefined;
  return (
    products.find((p) => (p.barcode ?? "") !== "" && p.barcode === code) ??
    products.find((p) => p.sku.toLowerCase() === code.toLowerCase())
  );
}

export interface ApplyScanResult {
  ok: boolean;
  result: ScanResult;
  session?: CountSession;
  item?: CountSessionItem;
}

/**
 * Registra un escaneo: si el producto existe suma +1 a su fila (sin duplicar
 * filas) y deja registro; si no existe, lo anota como "no encontrado".
 */
export function applyScan(
  id: string,
  args: { scannedCode: string; product: Product | undefined; source?: ScanSource },
): ApplyScanResult {
  const source = args.source ?? "reader";
  const code = args.scannedCode.trim();
  let outResult: ScanResult = "error";
  let outItem: CountSessionItem | undefined;
  const session = mutate(id, (s) => {
    if (s.status === "approved" || s.status === "cancelled") {
      outResult = "error";
      return s;
    }
    const at = nowIso();
    if (!args.product) {
      outResult = "not_found";
      const ev: CountScanEvent = {
        id: genId("sc"),
        at,
        scannedCode: code,
        result: "not_found",
        source,
        quantityDelta: 0,
        accumulated: 0,
      };
      return { ...s, scans: [ev, ...s.scans] };
    }
    const p = args.product;
    const items = [...s.items];
    const existingIdx = items.findIndex((it) => it.productId === p.id);
    let accumulated: number;
    if (existingIdx >= 0) {
      const prev = items[existingIdx]!;
      const updated = {
        ...prev,
        countedQuantity: prev.countedQuantity + 1,
        lastScannedAt: at,
      };
      items[existingIdx] = updated;
      accumulated = updated.countedQuantity;
      outItem = updated;
      outResult = "duplicate_sum";
    } else {
      const created: CountSessionItem = {
        productId: p.id,
        sku: p.sku,
        productName: p.name,
        barcode: p.barcode,
        countedQuantity: 1,
        lastScannedAt: at,
      };
      items.unshift(created);
      accumulated = 1;
      outItem = created;
      outResult = "found";
    }
    const ev: CountScanEvent = {
      id: genId("sc"),
      at,
      scannedCode: code,
      productId: p.id,
      productName: p.name,
      result: existingIdx >= 0 ? "duplicate_sum" : "found",
      source,
      quantityDelta: 1,
      accumulated,
    };
    return { ...s, scans: [ev, ...s.scans], items };
  });
  return { ok: !!session && outResult !== "error", result: outResult, session, item: outItem };
}

/** Alta manual: fija/suma una cantidad para un producto y deja registro. */
export function addManual(
  id: string,
  args: { product: Product; quantity: number; notes?: string },
): CountSession | undefined {
  const qty = Math.max(0, Math.floor(args.quantity));
  return mutate(id, (s) => {
    if (s.status === "approved" || s.status === "cancelled") return s;
    const at = nowIso();
    const items = [...s.items];
    const idx = items.findIndex((it) => it.productId === args.product.id);
    let accumulated = qty;
    if (idx >= 0) {
      const prev = items[idx]!;
      accumulated = prev.countedQuantity + qty;
      items[idx] = { ...prev, countedQuantity: accumulated, lastScannedAt: at, notes: args.notes || prev.notes };
    } else {
      items.unshift({
        productId: args.product.id,
        sku: args.product.sku,
        productName: args.product.name,
        barcode: args.product.barcode,
        countedQuantity: qty,
        lastScannedAt: at,
        notes: args.notes,
      });
    }
    const ev: CountScanEvent = {
      id: genId("sc"),
      at,
      scannedCode: args.product.sku,
      productId: args.product.id,
      productName: args.product.name,
      result: "manual",
      source: "manual",
      quantityDelta: qty,
      accumulated,
    };
    return { ...s, scans: [ev, ...s.scans], items };
  });
}

export function setItemQuantity(
  id: string,
  productId: string,
  quantity: number,
): CountSession | undefined {
  const qty = Math.max(0, Math.floor(quantity));
  return mutate(id, (s) => ({
    ...s,
    items: s.items.map((it) =>
      it.productId === productId ? { ...it, countedQuantity: qty, lastScannedAt: nowIso() } : it,
    ),
  }));
}

export function removeItem(id: string, productId: string): CountSession | undefined {
  return mutate(id, (s) => ({ ...s, items: s.items.filter((it) => it.productId !== productId) }));
}

export function setSessionStatus(
  id: string,
  status: CountSessionStatus,
  extra?: Partial<CountSession>,
): CountSession | undefined {
  return mutate(id, (s) => ({ ...s, status, ...extra }));
}

export function cancelSession(id: string): CountSession | undefined {
  return setSessionStatus(id, "cancelled", { closedAt: nowIso() });
}

export function deleteSession(id: string): void {
  safeWrite(safeRead().filter((s) => s.id !== id));
}

// ─── Hooks reactivos ─────────────────────────────────────────────────────────

export function useScanSessions(): CountSession[] {
  const [list, setList] = React.useState<CountSession[]>(() => listSessions());
  React.useEffect(() => {
    const refresh = () => setList(listSessions());
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return list;
}

export function useScanSession(id: string | null | undefined): CountSession | undefined {
  const [session, setSession] = React.useState<CountSession | undefined>(() =>
    id ? getSession(id) : undefined,
  );
  React.useEffect(() => {
    if (!id) {
      setSession(undefined);
      return;
    }
    const refresh = () => setSession(getSession(id));
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [id]);
  return session;
}

// ─── Adaptador al informe/Excel (reusa physical-count-report) ────────────────

const STATUS_MAP: Record<CountSessionStatus, InventoryCountStatus> = {
  draft: "draft",
  in_progress: "in_progress",
  reviewing: "reviewed",
  approved: "approved",
  cancelled: "cancelled",
};

export interface SessionReportDeps {
  systemQuantityFor: (productId: string) => number;
}

/** Mapea una sesión a las entradas que espera `buildPhysicalCountReport`. */
export function sessionToCountData(
  session: CountSession,
  deps: SessionReportDeps,
): {
  count: InventoryCount;
  items: InventoryCountItem[];
  scans: InventoryCountScan[];
} {
  const items: InventoryCountItem[] = session.items.map((it, i) => {
    const sys = deps.systemQuantityFor(it.productId);
    const diff = it.countedQuantity - sys;
    return {
      id: `it_${i}`,
      inventoryCountId: session.id,
      productId: it.productId,
      productSku: it.sku,
      productName: it.productName,
      warehouseId: "",
      expectedQuantity: sys,
      countedQuantity: it.countedQuantity,
      differenceQuantity: diff,
      status: diff === 0 ? "match" : diff < 0 ? "shortage" : "overage",
      lastScanAt: it.lastScannedAt,
    };
  });
  const scans: InventoryCountScan[] = session.scans.map((s) => ({
    id: s.id,
    inventoryCountId: session.id,
    productId: s.productId ?? "",
    branchId: session.branchId,
    warehouseId: "",
    barcode: s.scannedCode,
    scannedQuantity: s.quantityDelta,
    scanSource: s.source === "manual" ? "manual" : s.source === "camera" ? "camera" : "bluetooth_scanner",
    scannedBy: "",
    scannedByName: session.startedByName ?? "",
    scannedAt: s.at,
    deviceId: "",
    offlineScanId: "",
    syncStatus: "synced",
  }));
  const count: InventoryCount = {
    id: session.id,
    countNumber: session.code,
    businessId: "",
    branchId: session.branchId,
    warehouseId: "",
    countType: session.type,
    status: STATUS_MAP[session.status],
    assignedTo: [],
    startedAt: session.startedAt,
    approvedAt: session.approvedAt,
    notes: session.notes,
    scanCount: session.scans.length,
    itemCount: session.items.length,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
  return { count, items, scans };
}
