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

  // ── Ronda de corrección 1: números mal en silencio ──────────────────────

  it("una proforma con el estado extendido 'voided' se marca anulada, no solo 'cancelled'", () => {
    // El CHECK real de la columna (0003_dgii_pos.sql) admite 'voided' además
    // de 'cancelled'; no está en el union TS `ProformaStatus`. Mismo criterio
    // que `isExcludedStatus` de features/customers/customer-purchases.ts.
    const v = desdeProforma({
      id: "p-2", number: "PRO-002", createdAt: "2026-09-01T10:00:00Z",
      customerName: "Ana", total: 100, itbis: 0, subtotal: 100, status: "voided",
    } as never);
    expect(v.anulada).toBe(true);
  });

  it("una factura de Alegra en borrador no cuenta, igual que una anulada", () => {
    // Mismo criterio que `cuentaParaTotales` de features/alegra/sales-report.ts:
    // status !== 'void' && status !== 'draft'. Aquí 'anulada' es el único
    // flag de exclusión del modelo unificado, así que cubre los dos casos.
    const v = desdeFacturaAlegra({ id: "a-2", ncf: "B02", date: "2026-08-01", total: 500, status: "draft" } as never);
    expect(v.anulada).toBe(true);
  });

  it("el vendedor de una proforma es sellerName, no cashierName: son roles distintos", () => {
    // cashierName es quien cobra (en el POS está fijo en el código,
    // "Rosa Peralta"); sellerName es el vendedor responsable, base de
    // incentivos. Usar cashierName mostraría el mismo nombre en el 100% de
    // las ventas del sistema.
    const v = desdeProforma({
      id: "p-3", number: "PRO-003", createdAt: "2026-09-01T10:00:00Z",
      customerName: "Ana", total: 100, itbis: 0, subtotal: 100, status: "issued",
      sellerName: "Marcos Vendedor", cashierName: "Rosa Peralta",
    } as never);
    expect(v.vendedor).toBe("Marcos Vendedor");
  });

  it("un pago mixto (dos métodos) no se le atribuye a uno solo: se marca 'mixed'", () => {
    // Mitad efectivo, mitad tarjeta: antes se le colgaba el 100% del total
    // al primer método. Mismo criterio que `saleMethodSummary`
    // (features/sales/sales-report.ts).
    const v = desdeProforma({
      id: "p-4", number: "PRO-004", createdAt: "2026-09-01T10:00:00Z",
      customerName: "Ana", total: 200, itbis: 0, subtotal: 200, status: "paid",
      payments: [
        { method: "cash", amount: 100 },
        { method: "card", amount: 100 },
      ],
    } as never);
    expect(v.formaPago).toBe("mixed");
  });

  it("con un solo método de pago, formaPago sigue siendo ese método", () => {
    const v = desdeProforma({
      id: "p-5", number: "PRO-005", createdAt: "2026-09-01T10:00:00Z",
      customerName: "Ana", total: 100, itbis: 0, subtotal: 100, status: "paid",
      payments: [{ method: "cash", amount: 100 }],
    } as never);
    expect(v.formaPago).toBe("cash");
  });
});
