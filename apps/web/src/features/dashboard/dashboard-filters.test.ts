import { describe, expect, it } from "vitest";
import { matchesPeriod, availableYears } from "./dashboard-filters";

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
