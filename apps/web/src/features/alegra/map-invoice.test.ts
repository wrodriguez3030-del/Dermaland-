import { describe, it, expect } from "vitest";
import factura from "./__fixtures__/invoice-b02.json";
import { invoiceToRows, issuedAtFrom } from "./map-invoice";
import type { AlegraInvoice } from "./types";

const base = factura as AlegraInvoice;

describe("invoiceToRows", () => {
  it("cabecera: NCF, prefijo, cliente con cédula, almacén, montos, pagos tal cual y raw sin items", () => {
    const { invoice, items } = invoiceToRows(base);
    expect(invoice).toMatchObject({
      alegra_id: "14970",
      ncf: "B0200014482",
      ncf_prefix: "B02",
      date: "2026-09-05",
      issued_at: "2026-09-05T12:50:18-04:00",
      status: "closed",
      alegra_client_id: "6529",
      client_name: "Cliente Prueba",
      client_document: "40200000002",
      client_document_type: "cedula",
      warehouse_id: "2",
      payment_method: "cash",
      seller_name: "VENDEDORA",
      station: "VILLA OLGA",
      subtotal: 4233.05,
      itbis: 761.95,
      total: 4995,
      total_paid: 4995,
      balance: 0,
    });
    expect(invoice.payments).toHaveLength(1);
    expect(invoice.raw).not.toHaveProperty("items");
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      line_no: 1,
      alegra_item_id: "1095",
      name: "GLISODIN SKIN BRIGHTENING 60 CAPSULAS",
      quantity: 1,
      unit_price: 2911.02,
      discount: 0,
      itbis: 523.98,
      total: 3435,
    });
  });

  it("RNC → rnc; sin cliente → nulos; sin numberTemplate → ncf null; sin datetime → issued_at null", () => {
    const { invoice } = invoiceToRows({
      ...base,
      client: { id: "1", name: "Empresa", identification: "130984395", identificationType: "RNC" },
      numberTemplate: null,
      datetime: undefined,
    });
    expect(invoice).toMatchObject({ client_document_type: "rnc", ncf: null, ncf_prefix: null, issued_at: null });
    expect(invoiceToRows({ ...base, client: null }).invoice.alegra_client_id).toBeNull();
    expect(invoiceToRows({ ...base, client: null }).invoice.client_name).toBeNull();
  });

  it("una factura anulada conserva sus montos y su estado", () => {
    const { invoice } = invoiceToRows({ ...base, status: "void", balance: 4995, totalPaid: 0 });
    expect(invoice).toMatchObject({ status: "void", balance: 4995, total_paid: 0 });
  });

  it("suma el ITBIS de varias líneas de impuesto y redondea a dos decimales", () => {
    const { items } = invoiceToRows({
      ...base,
      items: [{ id: "9", name: "X", price: 100, quantity: 2, tax: [{ amount: 9.001 }, { amount: 8.999 }], total: 218 }],
    });
    expect(items[0]).toMatchObject({ itbis: 18, quantity: 2, unit_price: 100, total: 218 });
  });

  it("sin almacén ni vendedor no falla", () => {
    const { invoice } = invoiceToRows({ ...base, warehouse: null, seller: null, station: undefined, paymentMethod: null });
    expect(invoice).toMatchObject({ warehouse_id: null, seller_name: null, station: null, payment_method: null });
  });
});

describe("issuedAtFrom", () => {
  it("convierte la hora dominicana de Alegra a ISO con -04:00 y rechaza formatos raros", () => {
    expect(issuedAtFrom("2026-09-05 12:50:18")).toBe("2026-09-05T12:50:18-04:00");
    expect(issuedAtFrom(undefined)).toBeNull();
    expect(issuedAtFrom("2026-09-05")).toBeNull();
  });
});
