/**
 * Clientes que compraron un lote (para "Notificar clientes" en un recall).
 * La consulta cruda devuelve una fila por línea de venta; aquí se agrega por
 * cliente para contactarlo una sola vez.
 */

/** Fila cruda: una línea de venta del lote (item + proforma + cliente). */
export interface LotBuyerRow {
  customerId: string;
  customerName: string;
  phone: string;
  quantity: number;
  /** Fecha de la venta (ISO). */
  date: string;
  proformaNumber: string;
}

/** Cliente agregado: total comprado del lote + última compra. */
export interface LotBuyer {
  customerId: string;
  customerName: string;
  phone: string;
  totalQuantity: number;
  purchaseCount: number;
  lastPurchase: string;
}

export function aggregateLotBuyers(rows: LotBuyerRow[]): LotBuyer[] {
  const byCustomer = new Map<string, LotBuyer>();
  for (const r of rows) {
    const existing = byCustomer.get(r.customerId);
    if (existing) {
      existing.totalQuantity += r.quantity;
      existing.purchaseCount += 1;
      if (r.date > existing.lastPurchase) existing.lastPurchase = r.date;
      // Conserva un teléfono no vacío si aparece.
      if (!existing.phone && r.phone) existing.phone = r.phone;
    } else {
      byCustomer.set(r.customerId, {
        customerId: r.customerId,
        customerName: r.customerName,
        phone: r.phone,
        totalQuantity: r.quantity,
        purchaseCount: 1,
        lastPurchase: r.date,
      });
    }
  }
  return [...byCustomer.values()].sort((a, b) => b.totalQuantity - a.totalQuantity);
}
