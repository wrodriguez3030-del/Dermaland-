import type {
  Payment,
  PaymentMethod,
  Proforma,
  ProformaStatus,
  SaleItem,
} from "@/types";
import type {
  FacturaAlegraCompleta,
  LineaAlegra,
} from "@/server/services/alegra/factura-completa";

/**
 * Adaptador PURO: una factura migrada de Alegra (cabecera + líneas de
 * `alegra_invoices`/`alegra_invoice_items`, ya leída por
 * `facturaAlegraCompleta`) → la forma `Proforma` que ya sabe imprimir el
 * ticket 80mm (`Receipt80mm`) y calcular sus totales
 * (`invoiceDisplayTotals`).
 *
 * Sin I/O: no toca Supabase ni red, solo traduce forma — mismo patrón que los
 * mapeadores de `venta-unificada.ts`. Alegra manda; esto NUNCA se persiste en
 * `proformas` (regla de la casa).
 *
 * `documentKind: "invoice"` SIN `ecfType` es a propósito: son facturas NCF
 * tradicionales (B01/B02) del histórico, nunca e-CF. Ponerle `ecfType` haría
 * que `document-print-context.ts` las pintara como electrónicas, que es
 * falso.
 */

/**
 * `alegra_invoices.payment_method` real (verificado en producción, 07/09):
 * `null` (12 879), `credit-card` (1 199), `cash` (885), `debit-card` (6),
 * `credit-sell` (4). Solo los tres primeros son un PAGO de verdad:
 * `credit-sell` es venta a crédito (queda en cuentas por cobrar, no se cobró
 * nada), y `null`/cualquier valor no listado se traduce a "sin pagos" — ver
 * `pagosDesdeFactura`.
 */
export const METODO_PAGO_ALEGRA: Readonly<Record<string, PaymentMethod>> = {
  cash: "cash",
  "credit-card": "card",
  "debit-card": "card",
};

/** `itbis / (total - itbis)` redondeado a 2 decimales, o 0.18 si la línea no trae base gravable. */
function tasaItbis(l: LineaAlegra): number {
  const base = l.total - l.itbis;
  if (base <= 0) return 0.18;
  return Math.round((l.itbis / base) * 100) / 100;
}

/**
 * Línea de Alegra → `SaleItem`. `unitPrice` es ITBIS-INCLUIDO en `SaleItem`
 * (lo asumen `Receipt80mm` e `invoiceDisplayTotals`), pero el `unit_price` de
 * Alegra viene SIN ITBIS: se deriva del total de línea, que sí es inclusivo.
 */
function itemDesdeLinea(l: LineaAlegra): SaleItem {
  return {
    // Alegra no trae SKU en la línea migrada: no se inventa uno.
    productSku: "",
    // Algunas líneas migradas no traen producto vinculado: sin id que inventar.
    productId: l.productId ?? "",
    productName: l.name,
    quantity: l.quantity,
    unitPrice: l.quantity > 0 ? l.total / l.quantity : l.total,
    itbisRate: tasaItbis(l),
    discount: l.discount,
    subtotal: l.total - l.itbis,
    itbis: l.itbis,
    total: l.total,
  };
}

/**
 * Un solo pago por el total de la factura si `payment_method` es uno de los
 * tres que SÍ representan cobro; `[]` si es `credit-sell`, `null` o cualquier
 * valor no reconocido — no se inventa un pago que Alegra no registró.
 */
function pagosDesdeFactura(f: FacturaAlegraCompleta): Payment[] {
  const metodo = f.paymentMethod ? METODO_PAGO_ALEGRA[f.paymentMethod] : undefined;
  if (!metodo) return [];
  return [
    {
      id: f.id,
      proformaId: f.id,
      method: metodo,
      amount: f.total,
      // Alegra no distingue cajero de vendedor de plataforma: no hay un
      // `userId` de DermaLand para quien cobró.
      userId: "",
      userName: f.sellerName ?? "Alegra",
      createdAt: f.issuedAt ?? f.date,
    },
  ];
}

/**
 * `alegra_invoices.status` real (verificado en producción, 07/09): `closed`
 * (14 730, cobrada), `void` (223, anulada) y `open` (20, son las de cuentas
 * por cobrar: nada cobrado todavía). Cualquier valor no visto en producción
 * se trata como `closed` — mismo criterio que la redacción original de esta
 * regla ("el resto → pagada").
 */
function estadoYSaldo(
  f: FacturaAlegraCompleta,
): Pick<Proforma, "status" | "paid" | "balance"> {
  const status: ProformaStatus =
    f.status === "void" ? "cancelled" : f.status === "open" ? "issued" : "paid";
  if (status === "issued") return { status, paid: 0, balance: f.total };
  if (status === "cancelled") return { status, paid: 0, balance: 0 };
  return { status, paid: f.total, balance: 0 };
}

/**
 * Adapta una factura completa de Alegra a `Proforma`. `businessId` no viene
 * en `FacturaAlegraCompleta` (no es una columna de la factura, es el tenant
 * de quien la pide) — único parámetro que se añade a la firma del brief.
 */
export function proformaDesdeAlegra(
  f: FacturaAlegraCompleta,
  businessId: string,
): Proforma {
  const createdAt = f.issuedAt ?? f.date;
  const { status, paid, balance } = estadoYSaldo(f);
  const esCreditoFiscal = f.ncfPrefix === "B01";

  return {
    id: f.id,
    // El NCF debería venir siempre en una factura ya migrada; si faltara, no
    // se inventa un número.
    number: f.ncf ?? "",
    customerId: f.clientId ?? undefined,
    customerName: f.clientName || "Cliente sin nombre",
    // Alegra no distingue cajero de vendedor de plataforma: no hay un
    // `userId` de DermaLand para quien cobró.
    cashierId: "",
    cashierName: f.sellerName ?? "Alegra",
    items: f.lineas.map(itemDesdeLinea),
    subtotal: f.subtotal,
    discount: f.discount,
    itbis: f.itbis,
    total: f.total,
    status,
    payments: pagosDesdeFactura(f),
    paid,
    balance,
    discountAmount: f.discount,
    billingType: esCreditoFiscal ? "credito_fiscal" : "consumo",
    customerDocument: f.clientDocument ?? undefined,
    documentKind: "invoice",
    sequenceType: esCreditoFiscal ? "credito_fiscal" : "consumo",
    createdAt,
    // Alegra no trae una fecha de última actualización propia del histórico.
    updatedAt: createdAt,
    businessId,
    branchId: f.branchId ?? "",
  };
}
