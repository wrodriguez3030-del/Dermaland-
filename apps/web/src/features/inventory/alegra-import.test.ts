import { describe, it, expect } from "vitest";
import { normalizeProductName, resolveColumns, rowTargets, ALEGRA_HEADERS } from "./alegra-import";

describe("normalizeProductName", () => {
  it("ignora acentos, mayúsculas y espacios repetidos", () => {
    expect(normalizeProductName("  Avène   Cleanance  ")).toBe(normalizeProductName("AVENE CLEANANCE"));
  });
  it("pega la unidad al número y el SPF", () => {
    expect(normalizeProductName("Crema 30 ML SPF 50")).toBe("CREMA 30ML SPF50");
  });
});

describe("resolveColumns", () => {
  it("ubica las columnas por cabecera sin importar la posición", () => {
    const header = [
      "Categoría", "Producto/servicio", "Referencia", "Descripción",
      "Cantidad en Principal", "Cantidad mínima en Principal",
      "Cantidad máxima en Principal", "Cantidad total",
    ];
    expect(resolveColumns(header)).toEqual({ name: 1, qtyPrincipal: 4, qtyTotal: 7 });
  });
  it("acepta 'Nombre' como alias del producto", () => {
    expect(resolveColumns(["Nombre", "Cantidad en Principal", "Cantidad total"]))
      .toEqual({ name: 0, qtyPrincipal: 1, qtyTotal: 2 });
  });
  it("si falta una cabecera lanza listando las que sí vinieron", () => {
    expect(() => resolveColumns(["Producto/servicio", "Cantidad total"]))
      .toThrow(/Cantidad en Principal/);
  });
  it("ubica las columnas aunque la cabecera venga toda en mayúsculas", () => {
    const header = [
      "CATEGORÍA", "PRODUCTO/SERVICIO", "REFERENCIA", "DESCRIPCIÓN",
      "CANTIDAD EN PRINCIPAL", "CANTIDAD TOTAL",
    ];
    expect(resolveColumns(header)).toEqual({ name: 1, qtyPrincipal: 4, qtyTotal: 5 });
  });
  it("ubica las columnas con acentos y espacios que no trae la cabecera canónica", () => {
    // Escenario real: alguien retipeó la cabecera a mano (copiar/pegar entre
    // hojas) y el autocorrector agregó acentos y espacios de más; debe
    // resolver igual que la forma canónica sin acentos.
    const header = ["Nómbre", "  Cantidad én Principal  ", "Cantidad Tótal"];
    expect(resolveColumns(header)).toEqual({ name: 0, qtyPrincipal: 1, qtyTotal: 2 });
  });
});

describe("rowTargets", () => {
  it("Principal sale de la columna E y Cutis de la resta", () => {
    expect(rowTargets({ rowNumber: 2, name: "X", qtyPrincipal: 3, qtyTotal: 8 }))
      .toEqual({ rowNumber: 2, name: "X", principal: 3, cutis: 5 });
  });
  it("si total = principal, Cutis queda en 0", () => {
    expect(rowTargets({ rowNumber: 2, name: "X", qtyPrincipal: 4, qtyTotal: 4 }))
      .toMatchObject({ principal: 4, cutis: 0 });
  });
  it("rechaza total < principal en vez de producir un Cutis negativo", () => {
    expect(rowTargets({ rowNumber: 9, name: "X", qtyPrincipal: 5, qtyTotal: 2 }))
      .toMatchObject({ error: expect.stringContaining("menor") });
  });
  it("rechaza cantidades negativas", () => {
    expect(rowTargets({ rowNumber: 9, name: "X", qtyPrincipal: -1, qtyTotal: 3 }))
      .toMatchObject({ error: expect.stringContaining("negativa") });
  });
  it("ALEGRA_HEADERS expone los alias usados", () => {
    expect(ALEGRA_HEADERS.qtyPrincipal).toContain("Cantidad en Principal");
  });
});
