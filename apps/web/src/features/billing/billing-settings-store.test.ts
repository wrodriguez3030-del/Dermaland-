// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_BILLING_SETTINGS,
  clampPercentage,
  getBillingSettings,
  normalize,
  resetBillingSettings,
  saveBillingSettings,
} from "./billing-settings-store";

beforeEach(() => {
  window.localStorage.clear();
});

describe("billing-settings defaults", () => {
  it("arranca con porcentaje sugerido 15% y ambiente mock", () => {
    expect(DEFAULT_BILLING_SETTINGS.cashTransferEcfPercentage).toBe(15);
    expect(DEFAULT_BILLING_SETTINGS.ecfEnvironment).toBe("mock");
  });

  it("tarjeta inmediato y cierre efectivo/transferencia activos por default", () => {
    expect(DEFAULT_BILLING_SETTINGS.cardEcfImmediateEnabled).toBe(true);
    expect(DEFAULT_BILLING_SETTINGS.cashTransferEcfClosingEnabled).toBe(true);
  });

  it("estrategia default = últimas ventas (last) y tipos E32/E31", () => {
    expect(DEFAULT_BILLING_SETTINGS.cashTransferSelectionStrategy).toBe("last");
    expect(DEFAULT_BILLING_SETTINGS.defaultConsumerEcfType).toBe("E32");
    expect(DEFAULT_BILLING_SETTINGS.defaultRncEcfType).toBe("E31");
  });

  it("emisión real apagada por default", () => {
    expect(DEFAULT_BILLING_SETTINGS.realEmissionEnabled).toBe(false);
  });
});

describe("clampPercentage", () => {
  it("clampea a [0,100] y redondea", () => {
    expect(clampPercentage(-5)).toBe(0);
    expect(clampPercentage(150)).toBe(100);
    expect(clampPercentage(15.4)).toBe(15);
    expect(clampPercentage(NaN)).toBe(0);
  });
});

describe("saveBillingSettings", () => {
  it("persiste el porcentaje fijado por ADMIN", () => {
    const r = saveBillingSettings({ cashTransferEcfPercentage: 30 });
    expect(r.ok).toBe(true);
    expect(getBillingSettings().cashTransferEcfPercentage).toBe(30);
  });

  it("rechaza porcentaje fuera de rango", () => {
    const r = saveBillingSettings({ cashTransferEcfPercentage: 120 });
    expect(r.ok).toBe(false);
  });

  it("0% y 100% son válidos", () => {
    expect(saveBillingSettings({ cashTransferEcfPercentage: 0 }).ok).toBe(true);
    expect(saveBillingSettings({ cashTransferEcfPercentage: 100 }).ok).toBe(true);
  });
});

describe("seguridad de emisión real", () => {
  it("no se puede activar emisión real fuera de ambiente produccion", () => {
    const r = saveBillingSettings({
      ecfEnvironment: "testecf",
      realEmissionEnabled: true,
    });
    expect(r.ok).toBe(true);
    expect(getBillingSettings().realEmissionEnabled).toBe(false);
  });

  it("normalize fuerza realEmission=false si no es produccion", () => {
    const n = normalize({
      ...DEFAULT_BILLING_SETTINGS,
      ecfEnvironment: "certecf",
      realEmissionEnabled: true,
    });
    expect(n.realEmissionEnabled).toBe(false);
  });
});

describe("resetBillingSettings", () => {
  it("restablece a defaults", () => {
    saveBillingSettings({ cashTransferEcfPercentage: 80 });
    resetBillingSettings();
    expect(getBillingSettings().cashTransferEcfPercentage).toBe(15);
  });
});
