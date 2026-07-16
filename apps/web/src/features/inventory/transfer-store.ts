"use client";

import * as React from "react";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import { defaultWarehouseForBranch } from "@/features/tenancy/branch-store";
import { listAllLots, transferStock } from "./lot-store";

/**
 * Store de transferencias entre almacenes — MVP (localStorage).
 *
 * Una transferencia mueve cantidades de uno o más lotes desde el almacén
 * origen al almacén destino: descuenta del origen, crea lote equivalente en
 * destino (conservando lote y vencimiento) y registra `transfer_out` +
 * `transfer_in` con la misma referencia. Todo dentro del mismo `business_id`.
 *
 * Producción: mapea a tablas `inventory_transfers` + `inventory_transfer_items`
 * (ver migración 0004) dentro de una transacción.
 */

const KEY_TRANSFERS = "dermaland.transfers";
const CHANGE_EVENT = "dermaland:transfers-changed";
const ACTOR = { userId: "usr_cashier_1", userName: "Rosa Peralta" };

/**
 * Backend de transferencias. En "supabase" el flujo real vive en el server
 * (RPC `transfer_stock_atomic` vía `/api/transfers`) y mueve stock REAL; en
 * "local" es el MVP mock/localStorage.
 */
export const TRANSFER_BACKEND: "local" | "supabase" =
  process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase" ? "supabase" : "local";

export interface TransferItemDraft {
  lotId: string;
  productId: string;
  quantity: number;
}

export interface TransferItem {
  id: string;
  businessId: string;
  transferId: string;
  productId: string;
  lotId: string;
  lotNumber: string;
  quantity: number;
  unitCost: number;
  expiresAt: string;
}

export interface Transfer {
  id: string;
  businessId: string;
  transferNumber: string;
  originWarehouseId: string;
  originBranchId: string;
  destinationWarehouseId: string;
  destinationBranchId: string;
  transferDate: string;
  notes?: string;
  status: "completed" | "voided";
  createdBy: string;
  createdByName: string;
  totalQuantity: number;
  items: TransferItem[];
  createdAt: string;
  updatedAt: string;
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

export function listTransfers(): Transfer[] {
  const v = safeRead<Transfer[]>(KEY_TRANSFERS, []);
  const list = Array.isArray(v) ? v : [];
  return [...list].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function getTransfer(id: string): Transfer | undefined {
  return listTransfers().find((t) => t.id === id);
}

function genId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rand}`;
}

function genTransferNumber(): string {
  const year = new Date().getFullYear();
  const seq = String(Math.floor(Date.now() / 1000) % 100000).padStart(5, "0");
  return `TRF-${year}-${seq}`;
}

export interface CreateTransferInput {
  /** Sucursal origen (el usuario opera por sucursal; el almacén es interno). */
  originBranchId: string;
  /** Sucursal destino. */
  destinationBranchId: string;
  transferDate: string;
  notes?: string;
  items: TransferItemDraft[];
  createdByName?: string;
}

export type CreateTransferResult =
  | { ok: true; transfer: Transfer }
  | { ok: false; error: string };

/** Valida la cabecera y las cantidades contra el stock disponible (por sucursal). */
export function validateTransfer(input: CreateTransferInput): string | null {
  if (!input.originBranchId) return "Selecciona la sucursal origen.";
  if (!input.destinationBranchId) return "Selecciona la sucursal destino.";
  if (input.originBranchId === input.destinationBranchId) {
    return "La sucursal origen y destino no pueden ser iguales.";
  }
  if (!input.transferDate) return "Indica la fecha de la transferencia.";
  if (!input.items || input.items.length === 0) {
    return "Agrega al menos un producto a la transferencia.";
  }
  const lots = listAllLots();
  for (const it of input.items) {
    if (!(it.quantity > 0)) {
      return "Cada producto debe tener una cantidad mayor que 0.";
    }
    const lot = lots.find((l) => l.id === it.lotId);
    if (!lot) return "Uno de los lotes ya no existe.";
    if (lot.branchId !== input.originBranchId) {
      return "Todos los lotes deben pertenecer a la sucursal origen.";
    }
    if (lot.status !== "available") {
      return `El lote ${lot.lotNumber} no está disponible (${lot.status}).`;
    }
    if (it.quantity > lot.currentQuantity) {
      return "La cantidad a transferir supera el stock disponible.";
    }
  }
  return null;
}

export function createTransfer(input: CreateTransferInput): CreateTransferResult {
  const err = validateTransfer(input);
  if (err) return { ok: false, error: err };

  // El almacén es interno: se mapea automáticamente al default de cada sucursal.
  const originWarehouseId = defaultWarehouseForBranch(input.originBranchId);
  const destWarehouseId = defaultWarehouseForBranch(input.destinationBranchId);

  const lots = listAllLots();
  const transferId = genId("trf");
  const transferNumber = genTransferNumber();
  const now = new Date().toISOString();

  const items: TransferItem[] = [];
  for (const it of input.items) {
    const lot = lots.find((l) => l.id === it.lotId)!;
    const res = transferStock({
      originLotId: it.lotId,
      destBranchId: input.destinationBranchId,
      destWarehouseId,
      quantity: it.quantity,
      reference: transferNumber,
      notes: input.notes,
    });
    if (!res.ok) {
      // Si algún ítem falla tras validar, devolvemos el error (los previos ya
      // se aplicaron — el caso es muy improbable por la validación previa).
      return { ok: false, error: res.error };
    }
    items.push({
      id: genId("trfi"),
      businessId: mockBusiness.id,
      transferId,
      productId: lot.productId,
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      quantity: it.quantity,
      unitCost: lot.unitCost,
      expiresAt: lot.expiresAt,
    });
  }

  const transfer: Transfer = {
    id: transferId,
    businessId: mockBusiness.id,
    transferNumber,
    originWarehouseId,
    originBranchId: input.originBranchId,
    destinationWarehouseId: destWarehouseId,
    destinationBranchId: input.destinationBranchId,
    transferDate: input.transferDate,
    notes: input.notes,
    status: "completed",
    createdBy: ACTOR.userId,
    createdByName: input.createdByName || ACTOR.userName,
    totalQuantity: items.reduce((s, i) => s + i.quantity, 0),
    items,
    createdAt: now,
    updatedAt: now,
  };

  safeWrite(KEY_TRANSFERS, [transfer, ...safeRead<Transfer[]>(KEY_TRANSFERS, [])]);
  return { ok: true, transfer };
}

export function clearLocalTransfers(): void {
  safeWrite(KEY_TRANSFERS, []);
}

// ─── Backend Supabase (datos reales) ──────────────────────────────────────────

/** POST /api/transfers → crea la transferencia real (RPC atómico). */
export async function createTransferOnServer(
  input: CreateTransferInput,
): Promise<CreateTransferResult> {
  try {
    const res = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = await res.json().catch(() => ({}) as Record<string, unknown>);
    if (!res.ok) {
      return {
        ok: false,
        error:
          (json as { error?: string }).error ??
          "No se pudo crear la transferencia.",
      };
    }
    return { ok: true, transfer: (json as { transfer: Transfer }).transfer };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error de red al crear la transferencia.",
    };
  }
}

/** Crea una transferencia usando el backend activo (supabase real o local). */
export async function submitTransfer(
  input: CreateTransferInput,
): Promise<CreateTransferResult> {
  if (TRANSFER_BACKEND === "supabase") return createTransferOnServer(input);
  return createTransfer(input);
}

export async function fetchTransfersFromServer(): Promise<Transfer[]> {
  const res = await fetch("/api/transfers", {
    headers: { "Cache-Control": "no-store" },
  });
  if (!res.ok) throw new Error("No se pudieron cargar las transferencias.");
  const json = (await res.json()) as { transfers?: Transfer[] };
  return json.transfers ?? [];
}

export async function fetchTransferFromServer(id: string): Promise<Transfer | null> {
  const res = await fetch(`/api/transfers/${id}`, {
    headers: { "Cache-Control": "no-store" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("No se pudo cargar la transferencia.");
  const json = (await res.json()) as { transfer?: Transfer };
  return json.transfer ?? null;
}

/** Lista de transferencias (real en supabase, localStorage en local). */
export function useTransfers(): { transfers: Transfer[]; loading: boolean } {
  const [transfers, setTransfers] = React.useState<Transfer[]>(() =>
    TRANSFER_BACKEND === "supabase" ? [] : listTransfers(),
  );
  const [loading, setLoading] = React.useState(TRANSFER_BACKEND === "supabase");
  React.useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (TRANSFER_BACKEND === "supabase") {
        fetchTransfersFromServer()
          .then((t) => {
            if (alive) {
              setTransfers(t);
              setLoading(false);
            }
          })
          .catch(() => {
            if (alive) setLoading(false);
          });
      } else {
        setTransfers(listTransfers());
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
  return { transfers, loading };
}

/** Una transferencia por id (real en supabase, localStorage en local). */
export function useTransfer(id: string): { transfer: Transfer | undefined; loading: boolean } {
  const [transfer, setTransfer] = React.useState<Transfer | undefined>(() =>
    TRANSFER_BACKEND === "supabase" ? undefined : getTransfer(id),
  );
  const [loading, setLoading] = React.useState(TRANSFER_BACKEND === "supabase");
  React.useEffect(() => {
    let alive = true;
    if (TRANSFER_BACKEND === "supabase") {
      setLoading(true);
      fetchTransferFromServer(id)
        .then((t) => {
          if (alive) {
            setTransfer(t ?? undefined);
            setLoading(false);
          }
        })
        .catch(() => {
          if (alive) setLoading(false);
        });
      return () => {
        alive = false;
      };
    }
    const refresh = () => setTransfer(getTransfer(id));
    window.addEventListener(CHANGE_EVENT, refresh);
    refresh();
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
    };
  }, [id]);
  return { transfer, loading };
}

export function useTransfersTick(): number {
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
