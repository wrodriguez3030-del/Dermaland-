import { describe, expect, it } from "vitest";
import { DEFAULT_BILLING_SETTINGS } from "./billing-settings-store";
import {
  comprobanteToDocType,
  resolveAutoBilling,
  summarizeBillingRules,
} from "./auto-billing-rules";

const settings = DEFAULT_BILLING_SETTINGS;
const ncf = { ...DEFAULT_BILLING_SETTINGS, defaultBillingMode: "ncf" as const };
const ecf = { ...DEFAULT_BILLING_SETTINGS, defaultBillingMode: "ecf" as const };

describe("modo NCF tradicional — nunca Proforma ni e-CF automático", () => {
  it("consumidor final efectivo → B02 inmediato (no proforma, no pendiente)", () => {
    const d = resolveAutoBilling({
      billingType: "consumo",
      paymentMethod: "cash",
      settings: ncf,
    });
    expect(d.documentKind).toBe("ncf");
    expect(d.comprobanteType).toBe("B02");
    expect(d.timing).toBe("immediate");
    expect(d.pendingForClosing).toBe(false);
    expect(d.label).toMatch(/B02/);
  });

  it("consumidor final transferencia → B02 inmediato", () => {
    const d = resolveAutoBilling({
      billingType: "consumo",
      paymentMethod: "transfer",
      settings: ncf,
    });
    expect(d.comprobanteType).toBe("B02");
    expect(d.documentKind).toBe("ncf");
  });

  it("consumidor final tarjeta → B02 inmediato (no E32)", () => {
    const d = resolveAutoBilling({
      billingType: "consumo",
      paymentMethod: "card",
      settings: ncf,
    });
    expect(d.comprobanteType).toBe("B02");
    expect(d.comprobanteType).not.toBe("E32");
  });

  it("cliente con RNC → B01 inmediato (no E31)", () => {
    const d = resolveAutoBilling({
      billingType: "credito_fiscal",
      paymentMethod: "cash",
      settings: ncf,
    });
    expect(d.comprobanteType).toBe("B01");
    expect(d.documentKind).toBe("ncf");
    expect(d.label).toMatch(/B01/);
  });

  it("modal sin método aún → sugiere B02 (nunca Proforma) en modo NCF", () => {
    const d = resolveAutoBilling({
      billingType: "consumo",
      payments: [],
      settings: ncf,
    });
    expect(d.documentKind).toBe("ncf");
    expect(d.comprobanteType).toBe("B02");
  });
});

describe("modo e-CF — efectivo/transferencia pendiente para cierre", () => {
  it("efectivo → proforma pendiente de e-CF al cierre", () => {
    const d = resolveAutoBilling({
      billingType: "consumo",
      paymentMethod: "cash",
      settings: ecf,
    });
    expect(d.documentKind).toBe("proforma");
    expect(d.timing).toBe("at_closing");
    expect(d.pendingForClosing).toBe(true);
  });

  it("tarjeta → E32 inmediato", () => {
    const d = resolveAutoBilling({
      billingType: "consumo",
      paymentMethod: "card",
      settings: ecf,
    });
    expect(d.comprobanteType).toBe("E32");
    expect(d.timing).toBe("immediate");
  });
});

describe("comprobanteToDocType", () => {
  it("mapea cada comprobante a su DocType", () => {
    expect(comprobanteToDocType("B02")).toBe("consumo");
    expect(comprobanteToDocType("B01")).toBe("credito_fiscal");
    expect(comprobanteToDocType("E32")).toBe("ecf_32");
    expect(comprobanteToDocType("E31")).toBe("ecf_31");
    expect(comprobanteToDocType("PROFORMA")).toBeNull();
  });
});

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
