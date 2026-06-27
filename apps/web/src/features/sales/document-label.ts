import type { Proforma } from "@/types";

/**
 * Clasificación y etiqueta del documento de venta a partir de los campos que
 * persiste el POS en la tabla `proformas` (modelo único de documento de venta):
 *
 *  - `documentKind`: "proforma" | "invoice"
 *  - `ecfType`: "31" | "32" (solo e-CF)
 *  - `ecfNumber`: comprobante fiscal generado (B02…/B01… para NCF, E32…/E31…)
 *
 * Regla de clasificación:
 *  - documentKind === "invoice" + ecfType  → e-CF (E32/E31)
 *  - documentKind === "invoice" sin ecfType → NCF tradicional (B02/B01)
 *  - resto                                  → Proforma
 *
 * Esto permite que la pantalla **Proformas** muestre solo proformas y la
 * pantalla **Ventas / Facturas** muestre las facturas NCF/e-CF, usando el mismo
 * criterio en todos lados.
 */

export type SaleDocClass = "proforma" | "ncf" | "ecf";

type DocFields = Pick<Proforma, "documentKind" | "ecfType" | "ecfNumber">;

export function classifySaleDocument(p: DocFields): SaleDocClass {
  if (p.documentKind === "invoice") {
    return p.ecfType ? "ecf" : "ncf";
  }
  return "proforma";
}

export function isProformaDocument(p: DocFields): boolean {
  return classifySaleDocument(p) === "proforma";
}

export function isInvoiceDocument(p: DocFields): boolean {
  return classifySaleDocument(p) !== "proforma";
}

/** Etiqueta legible del tipo de documento (para chips/columnas). */
export function saleDocumentLabel(p: DocFields): string {
  const cls = classifySaleDocument(p);
  if (cls === "ecf") {
    return p.ecfType === "31"
      ? "Crédito Fiscal e-CF (E31)"
      : "Consumo e-CF (E32)";
  }
  if (cls === "ncf") {
    const prefix = (p.ecfNumber ?? "").slice(0, 3).toUpperCase();
    if (prefix === "B01") return "Crédito fiscal (B01)";
    if (prefix === "B02") return "Factura de consumo (B02)";
    return "Factura NCF";
  }
  return "Proforma";
}

/** Tono de badge por clase de documento. */
export function saleDocumentTone(
  p: DocFields,
): "neutral" | "purple" | "info" {
  const cls = classifySaleDocument(p);
  if (cls === "ecf") return "purple";
  if (cls === "ncf") return "info";
  return "neutral";
}
