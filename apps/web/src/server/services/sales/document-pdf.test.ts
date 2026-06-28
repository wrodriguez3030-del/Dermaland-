import { describe, it, expect } from "vitest";
import { generateSaleDocumentPdf } from "./document-pdf";
import type { Business, Proforma } from "@/types";

/**
 * Tests del generador de PDF de documentos de venta (proforma / NCF / e-CF demo).
 *
 * pdfkit comprime los content streams, así que el texto renderizado NO aparece
 * como ASCII; verificamos estructura (%PDF-/%%EOF), metadata (Title/Author/Subject
 * con comprobante, razón social y tipo) y que no se filtren UUIDs técnicos.
 */

const business: Business = {
  id: "biz_dermaland",
  legalName: "DermaLand SRL",
  commercialName: "DermaLand",
  rnc: "1-32-59077-5",
  country: "República Dominicana",
  phone: "+1 809-226-5252",
  whatsapp: "+1 809-226-5252",
  instagramUrl: "https://www.instagram.com/dermalandrd",
  address: "Calle E. León Jiménez No. 47",
  city: "Santiago",
  slogan: "Venta de Productos Dermatológicos",
  logoUrl: "/brand/dermaland-logo.svg",
  dgiiEnabled: false,
  planId: "plan_business",
  status: "active",
  createdAt: "2026-05-04T14:00:00Z",
  updatedAt: "2026-05-04T14:00:00Z",
};

function makeProforma(over: Partial<Proforma> = {}): Proforma {
  return {
    id: "prof_test_1",
    number: "PROF-2026-00001",
    customerName: "María Pérez",
    customerPhone: "+1 809-555-0101",
    customerDocument: "001-1234567-8",
    cashierId: "11111111-1111-1111-1111-111111111111",
    cashierName: "Rosa Peralta",
    branchId: "22222222-2222-2222-2222-222222222222",
    items: [
      {
        productId: "33333333-3333-3333-3333-333333333333",
        productSku: "ADE-500",
        productName: "A-derma Crema de Ducha Hidratante 500 ML",
        lotNumber: "L-2026-07",
        quantity: 2,
        unitPrice: 500,
        itbisRate: 0.18,
        discount: 0,
        subtotal: 1000,
        itbis: 180,
        total: 1180,
      },
    ],
    subtotal: 1000,
    discount: 0,
    itbis: 180,
    total: 1180,
    status: "paid",
    payments: [
      { id: "pay_1", proformaId: "prof_test_1", method: "card", amount: 1180, last4: "4242", userId: "u", userName: "Rosa", createdAt: "2026-06-16T18:00:00Z" },
    ],
    paid: 1180,
    balance: 0,
    createdAt: "2026-06-16T18:00:00Z",
    updatedAt: "2026-06-16T18:00:00Z",
    ...over,
  } as Proforma;
}

describe("generateSaleDocumentPdf — estructura", () => {
  it("retorna un Buffer PDF válido (%PDF- … %%EOF)", async () => {
    const buf = await generateSaleDocumentPdf(makeProforma(), business);
    expect(buf.byteLength).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buf.subarray(buf.byteLength - 32).toString("ascii")).toContain("%%EOF");
  });

  it("la metadata incluye el comprobante y la razón social del emisor", async () => {
    const buf = await generateSaleDocumentPdf(
      makeProforma({ documentKind: "invoice", ecfType: undefined, number: "B0200000123" }),
      business,
    );
    const ascii = buf.toString("latin1");
    expect(ascii).toContain("B0200000123");
    expect(ascii).toContain("DermaLand SRL");
  });

  it("NO filtra UUIDs técnicos (productId / branchId) en el PDF", async () => {
    const buf = await generateSaleDocumentPdf(makeProforma(), business);
    const ascii = buf.toString("latin1");
    expect(ascii).not.toContain("33333333-3333-3333-3333-333333333333");
    expect(ascii).not.toContain("22222222-2222-2222-2222-222222222222");
    expect(ascii).not.toContain("prof_test_1");
  });
});

describe("generateSaleDocumentPdf — tipos de documento", () => {
  it("proforma: Subject/Title = PROFORMA", async () => {
    const buf = await generateSaleDocumentPdf(makeProforma(), business);
    expect(buf.toString("latin1")).toContain("PROFORMA");
  });

  it("factura NCF de consumo: Subject = FACTURA DE CONSUMO", async () => {
    const buf = await generateSaleDocumentPdf(
      makeProforma({ documentKind: "invoice", ecfType: undefined }),
      business,
    );
    expect(buf.toString("latin1")).toContain("FACTURA DE CONSUMO");
  });

  it("e-CF demo (32): genera PDF válido con e-NCF en metadata", async () => {
    const buf = await generateSaleDocumentPdf(
      makeProforma({ documentKind: "invoice", ecfType: "32", ecfNumber: "E320000001" }),
      business,
    );
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buf.toString("latin1")).toContain("E320000001");
  });

  it("genera PDFs distintos para documentos distintos", async () => {
    const a = await generateSaleDocumentPdf(makeProforma(), business);
    const b = await generateSaleDocumentPdf(
      makeProforma({ number: "PROF-2026-00002" }),
      business,
    );
    expect(a.toString("latin1")).not.toBe(b.toString("latin1"));
  });
});
