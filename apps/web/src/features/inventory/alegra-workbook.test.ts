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

  it("trata celdas vacías o no numéricas como 0", () => {
    const rows = rowsFromMatrix([HEADER, ["", "CREMA X", "", "", "", "0", "0", "n/a"]]);
    expect(rows[0]).toMatchObject({ qtyPrincipal: 0, qtyTotal: 0 });
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

  it("tolera filas más cortas que la cabecera sin reventar", () => {
    const rows = rowsFromMatrix([HEADER, ["", "CREMA X"]]);
    expect(rows[0]).toEqual({ rowNumber: 2, name: "CREMA X", qtyPrincipal: 0, qtyTotal: 0 });
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
