"use client";

import * as React from "react";

/**
 * Store de Notas de Crédito mock generadas desde el detalle de una
 * factura. Persiste en localStorage `dermaland.dgii-credit-notes`.
 *
 * Cada NC se asocia a la factura origen por `sourceInvoiceId`. La UI
 * usa el mapeo para mostrar la NC existente si se vuelve a abrir la
 * factura. NO persiste artefactos pesados (XML/PDF) — esos se descargan
 * en demanda re-ejecutando el endpoint.
 *
 * Producción (Fase futura): reemplazar por tabla `credit_notes` o
 * `electronic_invoices` con `source_invoice_id` (ya prevista en la
 * migración 0003).
 */

export interface CreditNoteRecord {
  id: string;
  sourceInvoiceId: string;
  sourceEcfType: string;
  sourceEcfNumber: string;
  ncEncf: string;
  motivo: string;
  /** 1=Anulación, 2=Cambios, 3=Devolución, 4=Pronto pago, 5=Corrección. */
  codigoModificacion: 1 | 2 | 3 | 4 | 5;
  /** 0 si <=30 días del origen, 1 si >30. */
  indicadorNotaCredito: 0 | 1;
  securityCode: string;
  qrUrl: string;
  mockTrackId: string;
  createdAt: string;
  /** Marca DEMO — esta NC no fue enviada a DGII. */
  isMock: true;
}

const STORAGE_KEY = "dermaland.dgii-credit-notes";
const CHANGE_EVENT = "dermaland:dgii-credit-notes-changed";

function readLocal(): CreditNoteRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CreditNoteRecord[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: CreditNoteRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function addCreditNote(record: CreditNoteRecord): void {
  const list = readLocal();
  writeLocal([record, ...list]);
}

export function getCreditNoteByInvoice(
  sourceInvoiceId: string,
): CreditNoteRecord | undefined {
  return readLocal().find((r) => r.sourceInvoiceId === sourceInvoiceId);
}

export function listCreditNotes(): CreditNoteRecord[] {
  return readLocal().sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  );
}

export function deleteCreditNote(id: string): void {
  writeLocal(readLocal().filter((r) => r.id !== id));
}

export function generateCreditNoteId(): string {
  return `nc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function useCreditNoteForInvoice(
  sourceInvoiceId: string | null | undefined,
): CreditNoteRecord | undefined {
  const [nc, setNc] = React.useState<CreditNoteRecord | undefined>(undefined);
  React.useEffect(() => {
    if (!sourceInvoiceId) return;
    const refresh = () =>
      setNc(getCreditNoteByInvoice(sourceInvoiceId) ?? undefined);
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [sourceInvoiceId]);
  return nc;
}
