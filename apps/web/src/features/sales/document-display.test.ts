import { describe, it, expect } from "vitest";
import { getDocumentDisplayInfo } from "./document-label";
import { invoiceDisplayTotals } from "./invoice-totals";

type Doc = Parameters<typeof getDocumentDisplayInfo>[0];

const b02: Doc = { documentKind: "invoice", ecfNumber: "B0200001247", number: "B0200001247" };
const b01: Doc = { documentKind: "invoice", ecfNumber: "B0100000320", number: "B0100000320" };
const e32: Doc = { documentKind: "invoice", ecfType: "32", ecfNumber: "E320000000095", number: "E320000000095" };
const e31: Doc = { documentKind: "invoice", ecfType: "31", ecfNumber: "E310000000010", number: "E310000000010" };
const prof: Doc = { documentKind: "proforma", number: "PROF-000045" };

describe("getDocumentDisplayInfo", () => {
  it("1-3. B02 = Factura de consumo (B02), NCF, sin e-CF ni banner demo", () => {
    const d = getDocumentDisplayInfo(b02);
    expect(d.title).toBe("FACTURA");
    expect(d.subtitle).toBe("Factura de consumo (B02)");
    expect(d.numberLabel).toBe("NCF");
    expect(d.isElectronic).toBe(false);
    expect(d.showDemoBanner).toBe(false);
    expect(d.subtitle).not.toMatch(/e-?CF/i);
  });

  it("4-5. B01 = Crédito fiscal (B01), sin e-CF", () => {
    const d = getDocumentDisplayInfo(b01);
    expect(d.subtitle).toBe("Crédito fiscal (B01)");
    expect(d.isElectronic).toBe(false);
    expect(d.showDemoBanner).toBe(false);
  });

  it("6-8. E32 = Factura electrónica (e-CF 32), e-NCF, banner demo en ambiente demo", () => {
    const d = getDocumentDisplayInfo(e32);
    expect(d.title).toBe("FACTURA ELECTRÓNICA");
    expect(d.subtitle).toBe("Factura de consumo electrónica (e-CF 32)");
    expect(d.numberLabel).toBe("e-NCF");
    expect(d.isElectronic).toBe(true);
    expect(d.showDemoBanner).toBe(true);
    expect(getDocumentDisplayInfo(e32, { isDemoEnv: false }).showDemoBanner).toBe(false);
  });

  it("E31 = Crédito fiscal electrónico (e-CF 31)", () => {
    expect(getDocumentDisplayInfo(e31).subtitle).toBe("Crédito fiscal electrónico (e-CF 31)");
  });

  it("9-10. Proforma no muestra NCF ni e-CF", () => {
    const d = getDocumentDisplayInfo(prof);
    expect(d.title).toBe("PROFORMA");
    expect(d.numberLabel).toBe("No.");
    expect(d.isElectronic).toBe(false);
    expect(d.subtitle).not.toMatch(/NCF|e-?CF/i);
  });
});

describe("invoiceDisplayTotals (precios ITBIS-incluidos)", () => {
  it("11-12. descuento global 30% cuadra con las líneas", () => {
    const t = invoiceDisplayTotals({
      items: [
        { unitPrice: 1990, quantity: 1 },
        { unitPrice: 1250, quantity: 1 },
      ],
      total: 2268,
      itbis: 345.97,
      discountPercent: 30,
    });
    expect(t.grossInclusive).toBe(3240);
    expect(t.discountInclusive).toBe(972);
    expect(t.itbisIncluded).toBe(345.97);
    expect(t.total).toBe(2268);
    // Coherencia: subtotal − descuento = total (17. sin diferencia > 0.01).
    expect(Math.abs(t.grossInclusive - t.discountInclusive - t.total)).toBeLessThanOrEqual(0.01);
  });

  it("sin descuento: subtotal = total, descuento 0", () => {
    const t = invoiceDisplayTotals({
      items: [{ unitPrice: 1990, quantity: 2 }],
      total: 3980,
      itbis: 607.12,
    });
    expect(t.grossInclusive).toBe(3980);
    expect(t.discountInclusive).toBe(0);
  });
});
