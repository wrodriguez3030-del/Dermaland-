import { describe, it, expect } from "vitest";
import { ATAJOS, detectarAtajo } from "./atajos-de-fecha";

const HOY = new Date(2026, 5, 15); // 15 de junio de 2026, un lunes cualquiera

describe("detectarAtajo", () => {
  it("los 6 atajos existen, en el orden de la captura + Ayer/Mes anterior", () => {
    expect(ATAJOS.map((a) => a.etiqueta)).toEqual([
      "Hoy",
      "Ayer",
      "Últimos 7 días",
      "Este mes",
      "Mes anterior",
      "Todo",
    ]);
  });

  it("rango vacío es «Todo», incluso SIN hoy (no depende de la fecha)", () => {
    expect(detectarAtajo("", "", null)).toBe("all");
    expect(detectarAtajo("", "", HOY)).toBe("all");
  });

  it("sin hoy (antes de montar), un rango CON fechas no es decidible", () => {
    expect(detectarAtajo("2026-06-15", "2026-06-15", null)).toBeNull();
  });

  it("hoy · ayer · últimos 7 · este mes · mes anterior, cada uno con hoy=15/06/2026", () => {
    expect(detectarAtajo("2026-06-15", "2026-06-15", HOY)).toBe("today");
    expect(detectarAtajo("2026-06-14", "2026-06-14", HOY)).toBe("yesterday");
    expect(detectarAtajo("2026-06-09", "2026-06-15", HOY)).toBe("last7");
    expect(detectarAtajo("2026-06-01", "2026-06-15", HOY)).toBe("thisMonth");
    expect(detectarAtajo("2026-05-01", "2026-05-31", HOY)).toBe("lastMonth");
  });

  it("el día 1 del mes: «hoy» y «este mes» coinciden — gana «Hoy» (primero en la lista)", () => {
    const primero = new Date(2026, 5, 1);
    expect(detectarAtajo("2026-06-01", "2026-06-01", primero)).toBe("today");
  });

  it("el día 7: «últimos 7 días» y «este mes» coinciden — gana «Últimos 7 días»", () => {
    const dia7 = new Date(2026, 5, 7);
    expect(detectarAtajo("2026-06-01", "2026-06-07", dia7)).toBe("last7");
  });

  it("«mes anterior» cruzando el año (enero → diciembre del año pasado)", () => {
    const enero = new Date(2026, 0, 10);
    expect(detectarAtajo("2025-12-01", "2025-12-31", enero)).toBe("lastMonth");
  });

  it("«mes anterior» con febrero bisiesto (marzo → 29 días)", () => {
    const marzo2028 = new Date(2028, 2, 5); // 2028 es bisiesto
    expect(detectarAtajo("2028-02-01", "2028-02-29", marzo2028)).toBe("lastMonth");
  });

  it("una fecha suelta o un rango a medias no es ningún atajo — «Personalizado»", () => {
    expect(detectarAtajo("2026-06-10", "2026-06-15", HOY)).toBeNull();
    expect(detectarAtajo("2026-06-15", "", HOY)).toBeNull();
    expect(detectarAtajo("", "2026-06-15", HOY)).toBeNull();
  });
});
