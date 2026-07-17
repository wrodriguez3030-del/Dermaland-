import { describe, expect, it } from "vitest";
import { expiryStatus } from "./lot-store";

// Fecha de referencia fija para tests deterministas.
const REF = new Date("2026-07-17T00:00:00Z");
const inDays = (n: number) => new Date(REF.getTime() + n * 86_400_000).toISOString();

describe("expiryStatus — retrocompatible (sin umbrales extra = 30/90)", () => {
  it("vencido / por vencer / advertencia / ok con los cortes por defecto", () => {
    expect(expiryStatus(inDays(-1), REF)).toBe("expired");
    expect(expiryStatus(inDays(20), REF)).toBe("soon"); // < 30
    expect(expiryStatus(inDays(60), REF)).toBe("warn"); // 30..89
    expect(expiryStatus(inDays(120), REF)).toBe("ok"); // >= 90
  });

  it("bordes exactos por defecto (30 y 90 NO son soon/warn)", () => {
    expect(expiryStatus(inDays(30), REF)).toBe("warn"); // no < 30
    expect(expiryStatus(inDays(90), REF)).toBe("ok"); // no < 90
  });
});

describe("expiryStatus — umbral por laboratorio", () => {
  it("con soonDays=90 (regla del lab), un lote a 60 días ya es 'por vencer'", () => {
    // Lab exige 90 días: usar soonDays=warnDays=90 → banda 'warn' vacía.
    expect(expiryStatus(inDays(60), REF, 90, 90)).toBe("soon");
    expect(expiryStatus(inDays(100), REF, 90, 90)).toBe("ok");
  });

  it("sigue marcando vencido igual (universal) sin importar el umbral", () => {
    expect(expiryStatus(inDays(-5), REF, 120, 120)).toBe("expired");
  });

  it("borde exacto en el umbral del lab (days == soonDays → NO soon)", () => {
    expect(expiryStatus(inDays(90), REF, 90, 90)).toBe("ok");
    expect(expiryStatus(inDays(89), REF, 90, 90)).toBe("soon");
  });
});
