import type { FacturaAlegraCompleta } from "@/server/services/alegra/factura-completa";

/**
 * `true` si la cabecera de la factura migrada no cuadra al centavo: mismo
 * criterio que `detalle-compra-migrada.tsx`, pero a nivel de cabecera en vez
 * de líneas.
 *
 * 🔴 La fórmula lleva el `discount` de la cabecera (`subtotal - discount +
 * itbis`), NO `subtotal + itbis` a secas: `subtotal` en `alegra_invoices` es
 * ANTES del descuento. Verificado contra las 14 730 facturas cerradas reales
 * (07/09): con `subtotal + itbis` desajustan 2654 —exactamente las que
 * tienen descuento, un falso positivo por factura descontada, no una
 * migración mal cuadrada—; con el descuento restado desajustan solo 36, que
 * sí son el arrastre real de la migración.
 */
export function hayDescuadreAlegra(
  factura: Pick<FacturaAlegraCompleta, "subtotal" | "discount" | "itbis" | "total">,
): boolean {
  const diff =
    factura.subtotal - factura.discount + factura.itbis - factura.total;
  // Redondeado a centavos ANTES de comparar: en punto flotante, una factura
  // real que cuadra exacto en un centavo (`0.01` decimal, la NUMERIC de
  // Postgres) puede llegar aquí como `0.010000000000047...` y disparar un
  // falso positivo con `> 0.01` sin este redondeo.
  return Math.abs(Math.round(diff * 100) / 100) > 0.01;
}
