"use client";

// Lotes de pago de comisión (§13). Un lote agrupa las comisiones pagadas en un
// período/vendedor. Crear un lote marca sus comisiones como "pagadas" y deja
// constancia en la auditoría. Persistencia en localStorage; API estable para
// migrar a `commission_payment_batches` (Fase 2).

import * as React from "react";
import { setPayout } from "./commission-payout-store";
import { recordCommissionAudit } from "./commission-audit-store";

export interface CommissionBatch {
  id: string;
  periodFrom?: string;
  periodTo?: string;
  sellerId?: string;
  sellerName?: string;
  comprobantes: string[];
  total: number;
  status: "paid";
  createdBy: string;
  createdAt: string;
}

const KEY = "dermaland.commission-batches";
const CHANGE_EVENT = "dermaland:commission-batches-changed";

export function addBatchIn(list: CommissionBatch[], batch: CommissionBatch): CommissionBatch[] {
  return [batch, ...list];
}

function read(): CommissionBatch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CommissionBatch[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function write(list: CommissionBatch[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

let counter = 0;
function batchId(): string {
  counter += 1;
  return `batch_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export type BatchResult = { ok: true; batch: CommissionBatch } | { ok: false; error: string };

/**
 * Crea un lote de pago: marca las comisiones como pagadas y registra auditoría.
 * `comprobantes` debe ser no vacío.
 */
export function createBatch(input: {
  comprobantes: string[];
  total: number;
  periodFrom?: string;
  periodTo?: string;
  sellerId?: string;
  sellerName?: string;
  userName?: string;
}): BatchResult {
  if (!input.comprobantes.length)
    return { ok: false, error: "Selecciona al menos una comisión para el lote." };
  const id = batchId();
  const batch: CommissionBatch = {
    id,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    sellerId: input.sellerId,
    sellerName: input.sellerName,
    comprobantes: input.comprobantes,
    total: input.total,
    status: "paid",
    createdBy: input.userName || "Administrador",
    createdAt: new Date().toISOString(),
  };
  write(addBatchIn(read(), batch));
  // Marca las comisiones como pagadas + auditoría.
  setPayout(input.comprobantes, "paid", { userName: input.userName, batchId: id });
  recordCommissionAudit({
    action: "batch_created",
    comprobantes: input.comprobantes,
    amount: input.total,
    batchId: id,
    userName: input.userName,
    reason: input.sellerName ? `Lote de ${input.sellerName}` : "Lote de pago de comisión",
  });
  return { ok: true, batch };
}

export function listCommissionBatches(): CommissionBatch[] {
  return read();
}

export function useCommissionBatches(): CommissionBatch[] {
  const [list, setList] = React.useState<CommissionBatch[]>([]);
  React.useEffect(() => {
    const refresh = () => setList(read());
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
