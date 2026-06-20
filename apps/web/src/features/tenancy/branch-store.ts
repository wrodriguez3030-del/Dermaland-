"use client";

import * as React from "react";
import type { Branch, Warehouse } from "@/types";
import { mockBranches, mockWarehouses } from "@/lib/mock-data/tenancy";
import { listAllLots, listAllMovements } from "@/features/inventory/lot-store";
import { listAllProformas } from "@/features/sales/proforma-store";

const KEY_CURRENT = "dermaland.current-branch";

/**
 * Store de sucursales — MVP (localStorage).
 *
 * Combina el seed `mockBranches` con altas/ediciones/bajas desde la UI:
 *  - `dermaland.branches`           → sucursales nuevas (array)
 *  - `dermaland.branches.overrides` → patches a sucursales seed (record por id)
 *  - `dermaland.branches.deleted`   → ids eliminados (hard delete permitido
 *                                     sólo si no hay dependencias)
 *
 * Producción: repositorio Supabase `branches` con RLS por `business_id`. El
 * contrato create/update/softDelete mapea a INSERT/UPDATE.
 */

const KEY_NEW = "dermaland.branches";
const KEY_OVERRIDES = "dermaland.branches.overrides";
const KEY_DELETED = "dermaland.branches.deleted";
const CHANGE_EVENT = "dermaland:branches-changed";

// ─── Storage version (limpia datos mock obsoletos) ───────────────────────────
/**
 * Incrementar `STORAGE_VERSION` cuando haya cambios en el schema de sucursales
 * que puedan dejar datos mock obsoletos en localStorage (p.ej. overrides de
 * sesiones demo previas como "Naco reactivado"). El proceso de limpieza borra
 * SOLO las keys de lista de sucursales; no toca tokens de auth ni prefs.
 */
const STORAGE_VERSION = "3";
const KEY_STORAGE_VERSION = "dermaland.storage-version";

/**
 * Garantiza que localStorage esté en la versión actual. Si la versión
 * guardada difiere (o no existe), borra los datos de lista de sucursales
 * locales (branches/overrides/deleted) y actualiza la versión guardada.
 *
 * - Idempotente: si la versión ya es la correcta, no hace nada.
 * - Guard `typeof window`: no-op en SSR.
 * - No toca tokens de auth (`sb-*`), preferencias visuales, ni `current-branch`.
 * - Si `current-branch` persiste un id mock (`br_sd_*`) que no existe en
 *   Supabase, `useCurrentBranch` lo reconcilia a la primera activa real.
 */
export function ensureStorageVersion(): void {
  if (typeof window === "undefined") return;
  const stored = window.localStorage.getItem(KEY_STORAGE_VERSION);
  if (stored === STORAGE_VERSION) return;
  // Limpiar solo las keys de lista de sucursales locales.
  window.localStorage.removeItem(KEY_NEW);
  window.localStorage.removeItem(KEY_OVERRIDES);
  window.localStorage.removeItem(KEY_DELETED);
  window.localStorage.setItem(KEY_STORAGE_VERSION, STORAGE_VERSION);
}

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

function readNew(): Branch[] {
  const v = safeRead<Branch[]>(KEY_NEW, []);
  return Array.isArray(v) ? v : [];
}
function readOverrides(): Record<string, Partial<Branch>> {
  const v = safeRead<Record<string, Partial<Branch>>>(KEY_OVERRIDES, {});
  return v && typeof v === "object" ? v : {};
}
function readDeleted(): Set<string> {
  const v = safeRead<string[]>(KEY_DELETED, []);
  return new Set(Array.isArray(v) ? v : []);
}

export function listAllBranches(): Branch[] {
  const overrides = readOverrides();
  const deleted = readDeleted();
  const seed = mockBranches.map((b) =>
    overrides[b.id] ? { ...b, ...overrides[b.id] } : b,
  );
  return [...seed, ...readNew()].filter((b) => !deleted.has(b.id));
}

export function getBranchFromStore(id: string): Branch | undefined {
  return listAllBranches().find((b) => b.id === id);
}

/**
 * Sucursales OPERATIVAS: activas y no eliminadas. Único origen para selectores
 * de operación (POS, caja, inventario, lotes, transferencias, conteo…).
 */
export function listActiveBranches(): Branch[] {
  return listAllBranches().filter((b) => b.status === "active");
}

/**
 * Set de IDs de sucursales ACTIVAS. Único filtro para vistas OPERATIVAS de
 * inventario/productos: stock, lotes, vencimientos por sucursal. Las sucursales
 * inactivas o eliminadas no muestran stock operativo (su historial vive en
 * reportes). Respeta altas/bajas/ediciones locales (overrides en localStorage).
 */
export function listActiveBranchIds(): Set<string> {
  return new Set(listActiveBranches().map((b) => b.id));
}

/** Filtra una lista de elementos con `branchId` a solo sucursales activas. */
export function onlyActiveBranches<T extends { branchId: string }>(
  items: T[],
): T[] {
  const ids = listActiveBranchIds();
  return items.filter((i) => ids.has(i.branchId));
}

export function isBranchActive(id: string): boolean {
  return listActiveBranches().some((b) => b.id === id);
}

/** Almacenes cuya sucursal está activa (para selectores operativos). */
export function listActiveWarehouses(): Warehouse[] {
  const active = new Set(listActiveBranches().map((b) => b.id));
  return mockWarehouses.filter((w) => active.has(w.branchId));
}

/**
 * Almacén interno por defecto de una sucursal. El usuario opera por SUCURSAL;
 * internamente el stock sigue guardando `warehouse_id` por compatibilidad, así
 * que mapeamos sucursal → su almacén principal (o el primero). Si la sucursal
 * no tiene almacén (p. ej. recién creada), se usa un id sintético estable.
 */
export function defaultWarehouseForBranch(branchId: string): string {
  const main = mockWarehouses.find((w) => w.branchId === branchId && w.isMain);
  if (main) return main.id;
  const any = mockWarehouses.find((w) => w.branchId === branchId);
  if (any) return any.id;
  return `wh_default_${branchId}`;
}

/**
 * Nombre de sucursal para HISTÓRICO/reportes: resuelve aunque esté inactiva o
 * eliminada (cae al seed `mockBranches`), para no perder nombres en documentos
 * y reportes antiguos.
 */
export function resolveBranchName(id: string): string {
  return (
    getBranchFromStore(id)?.name ??
    mockBranches.find((b) => b.id === id)?.name ??
    id
  );
}

// ─── Dependencias (para decidir si se puede eliminar) ────────────────────────

export interface BranchDependencies {
  warehouses: number;
  lots: number;
  movements: number;
  proformas: number;
  total: number;
}

/** Cuenta datos asociados a la sucursal. Si total>0, no se puede eliminar. */
export function branchDependencies(branchId: string): BranchDependencies {
  const warehouses = mockWarehouses.filter((w) => w.branchId === branchId).length;
  const lots = listAllLots().filter((l) => l.branchId === branchId).length;
  const movements = listAllMovements().filter(
    (m) => m.branchId === branchId,
  ).length;
  const proformas = listAllProformas().filter(
    (p) => p.branchId === branchId,
  ).length;
  return {
    warehouses,
    lots,
    movements,
    proformas,
    total: warehouses + lots + movements + proformas,
  };
}

// ─── Mutaciones ─────────────────────────────────────────────────────────────

export interface CreateBranchInput {
  name: string;
  code: string;
  address?: string;
  city?: string;
  province?: string;
  phone?: string;
  email?: string;
  showOnWebsite?: boolean;
  isPilot?: boolean;
  status?: "active" | "inactive";
}

export type BranchResult =
  | { ok: true; branch: Branch }
  | { ok: false; error: string; missingFields?: string[] };

function genId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `br_${ts}_${rand}`;
}

export function createBranch(input: CreateBranchInput): BranchResult {
  const missing: string[] = [];
  if (!input.name?.trim()) missing.push("name");
  if (!input.code?.trim()) missing.push("code");
  if (missing.length) {
    return { ok: false, error: "Complete los campos requeridos.", missingFields: missing };
  }
  const code = input.code.trim().toUpperCase();
  if (listAllBranches().some((b) => b.code.toUpperCase() === code)) {
    return { ok: false, error: `Ya existe una sucursal con el código ${code}.`, missingFields: ["code"] };
  }
  const now = new Date().toISOString();
  const branch: Branch = {
    id: genId(),
    businessId: mockBranches[0]?.businessId ?? "biz_dermaland",
    code,
    name: input.name.trim(),
    address: input.address?.trim() ?? "",
    city: input.city?.trim() ?? "",
    province: input.province?.trim() ?? "",
    country: "República Dominicana",
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    isPilot: input.isPilot ?? false,
    showOnWebsite: input.showOnWebsite ?? false,
    status: input.status ?? "active",
    createdAt: now,
    updatedAt: now,
  };
  safeWrite(KEY_NEW, [...readNew(), branch]);
  return { ok: true, branch };
}

export function updateBranch(id: string, patch: Partial<Branch>): BranchResult {
  // Validar unicidad de código si cambia.
  if (patch.code) {
    const code = patch.code.toUpperCase();
    const dup = listAllBranches().some(
      (b) => b.id !== id && b.code.toUpperCase() === code,
    );
    if (dup) {
      return { ok: false, error: `Ya existe otra sucursal con el código ${code}.`, missingFields: ["code"] };
    }
  }
  const next = { ...patch, updatedAt: new Date().toISOString() };
  const persisted = readNew();
  const ix = persisted.findIndex((b) => b.id === id);
  if (ix >= 0) {
    const arr = [...persisted];
    arr[ix] = { ...arr[ix]!, ...next };
    safeWrite(KEY_NEW, arr);
    return { ok: true, branch: arr[ix]! };
  }
  const overrides = readOverrides();
  overrides[id] = { ...(overrides[id] ?? {}), ...next };
  safeWrite(KEY_OVERRIDES, overrides);
  const branch = getBranchFromStore(id);
  return branch ? { ok: true, branch } : { ok: false, error: "Sucursal no encontrada." };
}

export function setBranchActive(id: string, active: boolean): BranchResult {
  return updateBranch(id, { status: active ? "active" : "inactive" });
}

export type DeleteResult =
  | { ok: true }
  | { ok: false; error: string; deps?: BranchDependencies };

/** Elimina (hard) SÓLO si no tiene dependencias. Nunca borra datos asociados. */
export function deleteBranch(id: string): DeleteResult {
  const deps = branchDependencies(id);
  if (deps.total > 0) {
    return {
      ok: false,
      error:
        "No se puede eliminar esta sucursal porque tiene movimientos o datos asociados. Puedes inactivarla.",
      deps,
    };
  }
  // Quitar de nuevos o marcar borrado del seed.
  const persisted = readNew();
  const filtered = persisted.filter((b) => b.id !== id);
  if (filtered.length !== persisted.length) {
    safeWrite(KEY_NEW, filtered);
    return { ok: true };
  }
  const deleted = readDeleted();
  deleted.add(id);
  safeWrite(KEY_DELETED, [...deleted]);
  return { ok: true };
}

export function clearLocalBranches(): void {
  safeWrite(KEY_NEW, []);
  safeWrite(KEY_OVERRIDES, {});
  safeWrite(KEY_DELETED, []);
}

/**
 * Restaura una sucursal eliminada (soft-deleted) a estado inactivo.
 * Solo aplica al modo local. En modo supabase el server gestiona el deleted_at.
 */
export function restoreDeletedBranch(id: string): BranchResult {
  const deleted = readDeleted();
  if (!deleted.has(id)) {
    return { ok: false, error: "La sucursal no está en la lista de eliminadas." };
  }
  deleted.delete(id);
  safeWrite(KEY_DELETED, [...deleted]);
  // Asegurar que quede inactiva (no volver a activa automáticamente).
  return updateBranch(id, { status: "inactive" });
}

/**
 * Restablece las sucursales de ESTE equipo al baseline compartido (seed):
 * descarta altas/ediciones/bajas locales y la sucursal seleccionada guardada.
 * Útil cuando una PC quedó con datos divergentes (los cambios de sucursal se
 * guardan localmente en modo demo, no se sincronizan entre equipos).
 */
export function resetBranchesToSeed(): void {
  clearLocalBranches();
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(KEY_CURRENT);
  }
}

// ─── Backend de sucursales (local vs Supabase) ───────────────────────────────
/**
 * Modo del backend de sucursales:
 *  - "local"    → este store (localStorage), por equipo (modo demo actual).
 *  - "supabase" → fuente ÚNICA compartida vía /api/branches (RLS business_id).
 *
 * Se activa con `NEXT_PUBLIC_DATA_SOURCE=supabase` (build) + `DATA_SOURCE=
 * supabase` (servidor) + credenciales Supabase válidas. Por defecto: local.
 */
export const BRANCH_BACKEND: "local" | "supabase" =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase"
    ? "supabase"
    : "local";

/**
 * Lee sucursales desde el servidor (Supabase) — fuente única compartida.
 * Úsalo cuando `BRANCH_BACKEND === "supabase"`. En modo local seguir con
 * `listActiveBranches()` / `listAllBranches()`.
 */
export async function fetchBranchesFromServer(
  scope: "active" | "admin" = "active",
): Promise<Branch[]> {
  const res = await fetch(`/api/branches?scope=${scope}`, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as { branches: Branch[] }).branches;
}

/** Notifica a los hooks (local y servidor) que las sucursales cambiaron. */
function notifyBranchesChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

/**
 * Mapea el input del formulario al payload que espera la API/repositorio
 * Supabase (`Omit<Branch, "id"|"createdAt"|"updatedAt">`). Rellena los campos
 * que el formulario no captura con los mismos defaults que el alta local.
 */
function createInputToServerPayload(input: CreateBranchInput) {
  return {
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    address: input.address?.trim() ?? "",
    city: input.city?.trim() ?? "",
    province: input.province?.trim() ?? "",
    country: "República Dominicana",
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    isPilot: input.isPilot ?? false,
    showOnWebsite: input.showOnWebsite ?? false,
    status: input.status ?? "active",
  };
}

// ─── Mutaciones contra el servidor (modo supabase) ───────────────────────────

/** Alta de sucursal vía API compartida. Devuelve el mismo shape que el local. */
export async function createBranchOnServer(
  input: CreateBranchInput,
): Promise<BranchResult> {
  const missing: string[] = [];
  if (!input.name?.trim()) missing.push("name");
  if (!input.code?.trim()) missing.push("code");
  if (missing.length) {
    return { ok: false, error: "Complete los campos requeridos.", missingFields: missing };
  }
  try {
    const res = await fetch("/api/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createInputToServerPayload(input)),
    });
    const body = (await res.json().catch(() => ({}))) as {
      branch?: Branch;
      error?: string;
    };
    if (!res.ok || !body.branch) {
      return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    }
    notifyBranchesChanged();
    return { ok: true, branch: body.branch };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Edición de sucursal vía API compartida. */
export async function updateBranchOnServer(
  id: string,
  patch: Partial<Branch>,
): Promise<BranchResult> {
  try {
    const res = await fetch(`/api/branches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = (await res.json().catch(() => ({}))) as {
      branch?: Branch;
      error?: string;
    };
    if (!res.ok || !body.branch) {
      return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    }
    notifyBranchesChanged();
    return { ok: true, branch: body.branch };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Baja (soft delete) de sucursal vía API compartida. */
export async function softDeleteBranchOnServer(id: string): Promise<DeleteResult> {
  try {
    const res = await fetch(`/api/branches/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    }
    notifyBranchesChanged();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── Mutaciones unificadas (despachan local vs supabase) ─────────────────────
// Las páginas/formularios llaman a estas: en modo local conservan el camino
// síncrono (envuelto en promesa), en modo supabase pegan a la API compartida.

export async function saveBranch(
  mode: "create" | "edit",
  input: CreateBranchInput,
  id?: string,
): Promise<BranchResult> {
  if (BRANCH_BACKEND === "supabase") {
    return mode === "create"
      ? createBranchOnServer(input)
      : updateBranchOnServer(id!, input);
  }
  return mode === "create" ? createBranch(input) : updateBranch(id!, input);
}

export async function setBranchActiveAnywhere(
  id: string,
  active: boolean,
): Promise<BranchResult> {
  if (BRANCH_BACKEND === "supabase") {
    return updateBranchOnServer(id, { status: active ? "active" : "inactive" });
  }
  return setBranchActive(id, active);
}

export async function deleteBranchAnywhere(id: string): Promise<DeleteResult> {
  if (BRANCH_BACKEND === "supabase") {
    return softDeleteBranchOnServer(id);
  }
  return deleteBranch(id);
}

/**
 * Restaura una sucursal eliminada (unifica local y servidor).
 * En modo local quita el id del set de deleted y la deja inactiva.
 * En modo supabase hace PATCH { deleted_at: null, status: "inactive" }.
 */
export async function restoreBranchAnywhere(id: string): Promise<BranchResult> {
  if (BRANCH_BACKEND === "supabase") {
    return updateBranchOnServer(id, { status: "inactive" });
  }
  return restoreDeletedBranch(id);
}

// ─── Alias de fuente única (API explícita) ───────────────────────────────────
/** Sucursales ACTIVAS (operación). Única fuente para selectores operativos. */
export const getActiveBranches = listActiveBranches;
/** Todas las sucursales (Administración): activas + inactivas. */
export const getAllBranchesForAdmin = listAllBranches;
/** Sucursal por id (resuelve del store; incluye inactivas). */
export function getBranchById(id: string): Branch | undefined {
  return getBranchFromStore(id);
}

// ─── Helpers centrales (fuente única declarativa) ────────────────────────────

/**
 * Sucursales OPERATIVAS: activas y no eliminadas (alias explícito).
 * Única fuente para selectores de operación (POS, caja, inventario…).
 */
export const getOperationalBranches = listActiveBranches;

/**
 * Sucursales ADMIN: activas + inactivas, NO eliminadas (default admin).
 * Usar en listados de administración donde se quiere ver inactivas
 * pero NO las borradas (soft-deleted).
 */
export const getAdminBranches = listAllBranches;

/**
 * Sucursales ELIMINADAS (soft-deleted). Solo para el filtro
 * "Mostrar eliminadas" en admin. En modo local, reconstruye la lista
 * desde el seed + nuevas, intersectando con el set de deleted ids.
 * En modo supabase se consulta vía fetchBranchesFromServer("deleted").
 */
export function getDeletedBranches(): Branch[] {
  const deleted = readDeleted();
  if (deleted.size === 0) return [];
  const overrides = readOverrides();
  const seed = mockBranches.map((b) =>
    overrides[b.id] ? { ...b, ...overrides[b.id] } : b,
  );
  return [...seed, ...readNew()].filter((b) => deleted.has(b.id));
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export interface BranchesState {
  list: Branch[];
  loadError: boolean;
}

/**
 * Versión extendida del hook de sucursales que expone el estado de error.
 * Usar en componentes que quieran mostrar "No se pudieron cargar las sucursales"
 * en lugar de una lista vacía silenciosa.
 *
 * En modo supabase:
 *  - Parte con `[]` (nunca mock).
 *  - Hace un fetch al servidor con 1 reintento automático (backoff 800ms).
 *  - Si el fetch falla tras el reintento: deja la lista como estaba y expone
 *    `loadError=true`. NUNCA cae a mock/localStorage en modo supabase.
 *  - En el primer mount llama a `ensureStorageVersion()` para limpiar datos
 *    mock obsoletos (overrides de Naco, etc.) antes de cargar.
 *
 * En modo local:
 *  - Comportamiento actual conservado: seed+localStorage de inmediato.
 */
export function useBranchesState(): BranchesState {
  const [state, setState] = React.useState<BranchesState>(() => ({
    list: BRANCH_BACKEND === "supabase" ? [] : listAllBranches(),
    loadError: false,
  }));

  React.useEffect(() => {
    // Limpiar datos mock obsoletos (overrides/altas/bajas de sesiones demo
    // previas) ANTES del primer fetch. En modo local esta función es un no-op
    // porque igual usaría el localStorage para el seed.
    ensureStorageVersion();
    let alive = true;

    const refresh = async () => {
      if (BRANCH_BACKEND === "supabase") {
        // Scope admin: trae activas + inactivas; los selectores operativos
        // filtran por status en cliente (useActiveBranches).
        // En modo supabase NUNCA caemos a mock/localStorage.
        try {
          const branches = await fetchBranchesFromServer("admin");
          if (alive) setState({ list: branches, loadError: false });
        } catch {
          // Primer intento fallido → un reintento con backoff corto.
          await new Promise((r) => setTimeout(r, 800));
          if (!alive) return;
          try {
            const branches = await fetchBranchesFromServer("admin");
            if (alive) setState({ list: branches, loadError: false });
          } catch {
            // Ambos intentos fallaron: mantener la lista actual sin pisar con
            // mock, y marcar error para que los consumidores puedan mostrarlo.
            if (alive) setState((prev) => ({ ...prev, loadError: true }));
          }
        }
      } else {
        setState({ list: listAllBranches(), loadError: false });
      }
    };

    const refreshSync = () => { void refresh(); };
    window.addEventListener(CHANGE_EVENT, refreshSync);
    window.addEventListener("storage", refreshSync);
    void refresh();

    return () => {
      alive = false;
      window.removeEventListener(CHANGE_EVENT, refreshSync);
      window.removeEventListener("storage", refreshSync);
    };
  }, []);

  return state;
}

/**
 * Hook reactivo de sucursales — lista plana. Usa `useBranchesState` como base.
 * Para acceder al error de carga, usa `useBranchesState()` directamente.
 */
export function useBranches(): Branch[] {
  return useBranchesState().list;
}

export function useBranch(id: string | null | undefined): Branch | undefined {
  const all = useBranches();
  if (!id) return undefined;
  return all.find((b) => b.id === id);
}

/** Sólo sucursales activas, reactivo a cambios del store. */
export function useActiveBranches(): Branch[] {
  return useBranches().filter((b) => b.status === "active");
}

export interface CurrentBranchApi {
  branchId: string;
  branches: Branch[];
  setBranchId: (id: string) => void;
  /** Aviso cuando la sucursal guardada dejó de estar activa. */
  notice: string | null;
  dismissNotice: () => void;
}

/**
 * Selector de sucursal "actual" (selector superior / business switcher).
 *
 * Persiste la selección en localStorage y la VALIDA contra las sucursales
 * activas: si la guardada fue inactivada o eliminada, cambia automáticamente a
 * una activa disponible y emite un aviso. Reactivo: si cambia el set de
 * sucursales activas (editar/inactivar/eliminar), se re-valida.
 */
export function useCurrentBranch(): CurrentBranchApi {
  const branches = useActiveBranches();
  const [branchId, setBranchIdState] = React.useState<string>("");
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? window.localStorage.getItem(KEY_CURRENT) ?? ""
        : "";
    const stillActive = branches.some((b) => b.id === saved);
    if (stillActive) {
      if (branchId !== saved) setBranchIdState(saved);
      return;
    }
    const fallback = branches[0]?.id ?? "";
    if (saved && fallback) {
      setNotice(
        "La sucursal seleccionada ya no está activa. Se cambió a una sucursal disponible.",
      );
    }
    setBranchIdState(fallback);
    if (typeof window !== "undefined") {
      if (fallback) window.localStorage.setItem(KEY_CURRENT, fallback);
      else window.localStorage.removeItem(KEY_CURRENT);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches.map((b) => b.id).join(",")]);

  const setBranchId = React.useCallback((id: string) => {
    setBranchIdState(id);
    setNotice(null);
    if (typeof window !== "undefined") window.localStorage.setItem(KEY_CURRENT, id);
  }, []);

  return {
    branchId,
    branches,
    setBranchId,
    notice,
    dismissNotice: () => setNotice(null),
  };
}
