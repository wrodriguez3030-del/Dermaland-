import { describe, it, expect } from "vitest";
import { resolveDocumentToIssue } from "./document-resolver";
import type { PaymentMethod } from "@/types";

describe("resolveDocumentToIssue", () => {
  describe("consumo (walk-in o cliente con default consumo)", () => {
    it("efectivo → Proforma", () => {
      const r = resolveDocumentToIssue({
        billingType: "consumo",
        paymentMethod: "cash",
      });
      expect(r.documentKind).toBe("proforma");
      expect(r.ecfType).toBeNull();
      expect(r.sequenceType).toBeNull();
      expect(r.label).toBe("Proforma");
      expect(r.buttonLabel).toBe("Cobrar y emitir proforma");
    });

    it("transferencia → Proforma", () => {
      const r = resolveDocumentToIssue({
        billingType: "consumo",
        paymentMethod: "transfer",
      });
      expect(r.documentKind).toBe("proforma");
      expect(r.ecfType).toBeNull();
    });

    it("tarjeta → Factura e-CF 32 (Consumo)", () => {
      const r = resolveDocumentToIssue({
        billingType: "consumo",
        paymentMethod: "card",
      });
      expect(r.documentKind).toBe("invoice");
      expect(r.ecfType).toBe("32");
      expect(r.sequenceType).toBe("consumo");
      expect(r.label).toContain("Consumo");
      expect(r.buttonLabel).toBe("Cobrar y emitir factura");
    });

    it.each<PaymentMethod>(["azul", "cardnet", "visanet"])(
      "%s → Factura e-CF 32 (procesadores locales = card-like)",
      (pm) => {
        const r = resolveDocumentToIssue({
          billingType: "consumo",
          paymentMethod: pm,
        });
        expect(r.documentKind).toBe("invoice");
        expect(r.ecfType).toBe("32");
      },
    );

    it.each<PaymentMethod>(["paypal", "manual", "other"])(
      "%s → Proforma (no genera e-CF automático)",
      (pm) => {
        const r = resolveDocumentToIssue({
          billingType: "consumo",
          paymentMethod: pm,
        });
        expect(r.documentKind).toBe("proforma");
        expect(r.ecfType).toBeNull();
      },
    );

    it("paymentMethod=null → Proforma placeholder", () => {
      const r = resolveDocumentToIssue({
        billingType: "consumo",
        paymentMethod: null,
      });
      expect(r.documentKind).toBe("proforma");
      expect(r.label).toBe("Proforma");
    });
  });

  describe("credito_fiscal", () => {
    it.each<PaymentMethod | null>([
      "cash",
      "card",
      "transfer",
      "azul",
      "manual",
      null,
    ])(
      "con método %s → Factura e-CF 31 (Crédito Fiscal)",
      (pm) => {
        const r = resolveDocumentToIssue({
          billingType: "credito_fiscal",
          paymentMethod: pm,
        });
        expect(r.documentKind).toBe("invoice");
        expect(r.ecfType).toBe("31");
        expect(r.sequenceType).toBe("credito_fiscal");
        expect(r.label).toContain("Crédito Fiscal");
        expect(r.buttonLabel).toBe("Cobrar y emitir factura");
      },
    );
  });
});
