import { describe, it, expect } from "vitest";
import {
  cuentaParaTotales,
  diasDesde,
  productosVendidos,
  saldosPorCliente,
  totalesDeVentas,
  ventasPorDia,
  ventasPorMetodo,
  ventasPorVendedor,
  type AlegraInvoiceLineRow,
  type AlegraInvoiceRow,
} from "./sales-report";

const inv = (over: Partial<AlegraInvoiceRow>): AlegraInvoiceRow => ({
  id: "i1",
  ncf: "B0200000001",
  date: "2026-09-01",
  status: "closed",
  clientId: "c1",
  clientName: "Ana",
  branchId: "b1",
  sellerName: "Desteny",
  paymentMethod: "cash",
  subtotal: 100,
  itbis: 18,
  total: 118,
  totalPaid: 118,
  balance: 0,
  ...over,
});

describe("totalesDeVentas", () => {
  it("suma solo lo que cuenta y reporta las anuladas aparte", () => {
    const t = totalesDeVentas([
      inv({ id: "a" }),
      inv({ id: "b", subtotal: 200, itbis: 36, total: 236, totalPaid: 100, balance: 136 }),
      inv({ id: "c", status: "void", total: 999 }),
      inv({ id: "d", status: "draft", total: 500 }),
    ]);
    expect(t).toEqual({
      facturas: 2,
      anuladas: 1,
      subtotal: 300,
      itbis: 54,
      total: 354,
      cobrado: 218,
      saldo: 136,
    });
  });

  it("una lista vacía da ceros, no NaN", () => {
    expect(totalesDeVentas([])).toEqual({
      facturas: 0,
      anuladas: 0,
      subtotal: 0,
      itbis: 0,
      total: 0,
      cobrado: 0,
      saldo: 0,
    });
  });

  it("las anuladas y los borradores no cuentan", () => {
    expect(cuentaParaTotales({ status: "closed" })).toBe(true);
    expect(cuentaParaTotales({ status: "open" })).toBe(true);
    expect(cuentaParaTotales({ status: "void" })).toBe(false);
    expect(cuentaParaTotales({ status: "draft" })).toBe(false);
  });
});

describe("agrupaciones", () => {
  const datos = [
    inv({ id: "a", date: "2026-09-01", sellerName: "Desteny", paymentMethod: "cash", total: 100 }),
    inv({ id: "b", date: "2026-09-02", sellerName: "Desteny", paymentMethod: "credit-card", total: 300 }),
    inv({ id: "c", date: "2026-09-02", sellerName: null, paymentMethod: null, total: 50 }),
    inv({ id: "d", date: "2026-09-02", status: "void", total: 9999 }),
  ];

  it("por día, del más reciente al más antiguo", () => {
    expect(ventasPorDia(datos)).toEqual([
      { clave: "2026-09-02", etiqueta: "2026-09-02", facturas: 2, total: 350 },
      { clave: "2026-09-01", etiqueta: "2026-09-01", facturas: 1, total: 100 },
    ]);
  });

  it("por vendedor, de mayor a menor, con etiqueta para los que no tienen", () => {
    const v = ventasPorVendedor(datos);
    expect(v[0]).toMatchObject({ etiqueta: "Desteny", facturas: 2, total: 400 });
    expect(v[1]).toMatchObject({ etiqueta: "Sin vendedor", facturas: 1, total: 50 });
  });

  it("por forma de pago, con los nombres en cristiano", () => {
    const m = ventasPorMetodo(datos);
    expect(m.map((x) => x.etiqueta)).toEqual(["Tarjeta de crédito", "Efectivo", "Sin método"]);
    expect(m[0]!.total).toBe(300);
  });
});

describe("productosVendidos", () => {
  const linea = (over: Partial<AlegraInvoiceLineRow>): AlegraInvoiceLineRow => ({
    invoiceId: "a",
    productId: "p1",
    name: "Crema",
    quantity: 1,
    total: 100,
    ...over,
  });

  it("suma unidades y total por producto, de mayor a menor", () => {
    const r = productosVendidos(
      [inv({ id: "a" }), inv({ id: "b" })],
      [
        linea({ invoiceId: "a", productId: "p1", quantity: 2, total: 200 }),
        linea({ invoiceId: "b", productId: "p1", quantity: 1, total: 100 }),
        linea({ invoiceId: "b", productId: "p2", name: "Serum", quantity: 5, total: 500 }),
      ],
    );
    expect(r[0]).toEqual({ productId: "p2", name: "Serum", unidades: 5, total: 500 });
    expect(r[1]).toEqual({ productId: "p1", name: "Crema", unidades: 3, total: 300 });
  });

  it("una línea de factura anulada NO es una venta", () => {
    const r = productosVendidos(
      [inv({ id: "a", status: "void" })],
      [linea({ invoiceId: "a", quantity: 9, total: 900 })],
    );
    expect(r).toEqual([]);
  });

  it("agrupa por nombre las líneas sin producto enlazado y respeta el límite", () => {
    const r = productosVendidos(
      [inv({ id: "a" })],
      [
        linea({ productId: null, name: "DELIVERY", quantity: 1, total: 175 }),
        linea({ productId: null, name: "DELIVERY", quantity: 1, total: 175 }),
        linea({ productId: "p9", name: "Otro", quantity: 1, total: 10 }),
      ],
      1,
    );
    expect(r).toEqual([{ productId: null, name: "DELIVERY", unidades: 2, total: 350 }]);
  });
});

describe("saldosPorCliente", () => {
  it("agrupa lo pendiente por cliente, de mayor a menor, y guarda la factura más antigua", () => {
    const r = saldosPorCliente([
      inv({ id: "a", clientId: "c1", clientName: "Ana", date: "2026-08-01", balance: 500 }),
      inv({ id: "b", clientId: "c1", clientName: "Ana", date: "2026-07-01", balance: 200 }),
      inv({ id: "c", clientId: "c2", clientName: "Luis", date: "2026-09-01", balance: 900 }),
      inv({ id: "d", clientId: "c3", clientName: "Sin deuda", balance: 0 }),
      inv({ id: "e", clientId: "c4", clientName: "Anulada", status: "void", balance: 1000 }),
    ]);
    expect(r).toEqual([
      { clientId: "c2", clientName: "Luis", facturas: 1, saldo: 900, masAntigua: "2026-09-01" },
      { clientId: "c1", clientName: "Ana", facturas: 2, saldo: 700, masAntigua: "2026-07-01" },
    ]);
  });

  it("una factura sin cliente enlazado se agrupa por su nombre", () => {
    const r = saldosPorCliente([inv({ clientId: null, clientName: "Ana Artiles", balance: 100 })]);
    expect(r[0]).toMatchObject({ clientId: null, clientName: "Ana Artiles", saldo: 100 });
  });
});

describe("diasDesde", () => {
  it("cuenta los días y nunca da negativo", () => {
    expect(diasDesde("2026-09-01", "2026-09-05")).toBe(4);
    expect(diasDesde("2026-09-05", "2026-09-05")).toBe(0);
    expect(diasDesde("2026-09-10", "2026-09-05")).toBe(0);
    expect(diasDesde("no-es-fecha", "2026-09-05")).toBe(0);
  });
});
