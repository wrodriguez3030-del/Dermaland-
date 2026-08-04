import { describe, expect, it } from "vitest";
import { splitFullName } from "./full-name";

describe("splitFullName", () => {
  it("parte nombre y apellido por el primer espacio", () => {
    expect(splitFullName("Ana Pérez")).toEqual({
      firstName: "Ana",
      lastName: "Pérez",
    });
  });

  it("todo lo que sigue al primer nombre es apellido", () => {
    // "María Trinidad Sánchez de los Santos" no se parte en cuatro columnas.
    expect(splitFullName("María Trinidad Sánchez")).toEqual({
      firstName: "María",
      lastName: "Trinidad Sánchez",
    });
  });

  it("un solo nombre deja el apellido vacío, no inventado", () => {
    // La columna es NOT NULL, así que va cadena vacía. Repetir el nombre como
    // apellido produciría "Ana Ana" en la ficha del cliente.
    expect(splitFullName("Ana")).toEqual({ firstName: "Ana", lastName: "" });
  });

  it("limpia espacios de más, que es como la gente teclea", () => {
    expect(splitFullName("  Ana   Pérez  ")).toEqual({
      firstName: "Ana",
      lastName: "Pérez",
    });
  });

  it("nunca devuelve un nombre vacío: la columna es NOT NULL", () => {
    for (const v of ["", "   ", null, undefined]) {
      const r = splitFullName(v as string);
      expect(r.firstName.length).toBeGreaterThan(0);
    }
  });
});
