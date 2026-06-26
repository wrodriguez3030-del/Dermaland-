import { describe, expect, it } from "vitest";
import { DEFAULT_BILLING_SETTINGS } from "./billing-settings-store";
import {
  resolveAutoBilling,
  summarizeBillingRules,
} from "./auto-billing-rules";

const settings = DEFAULT_BILLING_SETTINGS;

describe("resolveAutoBilling — tarjeta", () => {
  it("tarjeta + consumidor final → e-CF E32 inmediato", () => {
    const d = resolveAutoBilling({
      billingType: "consumo",
      paymentMethod: "card",
      settings,
    });
    expect(d.documentKind).toBe("ecf");
    expect(d.comprobanteType).toBe("E32");
    expect(d.timing).toBe("immediate");
    expect(d.pendingForClosing).toBe(false);
    expect(d.consumesFiscalSequence).toBe(true);
  });

  it("procesadores locales (azul/cardnet/visanet) cuentan como tarjeta", () => {
    for (const m of ["azul", "cardnet", "visanet"] as const) {
      const d = resolveAutoBilling({
        billingType: "consumo",
        paymentMethod: m,
        settings,
      });
      expect(d.timing).toBe("immediate");
      expect(d.comprobanteType).toBe("E32");
    }
  });
});

describe("resolveAutoBilling — crédito fiscal", () => {
  it("RNC siempre genera e-CF E31 inmediato sin importar el pago", () => {
    for (const m of ["cash", "card", "transfer"] as const) {
      const d = resolveAutoBilling({
        billingType: "credito_fiscal",
        paymentMethod: m,
        settings,
      });
      expect(d.comprobanteType).toBe("E31");
      expect(d.timing).toBe("immediate");
    }
  });
});

describe("resolveAutoBilling — efectivo / transferencia", () => {
  it("efectivo consumo → proforma pendiente para cierre", () => {
    const d = resolveAutoBilling({
      billingType: "consumo",
      paymentMethod: "cash",
      settings,
    });
    expect(d.documentKind).toBe("proforma");
    expect(d.timing).toBe("at_closing");
    expect(d.pendingForClosing).toBe(true);
    expect(d.consumesFiscalSequence).toBe(false);
  });

  it("transferencia consumo → proforma pendiente para cierre", () => {
    const d = resolveAutoBilling({
      billingType: "consumo",
      paymentMethod: "transfer",
      settings,
    });
    expect(d.pendingForClosing).toBe(true);
    expect(d.timing).toBe("at_closing");
  });
});

describe("resolveAutoBilling — pagos mixtos", () => {
  it("mixto con tarjeta → e-CF inmediato por la venta completa (no divide)", () => {
    const d = resolveAutoBilling({
      billingType: "consumo",
      payments: [
        { method: "cash", amount: 600 },
        { method: "card", amount: 400 },
      ],
      settings,
    });
    expect(d.documentKind).toBe("ecf");
    expect(d.timing).toBe("immediate");
    expect(d.pendingForClosing).toBe(false);
    expect(d.reason).toMatch(/no se divide/i);
  });

  it("mixto solo efectivo+transferencia → pendiente para cierre", () => {
    const d = resolveAutoBilling({
      billingType: "consumo",
      payments: [
        { method: "cash", amount: 600 },
        { method: "transfer", amount: 400 },
      ],
      settings,
    });
    expect(d.pendingForClosing).toBe(true);
  });
});

describe("resolveAutoBilling — modo NCF (no electrónico)", () => {
  it("billingMode ncf → tarjeta genera NCF B02 en vez de e-CF", () => {
    const ncfSettings = { ...settings, defaultBillingMode: "ncf" as const };
    const d = resolveAutoBilling({
      billingType: "consumo",
      paymentMethod: "card",
      settings: ncfSettings,
    });
    expect(d.documentKind).toBe("ncf");
    expect(d.comprobanteType).toBe("B02");
  });
});

describe("resolveAutoBilling — regla de tarjeta desactivada", () => {
  it("tarjeta con regla off → proforma (manual según permisos)", () => {
    const off = { ...settings, cardEcfImmediateEnabled: false };
    const d = resolveAutoBilling({
      billingType: "consumo",
      paymentMethod: "card",
      settings: off,
    });
    expect(d.documentKind).toBe("proforma");
  });
});

describe("summarizeBillingRules", () => {
  it("incluye proformas como regla siempre activa", () => {
    const rules = summarizeBillingRules(settings);
    const proforma = rules.find((r) => r.id === "proforma");
    expect(proforma?.enabled).toBe(true);
    expect(proforma?.badge).toBe("proforma");
  });
});
