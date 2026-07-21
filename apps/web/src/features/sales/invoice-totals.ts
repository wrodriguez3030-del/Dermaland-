import type { SaleItem } from "@/types";

/**
 * Totales de PRESENTACIÓN de un documento de venta, consistentes con las líneas.
 *
 * Los precios de DermaLand son ITBIS-INCLUIDOS. En la factura las líneas muestran
 * el precio inclusivo, así que el resumen también debe ser inclusivo para que
 * cuadre a la vista:
 *
 *   Subtotal (bruto)      = Σ precio_inclusivo × cantidad   (coincide con líneas)
 *   Descuento             = Subtotal − Total                (todos los descuentos)
 *   ITBIS (incluido)      = impuesto ya contenido en el Total (informativo)
 *   Total                 = Subtotal − Descuento
 *
 * No mezcla bases (antes el subtotal salía sin ITBIS mientras las líneas iban con
 * ITBIS → parecía descuadrado). El `total` y el `itbis` provienen del motor de
 * cálculo (cart-line) ya persistidos; aquí solo se re-expresa de forma coherente.
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface InvoiceDisplayTotals {
  /** Subtotal bruto inclusivo (Σ precio×cantidad). Coincide con las líneas. */
  grossInclusive: number;
  /** Descuento total inclusivo (bruto − total). 0 si no hay. */
  discountInclusive: number;
  /** % de descuento global, si aplica (solo etiqueta). */
  discountPercent?: number;
  /** ITBIS ya incluido en el total (informativo). */
  itbisIncluded: number;
  /**
   * Base gravada SIN ITBIS del total (= total − ITBIS). Sirve para el desglose
   * que SUMA en pantalla — `baseWithoutItbis + itbisIncluded = total` — y así
   * evitar que "Subtotal" repita el "Total" cuando el precio es ITBIS-incluido.
   */
  baseWithoutItbis: number;
  /** Total a pagar (inclusivo). */
  total: number;
}

export function invoiceDisplayTotals(p: {
  items: Pick<SaleItem, "unitPrice" | "quantity">[];
  total: number;
  itbis: number;
  discountPercent?: number;
}): InvoiceDisplayTotals {
  const grossInclusive = round2(
    p.items.reduce(
      (s, it) => s + Math.max(0, it.unitPrice) * Math.max(0, it.quantity),
      0,
    ),
  );
  const discountInclusive = round2(Math.max(0, grossInclusive - p.total));
  return {
    grossInclusive,
    discountInclusive,
    discountPercent: p.discountPercent,
    itbisIncluded: round2(p.itbis),
    baseWithoutItbis: round2(p.total - p.itbis),
    total: round2(p.total),
  };
}
