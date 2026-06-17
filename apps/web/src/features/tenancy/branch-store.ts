"use client";

import * as React from "react";
import type { Branch } from "@/types";
import { mockBranches, mockWarehouses } from "@/lib/mock-data/tenancy";
import { listAllLots, listAllMovements } from "@/features/inventory/lot-store";
import { listAllProformas } from "@/features/sales/proforma-store";

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

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useBranches(): Branch[] {
  const [list, setList] = React.useState<Branch[]>(() => listAllBranches());
  React.useEffect(() => {
    const refresh = () => setList(listAllBranches());
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

export function useBranch(id: string | null | undefined): Branch | undefined {
  const all = useBranches();
  if (!id) return undefined;
  return all.find((b) => b.id === id);
}
