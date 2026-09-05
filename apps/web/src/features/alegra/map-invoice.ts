/**
 * Factura de Alegra → fila de `alegra_invoices` + sus líneas. PURO.
 *
 * Estas facturas son HISTORIAL de Alegra: viven en sus propias tablas y NO se
 * mezclan con proformas ni con el POS (decisión 2 de la spec). Una factura
 * anulada (`void`) conserva su fila; nada se borra.
 */
import { documentOf, type DocumentType } from "./map-contact";
import type { AlegraInvoice } from "./types";

export interface InvoiceRow {
  alegra_id: string;
  alegra_client_id: string | null;
  client_name: string | null;
  client_document: string | null;
  client_document_type: DocumentType | null;
  ncf: string | null;
  ncf_prefix: string | null;
  date: string;
  issued_at: string | null;
  status: AlegraInvoice["status"];
  payment_method: string | null;
  seller_name: string | null;
  station: string | null;
  /** Id del almacén de Alegra ("1"/"2"); el llamador lo traduce a `branch_id`. */
  warehouse_id: string | null;
  subtotal: number;
  discount: number;
  itbis: number;
  total: number;
  total_paid: number;
  balance: number;
  payments: unknown[];
  /** La factura tal cual vino, sin las líneas (van en su propia tabla). */
  raw: Record<string, unknown>;
}

export interface InvoiceItemRow {
  line_no: number;
  alegra_item_id: string | null;
  name: string;
  quantity: number;
  /** SIN ITBIS, como lo da Alegra. */
  unit_price: number;
  discount: number;
  itbis: number;
  total: number;
}

const r2 = (n: unknown): number => Math.round((Number(n) || 0) * 100) / 100;

/** "2026-09-05 12:50:18" (hora de República Dominicana) → ISO con -04:00. */
export function issuedAtFrom(datetime: string | undefined): string | null {
  const m = (datetime ?? "").match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/);
  return m ? `${m[1]}T${m[2]}-04:00` : null;
}

export function invoiceToRows(inv: AlegraInvoice): { invoice: InvoiceRow; items: InvoiceItemRow[] } {
  const { items: lineas, ...resto } = inv;
  const doc = inv.client
    ? documentOf({ identification: inv.client.identification ?? null, identificationObject: null })
    : { type: null, number: null };

  const invoice: InvoiceRow = {
    alegra_id: String(inv.id),
    alegra_client_id: inv.client ? String(inv.client.id) : null,
    client_name: inv.client?.name?.trim() || null,
    client_document: doc.number,
    client_document_type: doc.type,
    ncf: inv.numberTemplate?.fullNumber || null,
    ncf_prefix: inv.numberTemplate?.prefix || null,
    date: inv.date,
    issued_at: issuedAtFrom(inv.datetime),
    status: inv.status,
    payment_method: inv.paymentMethod ?? null,
    seller_name: inv.seller?.name ?? null,
    station: inv.station?.name ?? null,
    warehouse_id: inv.warehouse ? String(inv.warehouse.id) : null,
    subtotal: r2(inv.subtotal),
    discount: r2(inv.discount),
    itbis: r2(inv.tax),
    total: r2(inv.total),
    total_paid: r2(inv.totalPaid),
    balance: r2(inv.balance),
    payments: inv.payments ?? [],
    raw: resto as unknown as Record<string, unknown>,
  };

  const items = (lineas ?? []).map(
    (l, i): InvoiceItemRow => ({
      line_no: i + 1,
      alegra_item_id: l.id ? String(l.id) : null,
      name: l.name,
      quantity: Number(l.quantity) || 0,
      unit_price: Number(l.price) || 0,
      discount: r2(l.discountAmount ?? 0),
      itbis: r2((l.tax ?? []).reduce((a, t) => a + (Number(t.amount) || 0), 0)),
      total: r2(l.total),
    }),
  );

  return { invoice, items };
}
