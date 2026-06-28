import type { Proforma } from "@/types";
import { classifySaleDocument } from "./document-label";

/**
 * Reglas de editabilidad de un documento de venta. No se permite edición libre
 * de documentos ya emitidos fiscalmente, anulados o cerrados. Como DGII real
 * está apagado, en demo se permite editar datos NO fiscales (cliente del
 * documento, notas) de una factura NCF/proforma; los montos/ítems quedan
 * bloqueados (requieren nota de crédito / anulación).
 *
 * Excepción dura: una factura **electrónica e-CF** (E31/E32/E33/E34/E41/E43)
 * NUNCA es editable, ni siquiera en demo/mock. Por seguridad fiscal el único
 * camino de corrección es nota de crédito, nota de débito o anulación.
 */

const FISCAL_MSG =
  "Esta factura ya fue emitida fiscalmente. Para corregirla debes emitir una nota de crédito o anulación según corresponda.";

const ECF_MSG =
  "Las facturas electrónicas e-CF no se pueden editar. Para corregirlas debes emitir una nota de crédito, nota de débito o anulación según corresponda.";

export interface EditabilityResult {
  editable: boolean;
  reason?: string;
  /** Causa del bloqueo — para condicionar la UI y la auditoría. */
  blockedBy?: "cancelled" | "ecf" | "fiscal";
}

type EditableFields = Pick<Proforma, "status"> &
  Partial<Pick<Proforma, "documentKind" | "ecfType" | "ecfNumber">>;

/** True si el documento es una factura electrónica e-CF (no editable). */
export function isElectronicInvoice(p: EditableFields): boolean {
  return classifySaleDocument(p) === "ecf";
}

export function documentEditability(p: EditableFields): EditabilityResult {
  if (p.status === "cancelled") {
    return {
      editable: false,
      reason: "Este documento fue anulado y no puede editarse.",
      blockedBy: "cancelled",
    };
  }
  // Factura electrónica e-CF → bloqueada SIEMPRE (aunque sea demo/mock/testecf).
  if (isElectronicInvoice(p)) {
    return { editable: false, reason: ECF_MSG, blockedBy: "ecf" };
  }
  // En nuestro modelo, "emitido fiscalmente" = convertido a e-CF.
  if (p.status === "converted_to_ecf") {
    return { editable: false, reason: FISCAL_MSG, blockedBy: "fiscal" };
  }
  return { editable: true };
}

export function isDocumentEditable(p: EditableFields): boolean {
  return documentEditability(p).editable;
}

/** Campos que se pueden editar de forma segura (no afectan fiscal/stock/caja). */
export interface ProformaEditPatch {
  customerName?: string;
  customerPhone?: string | null;
  customerDocument?: string | null;
  notes?: string | null;
}

/** Llaves permitidas en el patch — usado para sanear en cliente y servidor. */
export const EDITABLE_PROFORMA_FIELDS: ReadonlyArray<keyof ProformaEditPatch> = [
  "customerName",
  "customerPhone",
  "customerDocument",
  "notes",
];

/** Filtra un objeto a solo los campos editables permitidos. */
export function pickEditableProformaFields(
  input: Record<string, unknown>,
): ProformaEditPatch {
  const out: ProformaEditPatch = {};
  for (const k of EDITABLE_PROFORMA_FIELDS) {
    if (k in input) {
      const v = input[k];
      // customerName no puede quedar vacío.
      if (k === "customerName") {
        if (typeof v === "string" && v.trim()) out.customerName = v.trim();
      } else {
        out[k] = v == null || v === "" ? null : String(v);
      }
    }
  }
  return out;
}
