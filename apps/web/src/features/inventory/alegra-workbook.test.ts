import { describe, it, expect } from "vitest";
import { rowsFromMatrix } from "./alegra-workbook";

/** Cabecera real del export completo de Alegra: nombre en B, cantidad en E, total en H. */
const HEADER = [
  "Categoría",
  "Producto/servicio",
  "Referencia",
  "Descripción",
  "Cantidad en Principal",
  "Cantidad mínima en Principal",
  "Cantidad máxima en Principal",
  "Cantidad total",
];

describe("rowsFromMatrix", () => {
  it("lee el nombre de la columna B y las cantidades de E y H", () => {
    const rows = rowsFromMatrix([HEADER, ["", "CREMA X", "", "desc", "3", "0", "0", "8"]]);
    expect(rows).toEqual([{ rowNumber: 2, name: "CREMA X", qtyPrincipal: 3, qtyTotal: 8 }]);
  });

  it("también acepta el export recortado de 2 columnas", () => {
    const rows = rowsFromMatrix([
      ["Nombre", "Cantidad en Principal", "Cantidad total"],
      ["CREMA X", "4", "9"],
    ]);
    expect(rows).toEqual([{ rowNumber: 2, name: "CREMA X", qtyPrincipal: 4, qtyTotal: 9 }]);
  });

  it("descarta filas sin nombre", () => {
    expect(rowsFromMatrix([HEADER, ["", "", "", "", "1", "0", "0", "1"]])).toEqual([]);
  });

  // ── Cantidades no numéricas: NUNCA deben caer a 0 ────────────────────────
  // La escritura del importador es absoluta, así que un 0 inventado borraría el
  // stock del producto en las dos sucursales. Deben salir NaN para que
  // `rowTargets` mande la fila a `skipped` y el usuario la vea.
  it.each([
    ["celda vacía", ""],
    ["guion", "-"],
    ["N/A", "N/A"],
    ["texto libre", "sin dato"],
    ["decimal", "3.7"],
  ])("no convierte %s en 0: devuelve NaN para que la fila se omita", (_caso, valor) => {
    const rows = rowsFromMatrix([HEADER, ["", "CREMA X", "", "", valor, "0", "0", valor]]);
    expect(Number.isNaN(rows[0]?.qtyPrincipal)).toBe(true);
    expect(Number.isNaN(rows[0]?.qtyTotal)).toBe(true);
  });

  it("el 0 explícito del archivo SÍ es cero", () => {
    const rows = rowsFromMatrix([HEADER, ["", "CREMA X", "", "", "0", "0", "0", "0"]]);
    expect(rows[0]).toMatchObject({ qtyPrincipal: 0, qtyTotal: 0 });
  });

  // ── Números escritos como texto: no truncar en el separador ───────────────
  it.each([
    ["coma como millar", "1,234", 1234],
    ["punto como millar", "1.234", 1234],
    ["espacio como millar", "2 312", 2312],
    ["millones", "1,234,567", 1234567],
  ])("lee %s sin truncar", (_caso, texto, esperado) => {
    const rows = rowsFromMatrix([HEADER, ["", "CREMA X", "", "", texto, "0", "0", texto]]);
    expect(rows[0]?.qtyPrincipal).toBe(esperado);
  });

  it("no confunde un decimal con un separador de millar", () => {
    // "1.23" no son 123: es un decimal → se omite en vez de inventar un número.
    const rows = rowsFromMatrix([HEADER, ["", "CREMA X", "", "", "1.23", "0", "0", "1.23"]]);
    expect(Number.isNaN(rows[0]?.qtyPrincipal)).toBe(true);
  });

  it("numera las filas como en Excel (la 1 es la cabecera)", () => {
    const rows = rowsFromMatrix([
      HEADER,
      ["", "A", "", "", "1", "0", "0", "1"],
      ["", "B", "", "", "2", "0", "0", "2"],
    ]);
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 3]);
  });

  it("no se salta la numeración cuando descarta una fila vacía intermedia", () => {
    const rows = rowsFromMatrix([
      HEADER,
      ["", "A", "", "", "1", "0", "0", "1"],
      ["", "", "", "", "", "", "", ""],
      ["", "C", "", "", "3", "0", "0", "3"],
    ]);
    // La fila 4 de Excel debe seguir reportándose como 4, no como 3.
    expect(rows.map((r) => ({ n: r.rowNumber, name: r.name }))).toEqual([
      { n: 2, name: "A" },
      { n: 4, name: "C" },
    ]);
  });

  it("recorta espacios alrededor del nombre", () => {
    const rows = rowsFromMatrix([HEADER, ["", "  CREMA X  ", "", "", "1", "0", "0", "1"]]);
    expect(rows[0]?.name).toBe("CREMA X");
  });

  it("una fila más corta que la cabecera no revienta, pero tampoco inventa ceros", () => {
    // Faltan las celdas de cantidad: es "no sé", no "cero". Va a `skipped`.
    const rows = rowsFromMatrix([HEADER, ["", "CREMA X"]]);
    expect(rows[0]?.name).toBe("CREMA X");
    expect(Number.isNaN(rows[0]?.qtyPrincipal)).toBe(true);
    expect(Number.isNaN(rows[0]?.qtyTotal)).toBe(true);
  });

  it("propaga el error de cabecera faltante con las columnas encontradas", () => {
    expect(() => rowsFromMatrix([["Producto/servicio"], ["X"]])).toThrow(
      /Cantidad en Principal/,
    );
  });

  it("una matriz vacía falla con el mensaje de cabecera, no con un error de tipos", () => {
    expect(() => rowsFromMatrix([])).toThrow(/columna/i);
  });
});
