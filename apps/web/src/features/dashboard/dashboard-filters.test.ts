import { describe, expect, it } from "vitest";
import {
  matchesPeriod,
  availableYears,
  mesSinAnio,
  rangoDelPeriodo,
  periodoActual,
  etiquetaDelPeriodo,
} from "./dashboard-filters";

const d = (s: string) => new Date(s).toISOString();

describe("matchesPeriod", () => {
  it("'all'/'all' no restringe (siempre true)", () => {
    expect(matchesPeriod(d("2020-01-01"), "all", "all")).toBe(true);
  });

  it("filtra por año", () => {
    expect(matchesPeriod(d("2026-03-15"), "all", "2026")).toBe(true);
    expect(matchesPeriod(d("2025-03-15"), "all", "2026")).toBe(false);
  });

  it("filtra por mes (1–12)", () => {
    expect(matchesPeriod(d("2026-03-15"), "3", "all")).toBe(true);
    expect(matchesPeriod(d("2026-04-15"), "3", "all")).toBe(false);
  });

  it("combina mes + año", () => {
    expect(matchesPeriod(d("2026-03-15"), "3", "2026")).toBe(true);
    expect(matchesPeriod(d("2026-03-15"), "3", "2025")).toBe(false);
    expect(matchesPeriod(d("2026-04-15"), "3", "2026")).toBe(false);
  });

  it("fecha inválida → false (salvo all/all)", () => {
    expect(matchesPeriod("no-date", "3", "2026")).toBe(false);
  });
});

describe("availableYears", () => {
  it("devuelve años únicos, descendente", () => {
    expect(
      availableYears([d("2024-01-01"), d("2026-05-01"), d("2024-12-01"), d("2025-01-01")]),
    ).toEqual([2026, 2025, 2024]);
  });

  it("lista vacía → []", () => {
    expect(availableYears([])).toEqual([]);
  });
});

describe("rango de fechas del filtro de periodo", () => {
  it("un mes concreto da su primer y último día, sin fallar en febrero", () => {
    expect(rangoDelPeriodo("2", "2024")).toEqual({ desde: "2024-02-01", hasta: "2024-02-29" });
    expect(rangoDelPeriodo("2", "2026")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
    expect(rangoDelPeriodo("12", "2026")).toEqual({ desde: "2026-12-01", hasta: "2026-12-31" });
  });

  it("un año entero va del 1 de enero al 31 de diciembre", () => {
    expect(rangoDelPeriodo("all", "2025")).toEqual({ desde: "2025-01-01", hasta: "2025-12-31" });
  });

  it("sin año no hay rango: null es «no acotes por fecha»", () => {
    expect(rangoDelPeriodo("all", "all")).toBeNull();
    expect(rangoDelPeriodo("7", "all")).toBeNull();
  });

  it("🔴 «un mes de cualquier año» se detecta como combo imposible", () => {
    // `rangoDelPeriodo` devuelve null también aquí, y null significa «todo el
    // histórico». Sin esta comprobación aparte, elegir «Julio · Todos» pediría
    // sin querer las 14 965 facturas y enseñaría un total del periodo
    // equivocado.
    expect(mesSinAnio("7", "all")).toBe(true);
    expect(mesSinAnio("all", "all")).toBe(false);
    expect(mesSinAnio("7", "2026")).toBe(false);
  });
});

describe("periodoActual", () => {
  it("da el mes (1–12) y el año en curso, en hora local", () => {
    // Mes 8 del constructor = septiembre; el filtro los cuenta desde 1.
    expect(periodoActual(new Date(2026, 8, 14))).toEqual({ month: "9", year: "2026" });
  });

  it("los bordes del año no se desplazan", () => {
    expect(periodoActual(new Date(2026, 0, 1))).toEqual({ month: "1", year: "2026" });
    expect(periodoActual(new Date(2026, 11, 31))).toEqual({ month: "12", year: "2026" });
  });

  it("🔴 su salida alimenta a rangoDelPeriodo sin traducción extra", () => {
    // Es lo que hacen el Dashboard y el índice de Reportes: mismo mes, mismo
    // rango, misma cifra en las dos pantallas.
    const { month, year } = periodoActual(new Date(2026, 8, 14));
    expect(rangoDelPeriodo(month, year)).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
  });
});

describe("etiquetaDelPeriodo", () => {
  it("un mes concreto se lee con su nombre", () => {
    expect(etiquetaDelPeriodo("9", "2026")).toBe("Septiembre 2026");
  });

  it("distingue el año entero del histórico completo", () => {
    expect(etiquetaDelPeriodo("all", "2026")).toBe("Todos los meses de 2026");
    expect(etiquetaDelPeriodo("all", "all")).toBe("Todo el histórico");
    expect(etiquetaDelPeriodo("9", "all")).toBe("Todo el histórico");
  });
});
