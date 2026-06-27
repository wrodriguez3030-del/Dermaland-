import type { Proforma } from "@/types";

/**
 * Reglas de editabilidad de un documento de venta. No se permite edición libre
 * de documentos ya emitidos fiscalmente, anulados o cerrados. Como DGII real
 * está apagado, en demo se permite editar datos NO fiscales (cliente del
 * documento, notas); los montos/ítems quedan bloqueados (requieren nota de
 * crédito / anulación).
 */

const FISCAL_MSG =
  "Esta factura ya fue emitida fiscalmente. Para corregirla debes emitir una nota de crédito o anulación según corresponda.";

export interface EditabilityResult {
  editable: boolean;
  reason?: string;
}

type EditableFields = Pick<Proforma, "status">;

export function documentEditability(p: EditableFields): EditabilityResult {
  if (p.status === "cancelled") {
    return { editable: false, reason: "Este documento fue anulado y no puede editarse." };
  }
  // En nuestro modelo, "emitido fiscalmente" = convertido a e-CF.
  if (p.status === "converted_to_ecf") {
    return { editable: false, reason: FISCAL_MSG };
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
