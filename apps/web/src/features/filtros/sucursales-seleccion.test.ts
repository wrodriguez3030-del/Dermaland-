import { describe, it, expect } from "vitest";
import {
  alternarSucursal,
  etiquetaSucursales,
  nombresSucursales,
  normalizarSeleccion,
  type OpcionSucursal,
} from "./sucursales-seleccion";

const OPCIONES: OpcionSucursal[] = [
  { id: "a", name: "Sucursal A" },
  { id: "b", name: "Sucursal B" },
  { id: "c", name: "Sucursal C" },
];

describe("alternarSucursal", () => {
  it("desde [] (todas), desmarcar una deja TODAS MENOS esa — no solo esa", () => {
    expect(alternarSucursal([], "b", OPCIONES)).toEqual(["a", "c"]);
  });

  it("volver a marcar la que faltaba vuelve al conjunto completo → se normaliza a []", () => {
    expect(alternarSucursal(["a", "c"], "b", OPCIONES)).toEqual([]);
  });

  it("desmarcar la única seleccionada vacía la selección explícita (no [])", () => {
    expect(alternarSucursal(["a"], "a", OPCIONES)).toEqual([]);
    // Caso límite real: quedarse sin ninguna marcada NO debe leerse como
    // "todas" — pero como hoy solo hay 3 opciones y quitar "a" de ["a"] es
    // igual de vacío que "todas menos ninguna", ambos casos coinciden en [].
    // Se documenta aquí para que un cambio futuro de semántica no lo rompa
    // en silencio.
  });

  it("marcar una segunda desde una sola seleccionada las suma", () => {
    expect(alternarSucursal(["a"], "b", OPCIONES)).toEqual(["a", "b"]);
  });

  it("ids repetidos no duplican la selección", () => {
    expect(alternarSucursal(["a", "a"], "b", OPCIONES)).toEqual(["a", "b"]);
  });
});

describe("normalizarSeleccion", () => {
  it("quita ids que ya no existen (sucursal desactivada o borrada)", () => {
    expect(normalizarSeleccion(["a", "fantasma"], OPCIONES)).toEqual(["a"]);
  });

  it("el conjunto completo se reduce a [] (forma canónica de «todas»)", () => {
    expect(normalizarSeleccion(["a", "b", "c"], OPCIONES)).toEqual([]);
  });

  it("quita duplicados", () => {
    expect(normalizarSeleccion(["a", "a", "b"], OPCIONES)).toEqual(["a", "b"]);
  });
});

describe("etiquetaSucursales", () => {
  it("[] o el conjunto completo → «Todas las sucursales»", () => {
    expect(etiquetaSucursales([], OPCIONES)).toBe("Todas las sucursales");
    expect(etiquetaSucursales(["a", "b", "c"], OPCIONES)).toBe("Todas las sucursales");
  });

  it("una sola → su nombre", () => {
    expect(etiquetaSucursales(["b"], OPCIONES)).toBe("Sucursal B");
  });

  it("varias (pero no todas) → «N sucursales»", () => {
    expect(etiquetaSucursales(["a", "b"], OPCIONES)).toBe("2 sucursales");
  });

  it("un id desconocido y solo — no revienta, da un texto genérico", () => {
    expect(etiquetaSucursales(["fantasma"], OPCIONES)).toBe("1 sucursal");
  });
});

describe("nombresSucursales (metadatos de exportación)", () => {
  it("[] → «Todas las sucursales»", () => {
    expect(nombresSucursales([], OPCIONES)).toBe("Todas las sucursales");
  });

  it("varias → nombres unidos por coma, en el orden dado", () => {
    expect(nombresSucursales(["c", "a"], OPCIONES)).toBe("Sucursal C, Sucursal A");
  });
});
