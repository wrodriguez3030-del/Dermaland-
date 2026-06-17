"use client";

import * as React from "react";
import { mockBusiness, getWarehouseById } from "@/lib/mock-data/tenancy";
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
  originWarehouseId: string;
  destinationWarehouseId: string;
  transferDate: string;
  notes?: string;
  items: TransferItemDraft[];
  createdByName?: string;
}

export type CreateTransferResult =
  | { ok: true; transfer: Transfer }
  | { ok: false; error: string };

/** Valida la cabecera y las cantidades contra el stock disponible. */
export function validateTransfer(input: CreateTransferInput): string | null {
  if (!input.originWarehouseId) return "Selecciona el almacén origen.";
  if (!input.destinationWarehouseId) return "Selecciona el almacén destino.";
  if (input.originWarehouseId === input.destinationWarehouseId) {
    return "El almacén origen y destino no pueden ser iguales.";
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
    if (lot.warehouseId !== input.originWarehouseId) {
      return "Todos los lotes deben pertenecer al almacén origen.";
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

  const originWh = getWarehouseById(input.originWarehouseId);
  const destWh = getWarehouseById(input.destinationWarehouseId);
  if (!originWh || !destWh) {
    return { ok: false, error: "Almacén origen o destino inválido." };
  }

  const lots = listAllLots();
  const transferId = genId("trf");
  const transferNumber = genTransferNumber();
  const now = new Date().toISOString();

  const items: TransferItem[] = [];
  for (const it of input.items) {
    const lot = lots.find((l) => l.id === it.lotId)!;
    const res = transferStock({
      originLotId: it.lotId,
      destBranchId: destWh.branchId,
      destWarehouseId: destWh.id,
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
    originWarehouseId: originWh.id,
    originBranchId: originWh.branchId,
    destinationWarehouseId: destWh.id,
    destinationBranchId: destWh.branchId,
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
