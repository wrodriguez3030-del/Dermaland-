// Portada de agendapp: tests/unit/dgii-nota-rnc-heredado-v555.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { exigeRncCompradorEnNota } from "./note-reference";
import { RFCE_MONTO_MAXIMO } from "./builders/rfce";
import { rutaPortada, leerSiExiste } from "./__port__/rutas";

/**
 * v555 — RNC del comprador heredado del documento de origen en notas 33/34.
 *
 * Último pendiente de `V498_ESTUDIO_L10N_DO_EDI.md`, confirmado abierto en el
 * informe v553: `builder.ts` tenía regla de RNC para 31/41/43/44/45/46/47 y
 * ninguna para 33/34. La regla es de la norma de DGII, no del XSD — por eso el
 * builder, que deriva del XSD, no podía tenerla.
 */

describe("exigeRncCompradorEnNota", () => {
  it("exige RNC cuando el origen es 31, 41 o 45", () => {
    for (const tipoEcf of ["31", "41", "45"]) {
      const r = exigeRncCompradorEnNota({ tipoEcf, total: 100 });
      expect(r.exige).toBe(true);
      // El motivo va al mensaje que lee la cajera: tiene que nombrar el tipo.
      if (r.exige) expect(r.motivo).toContain(tipoEcf);
    }
  });

  it("NO exige cuando el origen es una factura de consumo bajo el tope", () => {
    // El caso normal del negocio: ninguna sesión de láser llega a RD$250.000.
    expect(exigeRncCompradorEnNota({ tipoEcf: "32", total: 4_500 }).exige).toBe(false);
    expect(exigeRncCompradorEnNota({ tipoEcf: "32", total: RFCE_MONTO_MAXIMO - 0.01 }).exige).toBe(false);
  });

  it("exige cuando el 32 llega al tope — el tope incluido", () => {
    // «≥», no «>»: en el tope exacto la factura ya deja de ser anónima.
    const enElTope = exigeRncCompradorEnNota({ tipoEcf: "32", total: RFCE_MONTO_MAXIMO });
    expect(enElTope.exige).toBe(true);
    expect(exigeRncCompradorEnNota({ tipoEcf: "32", total: RFCE_MONTO_MAXIMO + 1 }).exige).toBe(true);
  });

  it("NO exige si el origen no se conoce", () => {
    // El original puede ser pre-AgendApp o de otro software del mismo emisor.
    // Bloquear por lo que no podemos ver dejaría sin emitir una nota legítima.
    expect(exigeRncCompradorEnNota(null).exige).toBe(false);
    expect(exigeRncCompradorEnNota(undefined).exige).toBe(false);
  });

  it("NO exige para otros tipos de origen", () => {
    for (const tipoEcf of ["43", "44", "46", "47"]) {
      expect(exigeRncCompradorEnNota({ tipoEcf, total: 1_000_000 }).exige).toBe(false);
    }
  });

  it("usa el tope canónico, sin declarar una segunda copia", () => {
    // v553 dejó dicho que una segunda copia del umbral acabaría mintiendo el día
    // que DGII lo mueva. El fuente no debe traer el número escrito a mano.
    const fuente = readFileSync(rutaPortada("src/lib/dgii/note-reference.ts"), "utf8");
    const soloCodigo = fuente
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(soloCodigo).toContain("RFCE_MONTO_MAXIMO");
    expect(soloCodigo).not.toMatch(/250[_,]?000/);
  });
});

// PENDIENTE fase 3 (persistencia y orquestacion): el bloque entero guarda src/lib/dgii/invoice-prepare.ts, que DermaLand aún no tiene.
describe.skip("invoice-prepare — el gate va ANTES de reservar la secuencia", () => {
  const fuente = leerSiExiste("src/lib/dgii/invoice-prepare.ts");

  it("comprueba la exigencia antes de tocar la secuencia", () => {
    // Si el chequeo cayera después de reservar, un rechazo de DGII dejaría el
    // e-NCF quemado y un hueco en la secuencia — que es lo que DGII revisa.
    // Es la lección de los 6 quemados de v550.
    const iExigencia = fuente.indexOf("exigeRncCompradorEnNota");
    const iReserva = fuente.indexOf("lockAndCheckNoteBalance");
    expect(iExigencia).toBeGreaterThan(-1);
    expect(iReserva).toBeGreaterThan(-1);
    expect(iExigencia).toBeLessThan(iReserva);
  });

  it("bloquea con un mensaje que dice qué hacer, no un código", () => {
    const bloque = fuente.slice(fuente.indexOf("exigeRncCompradorEnNota"));
    expect(bloque).toContain("requiere el RNC o cédula del comprador");
    expect(bloque).toContain("Agrégalo en la ficha del cliente");
  });
});
