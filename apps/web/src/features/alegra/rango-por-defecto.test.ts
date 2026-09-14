import { describe, it, expect } from "vitest";
import { rangoPorDefecto } from "./rango-por-defecto";

describe("rangoPorDefecto (Reportes → Alegra)", () => {
  it("el mes en curso: del día 1 a hoy", () => {
    expect(rangoPorDefecto("2026-09-14")).toEqual({ desde: "2026-09-01", hasta: "2026-09-14" });
  });

  it("funciona igual en el propio día 1 del mes", () => {
    expect(rangoPorDefecto("2026-01-01")).toEqual({ desde: "2026-01-01", hasta: "2026-01-01" });
  });

  it("no usa Date: una cadena de otro año no se desalinea con huso horario alguno", () => {
    expect(rangoPorDefecto("2028-12-31")).toEqual({ desde: "2028-12-01", hasta: "2028-12-31" });
  });
});
