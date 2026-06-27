import { describe, expect, it } from "vitest";
import type { Proforma } from "@/types";
import {
  classifySaleDocument,
  documentRouteBase,
  isInvoiceDocument,
  isProformaDocument,
  saleDocumentLabel,
} from "./document-label";

type Doc = Pick<Proforma, "documentKind" | "ecfType" | "ecfNumber">;

const ncfConsumo: Doc = { documentKind: "invoice", ecfNumber: "B02000001240" };
const ncfCredito: Doc = { documentKind: "invoice", ecfNumber: "B01000000320" };
const ecf32: Doc = { documentKind: "invoice", ecfType: "32", ecfNumber: "E320000000095" };
const ecf31: Doc = { documentKind: "invoice", ecfType: "31", ecfNumber: "E310000000040" };
const proforma: Doc = { documentKind: "proforma" };

describe("classifySaleDocument", () => {
  it("invoice sin ecfType → ncf", () => {
    expect(classifySaleDocument(ncfConsumo)).toBe("ncf");
    expect(classifySaleDocument(ncfCredito)).toBe("ncf");
  });
  it("invoice con ecfType → ecf", () => {
    expect(classifySaleDocument(ecf32)).toBe("ecf");
    expect(classifySaleDocument(ecf31)).toBe("ecf");
  });
  it("proforma → proforma", () => {
    expect(classifySaleDocument(proforma)).toBe("proforma");
    expect(classifySaleDocument({ documentKind: undefined })).toBe("proforma");
  });
});

describe("isProformaDocument / isInvoiceDocument", () => {
  it("NCF B02 NO es proforma, es factura", () => {
    expect(isProformaDocument(ncfConsumo)).toBe(false);
    expect(isInvoiceDocument(ncfConsumo)).toBe(true);
  });
  it("Proforma es proforma, no factura", () => {
    expect(isProformaDocument(proforma)).toBe(true);
    expect(isInvoiceDocument(proforma)).toBe(false);
  });
});

describe("documentRouteBase — factura nunca va a ruta de proforma", () => {
  it("factura NCF B02 → /ventas", () => {
    expect(documentRouteBase(ncfConsumo)).toBe("/ventas");
  });
  it("factura NCF B01 → /ventas", () => {
    expect(documentRouteBase(ncfCredito)).toBe("/ventas");
  });
  it("e-CF E32/E31 → /ventas", () => {
    expect(documentRouteBase(ecf32)).toBe("/ventas");
    expect(documentRouteBase(ecf31)).toBe("/ventas");
  });
  it("proforma → /proformas", () => {
    expect(documentRouteBase(proforma)).toBe("/proformas");
  });
});

describe("saleDocumentLabel", () => {
  it("etiqueta NCF por prefijo", () => {
    expect(saleDocumentLabel(ncfConsumo)).toBe("Factura de consumo (B02)");
    expect(saleDocumentLabel(ncfCredito)).toBe("Crédito fiscal (B01)");
  });
  it("etiqueta e-CF por tipo", () => {
    expect(saleDocumentLabel(ecf32)).toMatch(/E32/);
    expect(saleDocumentLabel(ecf31)).toMatch(/E31/);
  });
  it("proforma", () => {
    expect(saleDocumentLabel(proforma)).toBe("Proforma");
  });
});
