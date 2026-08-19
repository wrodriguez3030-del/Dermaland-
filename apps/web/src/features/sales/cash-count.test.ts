import { describe, expect, it } from "vitest";
import {
  RD_DENOMINATIONS,
  cashCountTotal,
  differenceLabel,
} from "./cash-count";

describe("RD_DENOMINATIONS", () => {
  it("van de mayor a menor y son las que circulan en RD", () => {
    expect(RD_DENOMINATIONS).toEqual([
      2000, 1000, 500, 200, 100, 50, 25, 10, 5, 1,
    ]);
  });
});

describe("cashCountTotal", () => {
  it("suma cantidad por denominación", () => {
    expect(cashCountTotal({ 2000: 2, 500: 1, 25: 3 })).toBe(4575);
  });

  it("vacío o cantidades no válidas cuentan cero", () => {
    expect(cashCountTotal({})).toBe(0);
    expect(cashCountTotal({ 100: Number.NaN, 50: -2 })).toBe(0);
  });

  it("ignora denominaciones que no existen", () => {
    expect(cashCountTotal({ 7: 10, 100: 1 })).toBe(100);
  });
});

describe("differenceLabel", () => {
  it("cuadra dentro del centavo", () => {
    expect(differenceLabel(0)).toEqual({ tone: "ok", label: "Cuadra" });
    expect(differenceLabel(0.004)).toEqual({ tone: "ok", label: "Cuadra" });
  });

  it("faltante y sobrante con el monto", () => {
    expect(differenceLabel(-120)).toEqual({
      tone: "falta",
      label: "Falta RD$120.00",
    });
    expect(differenceLabel(35.5)).toEqual({
      tone: "sobra",
      label: "Sobra RD$35.50",
    });
  });
});
