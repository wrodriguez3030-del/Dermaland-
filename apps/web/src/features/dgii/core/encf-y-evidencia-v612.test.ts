// Portada de agendapp: tests/unit/dgii-encf-y-evidencia-v612.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ENCF_IMPRESO_RE } from "./print-representation";
import { isValidEncf } from "./builders/common";
import { rutaPortada, leerSiExiste } from "./__port__/rutas";

const leer = (rel: string) => readFileSync(rutaPortada(rel), "utf8");

/**
 * v612 — Las tres reglas de e-NCF que conviven, y por qué no se unifican.
 *
 * v584 consolidó la regex de la representación impresa y dejó escrito que «lo que no debe
 * haber es la misma regex en tres archivos», nombrando sólo dos reglas. Hay una tercera,
 * `isValidEncf`, que valida e-NCF de OTROS emisores en la recepción B2B y admite series
 * E–Z. Quien lea aquel comentario y quiera terminar el trabajo la unificaría, y con eso
 * rechazaría comprobantes legítimos de proveedores cuya serie no es `E`.
 *
 * Estos casos fijan las diferencias en inputs concretos.
 */

describe("v612 — la regla impresa y la de recepción no son la misma", () => {
  it("un e-NCF propio normal pasa las dos", () => {
    expect(ENCF_IMPRESO_RE.test("E310000000001")).toBe(true);
    expect(isValidEncf("E310000000001")).toBe(true);
  });

  it("una serie F de otro emisor: la recepción la acepta, la impresión no", () => {
    // Éste es el caso que se rompería al unificarlas.
    expect(isValidEncf("F320000000001"), "la recepción rechazaría a un proveedor legítimo").toBe(true);
    expect(ENCF_IMPRESO_RE.test("F320000000001")).toBe(false);
  });

  it("la serie P está excluida de la recepción, y también de la impresión", () => {
    expect(isValidEncf("P310000000001")).toBe(false);
    expect(ENCF_IMPRESO_RE.test("P310000000001")).toBe(false);
  });

  it("un alfanumérico que el XSD admitiría no pasa ninguna de las dos estrictas", () => {
    expect(ENCF_IMPRESO_RE.test("E31000000000A")).toBe(false);
    expect(isValidEncf("E31000000000A")).toBe(false);
  });

  it("y el comentario nombra las tres, no dos", () => {
    const doc = leer("src/lib/dgii/print-representation.ts");
    expect(doc).toContain("isValidEncf");
    expect(doc).toContain("builders/common.ts");
  });
});

// PENDIENTE fase 3 (persistencia y orquestacion): el bloque entero guarda src/lib/dgii/submission-service.ts, que DermaLand aún no tiene.
describe.skip("v612 — el XML de reserva de la evidencia se escapa", () => {
  /**
   * El `trackId` viene de la respuesta de la DGII. Interpolado en crudo, un `&` produce un
   * fichero que ningún lector de XML abre — y ese fichero es la prueba de qué se envió.
   */
  const src = leerSiExiste("src/lib/dgii/submission-service.ts");

  it("no se interpola el trackId en crudo", () => {
    expect(src, "el trackId entra sin escapar en el XML").not.toMatch(
      /<trackId>\$\{result\.trackId \?\? ""\}<\/trackId>/,
    );
    expect(src).toMatch(/<trackId>\$\{escaparXml\(/);
  });

  it("el estado tampoco", () => {
    expect(src).toMatch(/<status>\$\{escaparXml\(/);
  });

  it("y la utilidad escapa los cinco caracteres que rompen un XML", () => {
    const i = src.indexOf("function escaparXml");
    const cuerpo = src.slice(i, i + 400);
    for (const [nombre, patron] of [["&", /&amp;/], ["<", /&lt;/], [">", /&gt;/], ['"', /&quot;/]] as const) {
      expect(cuerpo, `no escapa ${nombre}`).toMatch(patron);
    }
  });
});
