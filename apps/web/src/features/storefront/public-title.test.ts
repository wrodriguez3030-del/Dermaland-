import { describe, expect, it } from "vitest";
import { cleanPublicTitle } from "./public-title";

describe("cleanPublicTitle", () => {
  it("quita los marcadores internos del ERP", () => {
    // Caso real: cuatro productos salieron a la tienda con el marcador que el
    // personal usa para distinguir la unidad suelta de la caja. El cliente lo
    // veía en la ficha Y en el WhatsApp que enviaba.
    expect(cleanPublicTitle("Serenus 25 MG ** Detalle **")).toBe("Serenus 25 MG");
    expect(cleanPublicTitle("Celecoxib IF 400 MG X 30CAPS ** Detalle **")).toBe(
      "Celecoxib IF 400 MG X 30CAPS",
    );
    expect(cleanPublicTitle("Alercet 10 MG ** Detalle **")).toBe("Alercet 10 MG");
  });

  it("quita el marcador esté donde esté", () => {
    expect(cleanPublicTitle("** Detalle ** Serenus")).toBe("Serenus");
    expect(cleanPublicTitle("Crema ** Oferta ** 30ML")).toBe("Crema 30ML");
  });

  it("quita corchetes internos", () => {
    expect(cleanPublicTitle("Avene Cicalfate [DESCONTINUADO]")).toBe(
      "Avene Cicalfate",
    );
  });

  it("colapsa los espacios que deja al quitar", () => {
    expect(cleanPublicTitle("A  **X**   B")).toBe("A B");
    expect(cleanPublicTitle("  Avene   Cicalfate  ")).toBe("Avene Cicalfate");
  });

  it("no toca un nombre normal", () => {
    for (const n of [
      "Avene Cicalfate SPF 50 30ML",
      "Bioderma Sebium H2O 500 ML",
      "LA Roche-posay Effaclar DUO + M 40 ML",
      "Ducray Keracnyl PP+ 30 ML",
    ]) {
      expect(cleanPublicTitle(n)).toBe(n);
    }
  });

  it("no deja el nombre vacío: prefiere el original a nada", () => {
    // Si un nombre fuera SOLO un marcador, quitarlo dejaría la ficha sin título.
    expect(cleanPublicTitle("** Detalle **")).toBe("** Detalle **");
    expect(cleanPublicTitle("")).toBe("");
  });

  it("aguanta lo que no es texto", () => {
    expect(cleanPublicTitle(null as unknown as string)).toBe("");
    expect(cleanPublicTitle(undefined as unknown as string)).toBe("");
  });
});
