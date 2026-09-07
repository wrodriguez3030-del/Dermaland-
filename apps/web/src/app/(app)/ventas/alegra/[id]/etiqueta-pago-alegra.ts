/**
 * `payment_method` crudo de `alegra_invoices` → texto en español para la
 * línea «Pago:» de la página «ver» de una factura migrada. Distinto del
 * `PaymentMethod` de DermaLand (`METODO_PAGO_ALEGRA` en
 * `proforma-desde-alegra.ts`): aquí SÍ hace falta distinguir tarjeta de
 * crédito de débito, y dejar claro que una venta a crédito no es un pago
 * cobrado. Función aparte (no un export más de `page.tsx`): Next.js exige
 * que un `page.tsx` solo exporte los campos reservados de una Page.
 */
const ETIQUETA_PAGO_ALEGRA: Readonly<Record<string, string>> = {
  cash: "efectivo",
  "credit-card": "tarjeta de crédito",
  "debit-card": "tarjeta de débito",
  "credit-sell": "a crédito (cuenta por cobrar)",
};

/** `null` o cualquier valor no reconocido → "no registrado en Alegra". */
export function etiquetaPagoAlegra(paymentMethod: string | null): string {
  if (!paymentMethod) return "no registrado en Alegra";
  return ETIQUETA_PAGO_ALEGRA[paymentMethod] ?? "no registrado en Alegra";
}
