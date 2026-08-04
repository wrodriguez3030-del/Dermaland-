import { describe, expect, it } from "vitest";
import { expandSearchTerm } from "./synonyms";

describe("expandSearchTerm", () => {
  it("bloqueador encuentra los protectores solares", () => {
    // El fallo real: "bloqueador" es la palabra que usa todo el mundo en RD y
    // devolvía CERO resultados, teniendo 83 protectores solares.
    const t = expandSearchTerm("bloqueador");
    expect(t).toContain("solar");
    expect(t).toContain("spf");
  });

  it("cubre las formas de decir lo mismo", () => {
    // Recibe UNA palabra: `queryCatalog` ya trocea la frase antes de llamar.
    // "protector solar" llega como "protector" y "solar" por separado.
    for (const palabra of ["bloqueador", "protector", "filtro", "sunblock", "pantalla"]) {
      const t = expandSearchTerm(palabra);
      expect(t.some((x) => x === "solar" || x === "spf"), palabra).toBe(true);
    }
  });

  it("acné encuentra las marcas de las líneas antiacné", () => {
    const t = expandSearchTerm("acne");
    expect(t).toContain("cleanance");
    expect(t).toContain("effaclar");
    expect(t).toContain("sebium");
  });

  it("funciona con y sin tilde", () => {
    expect(expandSearchTerm("acné")).toEqual(expandSearchTerm("acne"));
  });

  it("caspa, manchas y arrugas también", () => {
    expect(expandSearchTerm("caspa").length).toBeGreaterThan(1);
    expect(expandSearchTerm("manchas")).toContain("despigmentante");
    expect(expandSearchTerm("arrugas")).toContain("antiedad");
  });

  it("una palabra sin sinónimos se devuelve tal cual", () => {
    expect(expandSearchTerm("avene")).toEqual(["avene"]);
    expect(expandSearchTerm("cicalfate")).toEqual(["cicalfate"]);
  });

  it("SIEMPRE incluye lo que tecleó el cliente", () => {
    // Ampliar no puede significar sustituir: si busca "bloqueador" y hay un
    // producto que se llama así, tiene que salir.
    for (const p of ["bloqueador", "acne", "caspa", "loquesea"]) {
      expect(expandSearchTerm(p)).toContain(p);
    }
  });

  it("no revienta con lo vacío", () => {
    expect(expandSearchTerm("")).toEqual([]);
    expect(expandSearchTerm("   ")).toEqual([]);
  });
});
