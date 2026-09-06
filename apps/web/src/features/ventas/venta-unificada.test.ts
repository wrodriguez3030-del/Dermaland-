import { describe, it, expect } from "vitest";
import { desdeProforma, desdeFacturaAlegra } from "./venta-unificada";

describe("modelo unificado de ventas", () => {
  it("una factura de Alegra nunca es editable: es historia, no una venta viva", () => {
    // Si fuera editable, alguien podría 'anular' desde DermaLand una factura
    // que en Alegra sigue viva, y los dos sistemas dejarían de cuadrar.
    const v = desdeFacturaAlegra({
      id: "a-1", ncf: "B0100000001", date: "2026-08-01", client_name: "Ana",
      client_id: "c-1", total: 1180, itbis: 180, subtotal: 1000,
      payment_method: "efectivo", seller_name: "María", branch_id: "s-1", status: "closed",
    } as never);
    expect(v.editable).toBe(false);
    expect(v.origen).toBe("alegra");
  });

  it("el número visible de una factura de Alegra es su NCF", () => {
    const v = desdeFacturaAlegra({ id: "a-1", ncf: "B0100000001", date: "2026-08-01", total: 0 } as never);
    expect(v.numero).toBe("B0100000001");
  });

  it("una factura anulada de Alegra se marca anulada", () => {
    const v = desdeFacturaAlegra({ id: "a-1", ncf: "B01", date: "2026-08-01", total: 100, status: "void" } as never);
    expect(v.anulada).toBe(true);
  });

  it("una proforma del sistema sí es editable y se marca como propia", () => {
    const v = desdeProforma({
      id: "p-1", number: "PRO-001", createdAt: "2026-09-01T10:00:00Z",
      customerName: "Luis", customerId: "c-2", total: 590, itbis: 90, subtotal: 500,
      paymentMethod: "card", branchId: "s-1", status: "completed",
    } as never);
    expect(v.editable).toBe(true);
    expect(v.origen).toBe("sistema");
  });

  it("no se inventa un cliente cuando la factura no lo trae", () => {
    // 40 contactos de Alegra llegaron sin nombre; poner "Cliente" ahí
    // convertiría un dato ausente en uno falso.
    const v = desdeFacturaAlegra({ id: "a-1", ncf: "B01", date: "2026-08-01", total: 100 } as never);
    expect(v.clienteNombre).toBeNull();
    expect(v.clienteId).toBeNull();
  });

  it("los importes son números, no cadenas: PostgREST devuelve numeric como texto", () => {
    const v = desdeFacturaAlegra({ id: "a-1", ncf: "B01", date: "2026-08-01", total: "1180.00", itbis: "180.00", subtotal: "1000.00" } as never);
    expect(v.total).toBe(1180);
    expect(v.itbis).toBe(180);
    expect(typeof v.total).toBe("number");
  });
});
