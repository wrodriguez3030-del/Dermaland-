import { describe, it, expect } from "vitest";
import { esVentaDePrueba } from "./test-sales";

describe("esVentaDePrueba", () => {
  it("reconoce los nombres del equipo tal como aparecieron en producción", () => {
    // Los diez nombres distintos que había el 2026-09-05.
    for (const nombre of [
      "WILLIAN R RODRIGUEZ",
      "Alan Rodriguez Bisono",
      "Alan Rodriguez",
      "Willian",
      "Alan RB",
      "Dario",
      "willian Rodrigue",
      "willian",
      "WILIAN", // errata real: una sola L
    ]) {
      expect(esVentaDePrueba(nombre), nombre).toBe(true);
    }
  });

  it("no marca a un cliente real, aunque comparta apellido", () => {
    for (const nombre of [
      "Jose Perez",
      "Ana Rodriguez",
      "Rodriguez",
      "Yberka Coronado",
      "Paula Tejada",
      "",
      null,
      undefined,
    ]) {
      expect(esVentaDePrueba(nombre), String(nombre)).toBe(false);
    }
  });

  it("compara por palabra completa: un nombre que CONTIENE la palabra no cuenta", () => {
    // «Aland» y «Dariana» son nombres reales que contienen «alan» y «dari».
    expect(esVentaDePrueba("Aland Martinez")).toBe(false);
    expect(esVentaDePrueba("Dariana Peña")).toBe(false);
    expect(esVentaDePrueba("Alanis Morales")).toBe(false);
  });

  it("ignora acentos, mayúsculas y signos", () => {
    expect(esVentaDePrueba("DARÍO")).toBe(true);
    expect(esVentaDePrueba("  alan  ")).toBe(true);
    expect(esVentaDePrueba("Willian/Rodriguez")).toBe(true);
  });
});
