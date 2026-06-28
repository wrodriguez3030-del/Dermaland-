import { describe, it, expect } from "vitest";
import type { Proforma } from "@/types";
import { getDocumentPrintContext } from "./document-print-context";

function make(over: Partial<Proforma> = {}): Proforma {
  return {
    id: "p1",
    number: "PROF-2026-00001",
    customerName: "María Pérez",
    cashierId: "u1",
    cashierName: "Rosa",
    branchId: "b1",
    items: [],
    subtotal: 1000,
    discount: 0,
    itbis: 180,
    total: 1180,
    status: "paid",
    payments: [],
    paid: 1180,
    balance: 0,
    createdAt: "2026-06-16T18:00:00Z",
    updatedAt: "2026-06-16T18:00:00Z",
    ...over,
  } as Proforma;
}

const ncfB02 = make({ documentKind: "invoice", ecfNumber: "B0200001244" });
const ncfB01 = make({
  documentKind: "invoice",
  ecfNumber: "B0100000320",
  sequenceType: "credito_fiscal",
});
const ecf32 = make({ documentKind: "invoice", ecfType: "32", ecfNumber: "E320000001" });
const proforma = make({ documentKind: "proforma" });

describe("getDocumentPrintContext — NCF tradicional", () => {
  it("clasifica como NCF y muestra solo datos NCF", () => {
    const ctx = getDocumentPrintContext(ncfB02);
    expect(ctx.isNcf).toBe(true);
    expect(ctx.isEcf).toBe(false);
    expect(ctx.isProforma).toBe(false);
    expect(ctx.showNcf).toBe(true);
    expect(ctx.numberLabel).toBe("NCF");
    expect(ctx.fiscalNumber).toBe("B0200001244");
  });

  it("NCF NO muestra ningún dato e-CF", () => {
    const ctx = getDocumentPrintContext(ncfB02);
    expect(ctx.showEcf).toBe(false);
    expect(ctx.showDgiiValidation).toBe(false);
    expect(ctx.showSecurityCode).toBe(false);
    expect(ctx.showDigitalSignature).toBe(false);
    expect(ctx.showDeferredNote).toBe(false);
  });

  it("NCF B01 también es NCF (crédito fiscal)", () => {
    const ctx = getDocumentPrintContext(ncfB01);
    expect(ctx.isNcf).toBe(true);
    expect(ctx.numberLabel).toBe("NCF");
    expect(ctx.fiscalNumber).toBe("B0100000320");
    expect(ctx.showEcf).toBe(false);
  });

  it("NCF demo muestra la nota de ambiente demo", () => {
    expect(getDocumentPrintContext(ncfB02).showFiscalDemoNote).toBe(true);
  });
});

describe("getDocumentPrintContext — e-CF", () => {
  it("e-CF muestra e-NCF y todos los datos electrónicos", () => {
    const ctx = getDocumentPrintContext(ecf32);
    expect(ctx.isEcf).toBe(true);
    expect(ctx.showEcf).toBe(true);
    expect(ctx.numberLabel).toBe("e-NCF");
    expect(ctx.fiscalNumber).toBe("E320000001");
    expect(ctx.showDgiiValidation).toBe(true);
    expect(ctx.showSecurityCode).toBe(true);
    expect(ctx.showDigitalSignature).toBe(true);
    expect(ctx.showDeferredNote).toBe(true);
    expect(ctx.showNcf).toBe(false);
  });
});

describe("getDocumentPrintContext — proforma", () => {
  it("proforma no muestra NADA fiscal", () => {
    const ctx = getDocumentPrintContext(proforma);
    expect(ctx.isProforma).toBe(true);
    expect(ctx.showNcf).toBe(false);
    expect(ctx.showEcf).toBe(false);
    expect(ctx.showDgiiValidation).toBe(false);
    expect(ctx.showSecurityCode).toBe(false);
    expect(ctx.showDigitalSignature).toBe(false);
    expect(ctx.showDeferredNote).toBe(false);
    expect(ctx.showFiscalDemoNote).toBe(false);
    expect(ctx.numberLabel).toBe("No.");
    expect(ctx.fiscalNumber).toBeNull();
  });
});
