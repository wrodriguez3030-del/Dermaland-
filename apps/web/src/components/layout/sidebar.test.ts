import { describe, it, expect } from "vitest";
import { groups } from "./sidebar";

const ventas = groups.find((g) => g.label === "Ventas");

describe("Sidebar — submenú Ventas", () => {
  it("ya NO incluye 'POS / Nueva venta' (se accede por el botón verde)", () => {
    expect(ventas).toBeDefined();
    const labels = ventas!.items.map((i) => i.label);
    expect(labels).not.toContain("POS / Nueva venta");
  });

  it("mantiene el resto del submenú Ventas", () => {
    const labels = ventas!.items.map((i) => i.label);
    expect(labels).toEqual([
      "Ventas",
      "Proformas",
      "Pagos",
      "Devoluciones",
      "Notas de crédito",
      "Caja",
    ]);
  });

  it("ningún ítem del sidebar apunta ya a /pos", () => {
    const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(allHrefs).not.toContain("/pos");
  });
});
