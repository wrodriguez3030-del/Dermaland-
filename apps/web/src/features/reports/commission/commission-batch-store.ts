"use client";

// Lotes de pago de comisión (§13). Un lote agrupa las comisiones pagadas en un
// período/vendedor. Crear un lote marca sus comisiones como "pagadas" y deja
// constancia en la auditoría. Fase 2: fuente ÚNICA en Supabase
// (`commission_payment_batches`) vía `/api/commission/batches` — el servidor
// orquesta lote + pagos + auditoría en una sola llamada; localStorage como
// fallback (encadena las tres escrituras locales).

import * as React from "react";
import { setPayout } from "./commission-payout-store";
import { recordCommissionAudit } from "./commission-audit-store";
import {
  COMMISSION_BACKEND,
  COMMISSION_EVENTS,
  apiGetList,
  apiSend,
  dispatchCommission,
} from "./commission-backend";

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

export interface BatchInput {
  comprobantes: string[];
  total: number;
  periodFrom?: string;
  periodTo?: string;
  sellerId?: string;
  sellerName?: string;
  userName?: string;
}

/**
 * Crea un lote de pago: marca las comisiones como pagadas y registra auditoría.
 * `comprobantes` debe ser no vacío. En supabase todo ocurre server-side (una
 * llamada, consistente); en local se encadenan las tres escrituras.
 */
export async function createBatch(input: BatchInput): Promise<BatchResult> {
  if (!input.comprobantes.length)
    return { ok: false, error: "Selecciona al menos una comisión para el lote." };

  if (COMMISSION_BACKEND === "supabase") {
    const res = await apiSend<CommissionBatch>("POST", "batches", input, "batch");
    if (!res.ok) return { ok: false, error: res.error };
    // El lote también marcó pagos y auditoría server-side: refresca los tres.
    dispatchCommission(COMMISSION_EVENTS.batches, COMMISSION_EVENTS.payouts, COMMISSION_EVENTS.audit);
    return { ok: true, batch: res.item! };
  }

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
  await setPayout(input.comprobantes, "paid", { userName: input.userName, batchId: id });
  await recordCommissionAudit({
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
    let alive = true;
    const refresh = () => {
      if (COMMISSION_BACKEND === "supabase") {
        apiGetList<CommissionBatch>("batches", "batches")
          .then((d) => { if (alive) setList(d); })
          .catch(() => { if (alive) setList(read()); });
      } else {
        setList(read());
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
