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
import { findByBarcodeOrSku } from "@/features/products/barcode-match";

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
  /** Solo en eventos `not_found`: cuándo se recuperó (ver `recoverNotFoundScans`). */
  recoveredAt?: string;
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
  /** Id del conteo en Supabase. Ausente si nunca se pudo crear (mock o sin red). */
  serverId?: string;
  /** Almacén que el servidor resolvió para ese conteo; los escaneos usan ese. */
  serverWarehouseId?: string;
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

/**
 * Mete en este dispositivo una sesión que viene de la nube, para poder seguir
 * contando donde otro equipo la dejó. No pisa una sesión local existente: la
 * local siempre manda (puede tener escaneos que aún no subieron).
 */
export function importSession(session: CountSession): CountSession {
  const list = safeRead();
  const existente = list.find((s) => s.id === session.id);
  if (existente) return existente;
  safeWrite([session, ...list]);
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

/**
 * Busca un producto por código de barra (tolerante a UPC-A ↔ EAN-13 con cero
 * delante, ver `barcode-match.ts`) o por SKU (case-insensitive).
 */
export function findProductByCode(
  products: Product[],
  rawCode: string,
): Product | undefined {
  return findByBarcodeOrSku(products, rawCode);
}

export interface ApplyScanResult {
  ok: boolean;
  result: ScanResult;
  session?: CountSession;
  item?: CountSessionItem;
}

/**
 * Suma UNA unidad de `p` a la lista de filas contadas sin mutarla: actualiza la
 * fila existente o crea una nueva al frente. Compartido por `applyScan` y
 * `recoverNotFoundScans` para que los dos caminos cuenten exactamente igual.
 */
function addUnit(
  items: CountSessionItem[],
  p: Product,
  at: string,
): { items: CountSessionItem[]; item: CountSessionItem; result: "found" | "duplicate_sum" } {
  const idx = items.findIndex((it) => it.productId === p.id);
  if (idx >= 0) {
    const prev = items[idx]!;
    const updated: CountSessionItem = {
      ...prev,
      countedQuantity: prev.countedQuantity + 1,
      lastScannedAt: at,
    };
    return { items: items.map((it, i) => (i === idx ? updated : it)), item: updated, result: "duplicate_sum" };
  }
  const created: CountSessionItem = {
    productId: p.id,
    sku: p.sku,
    productName: p.name,
    barcode: p.barcode,
    countedQuantity: 1,
    lastScannedAt: at,
  };
  return { items: [created, ...items], item: created, result: "found" };
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
    const added = addUnit(s.items, p, at);
    outItem = added.item;
    outResult = added.result;
    const ev: CountScanEvent = {
      id: genId("sc"),
      at,
      scannedCode: code,
      productId: p.id,
      productName: p.name,
      result: added.result,
      source,
      quantityDelta: 1,
      accumulated: added.item.countedQuantity,
    };
    return { ...s, scans: [ev, ...s.scans], items: added.items };
  });
  return { ok: !!session && outResult !== "error", result: outResult, session, item: outItem };
}

/**
 * Códigos escaneados que quedaron como "no encontrado" y aún no se han
 * recuperado, de más antiguo a más nuevo y sin repetir.
 */
export function pendingNotFoundCodes(session: CountSession): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ev of [...session.scans].reverse()) {
    if (ev.result !== "not_found" || ev.recoveredAt) continue;
    if (seen.has(ev.scannedCode)) continue;
    seen.add(ev.scannedCode);
    out.push(ev.scannedCode);
  }
  return out;
}

export interface RecoverNotFoundResult {
  /** Escaneos que pasaron de "no encontrado" a contados. */
  recovered: number;
  /** Escaneos que siguen sin producto. */
  remaining: number;
  /** Uno por escaneo recuperado, para sincronizarlos a la nube como un escaneo normal. */
  products: Array<{ product: Product; scannedCode: string; source: ScanSource }>;
  session?: CountSession;
}

/**
 * Vuelve a contar los escaneos que fallaron: cada evento `not_found` cuyo
 * código esté en `resolved` suma +1 al producto (mismo camino que `applyScan`),
 * deja un evento nuevo ya resuelto y marca el viejo con `recoveredAt` para que
 * una segunda pasada no lo sume otra vez. Los códigos sin producto se quedan
 * pendientes. No toca inventarios aprobados ni cancelados.
 *
 * Nació el 2026-09-05: los códigos UPC-A (12 dígitos) fallaban contra el EAN-13
 * con cero delante guardado en el catálogo, y los conteos ya hechos tenían esos
 * escaneos anotados como "no encontrado".
 */
export function recoverNotFoundScans(
  id: string,
  resolved: Map<string, Product>,
): RecoverNotFoundResult {
  const products: RecoverNotFoundResult["products"] = [];
  let recovered = 0;
  let remaining = 0;
  const session = mutate(id, (s) => {
    const pendientes = [...s.scans].reverse().filter((ev) => ev.result === "not_found" && !ev.recoveredAt);
    if (s.status === "approved" || s.status === "cancelled") {
      remaining = pendientes.length;
      return s;
    }
    const at = nowIso();
    const recoveredIds = new Set<string>();
    const nuevos: CountScanEvent[] = [];
    let items = s.items;
    for (const ev of pendientes) {
      const p = resolved.get(ev.scannedCode);
      if (!p) continue;
      const added = addUnit(items, p, at);
      items = added.items;
      nuevos.unshift({
        id: genId("sc"),
        at,
        scannedCode: ev.scannedCode,
        productId: p.id,
        productName: p.name,
        result: added.result,
        source: ev.source,
        quantityDelta: 1,
        accumulated: added.item.countedQuantity,
      });
      recoveredIds.add(ev.id);
      products.push({ product: p, scannedCode: ev.scannedCode, source: ev.source });
    }
    recovered = recoveredIds.size;
    remaining = pendientes.length - recovered;
    if (recovered === 0) return s;
    const scans = [
      ...nuevos,
      ...s.scans.map((ev) => (recoveredIds.has(ev.id) ? { ...ev, recoveredAt: at } : ev)),
    ];
    return { ...s, items, scans };
  });
  return { recovered, remaining, products, session };
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

/**
 * Guarda el id que el conteo tiene en Supabase. Se llama una sola vez, cuando
 * la cabecera se crea en la nube: a partir de ahí los escaneos cuelgan de ella.
 */
export function setSessionServerId(
  id: string,
  serverId: string,
  serverWarehouseId?: string | null,
): CountSession | undefined {
  return mutate(id, (s) => ({
    ...s,
    serverId,
    serverWarehouseId: serverWarehouseId ?? s.serverWarehouseId,
  }));
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
