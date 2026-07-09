"use client";

// Bitácora de auditoría de comisiones (§15). Registra aprobaciones, pagos,
// exclusiones, lotes y cambios de regla con usuario, fecha, monto y motivo.
// Persistencia en localStorage; API estable para migrar a `commission_audit`.

import * as React from "react";

export type CommissionAuditAction =
  | "approved"
  | "paid"
  | "excluded"
  | "included"
  | "batch_created"
  | "voided"
  | "adjusted";

export const AUDIT_ACTION_LABEL: Record<CommissionAuditAction, string> = {
  approved: "Aprobada",
  paid: "Pagada",
  excluded: "Excluida",
  included: "Incluida",
  batch_created: "Lote de pago",
  voided: "Anulada",
  adjusted: "Ajustada",
};

export interface CommissionAuditEntry {
  id: string;
  action: CommissionAuditAction;
  /** Comprobantes afectados (uno o varios). */
  comprobantes: string[];
  amount?: number;
  batchId?: string;
  userName: string;
  reason?: string;
  at: string;
}

const KEY = "dermaland.commission-audit";
const CHANGE_EVENT = "dermaland:commission-audit-changed";

export function addAuditIn(
  list: CommissionAuditEntry[],
  entry: CommissionAuditEntry,
): CommissionAuditEntry[] {
  return [entry, ...list].slice(0, 500); // tope defensivo
}

function read(): CommissionAuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CommissionAuditEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function write(list: CommissionAuditEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

let counter = 0;
function auditId(): string {
  counter += 1;
  return `ca_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function recordCommissionAudit(input: {
  action: CommissionAuditAction;
  comprobantes: string[];
  amount?: number;
  batchId?: string;
  userName?: string;
  reason?: string;
}): void {
  write(
    addAuditIn(read(), {
      id: auditId(),
      action: input.action,
      comprobantes: input.comprobantes,
      amount: input.amount,
      batchId: input.batchId,
      userName: input.userName || "Administrador",
      reason: input.reason,
      at: new Date().toISOString(),
    }),
  );
}

export function listCommissionAudit(): CommissionAuditEntry[] {
  return read();
}

export function useCommissionAudit(): CommissionAuditEntry[] {
  const [list, setList] = React.useState<CommissionAuditEntry[]>([]);
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
