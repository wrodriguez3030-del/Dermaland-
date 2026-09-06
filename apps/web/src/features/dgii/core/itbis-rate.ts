/**
 * v657 — La tasa de ITBIS viaja por el sistema en DOS unidades: la venta la guarda como
 * DECIMAL (`sale_line_items.tax_rate` Decimal(5,4): 0.18) y el módulo DGII la espera en
 * PORCENTAJE (`itbisRate: 18`, y el constructor solo admite 0, 16 o 18). Esta es la única
 * conversión entre ambas: la usan la factura de venta y la nota de crédito.
 */
export function itbisPercentFromDecimal(rate: number | string | null | undefined): number {
  const n = typeof rate === "string" ? Number(rate) : rate ?? 0;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100 * 100) / 100;
}
