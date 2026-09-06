// Portada de agendapp: tests/unit/dgii-veredicto-sin-atajos-v582b.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { normalizeRecepcionResponse, normalizeAcecfResponse } from "./dgii-response-normalizer";

/**
 * v582b — Lo que el code-review de v582 encontró, verificándolo ejecutando.
 *
 * v582 arregló que «No Aceptado» se leyera como aceptación, y por el camino abrió tres
 * agujeros peores. El del medio es el que más duele: enrutar recepción por
 * `resolveConsultaStatus` cerró la dirección del rechazo y ABRIÓ la de la aceptación, que
 * es la cara cara del error — `accepted` no tiene transiciones de salida.
 *
 * Los cuatro casos de aquí abajo los ejecutó el revisor contra el código de v582 y salieron
 * mal. Se dejan escritos para que no vuelvan a salir mal.
 */

const r = (bodyText: string) => ({ status: 200, bodyText, headersRedacted: {}, elapsedMs: 7 });

describe("v582b — el orden de lectura: negación, rechazo, condicional, aceptación", () => {
  it("«Rechazado. No cumple la aceptacion condicional» es un RECHAZO", () => {
    // La rama `condicional` corría antes que todo, así que un texto que dice «Rechazado»
    // salía como aceptación con condiciones. Y `accepted_conditional` es terminal.
    expect(normalizeRecepcionResponse(r(JSON.stringify({ estado: "Rechazado. No cumple la aceptacion condicional" }))).status).toBe(
      "rejected",
    );
  });

  it("«No Aceptado Condicional» también", () => {
    expect(normalizeRecepcionResponse(r(JSON.stringify({ estado: "No Aceptado Condicional" }))).status).toBe("rejected");
  });

  it("y una aceptación condicional de verdad se sigue leyendo bien", () => {
    expect(normalizeRecepcionResponse(r(JSON.stringify({ estado: "Aceptado Condicional" }))).status).toBe(
      "accepted_conditional",
    );
  });
});

describe("v582b — el código numérico no asciende nada a aceptado terminal", () => {
  it("«Recibido» con codigo 1 NO es una aceptación", () => {
    // v582 lo convirtió en `accepted` + `accepted_at`, sin vuelta atrás. La regla que lo
    // permitía se escribió para el camino de CONSULTA, donde `codigo` es un
    // ConsultaResultado; en recepción esa clave la rellenan otros payloads.
    expect(normalizeRecepcionResponse(r(JSON.stringify({ estado: "Recibido", codigo: "1" }))).status).not.toBe("accepted");
  });

  it("«En Proceso» con codigo 1, tampoco", () => {
    expect(normalizeRecepcionResponse(r(JSON.stringify({ estado: "En Proceso", codigo: "1" }))).status).not.toBe("accepted");
  });

  it("y un estado que no conocemos, menos aún", () => {
    expect(normalizeRecepcionResponse(r(JSON.stringify({ estado: "Estado desconocido raro", codigo: "1" }))).status).not.toBe(
      "accepted",
    );
  });

  it("pero el código de RECHAZO sí manda sobre un texto ambiguo", () => {
    // Esta dirección sí queremos conservarla: cualquier señal de rechazo gana.
    expect(normalizeRecepcionResponse(r(JSON.stringify({ estado: "Aceptado", codigo: "2" }))).status).toBe("rejected");
  });
});

describe("v582b — la aprobación comercial lee igual que el resto", () => {
  it("«Aprobacion Comercial No Aprobada» con codigo 2 es un rechazo", () => {
    // El arreglo de v582 se aplicó a un lector de veredicto y no al paralelo, 220 líneas
    // más abajo en el mismo archivo.
    expect(normalizeAcecfResponse(r(JSON.stringify({ codigo: "2", estado: "Aprobacion Comercial No Aprobada" }))).status).toBe(
      "rejected",
    );
  });

  it("«No Aceptada» con codigo 2, también", () => {
    expect(normalizeAcecfResponse(r(JSON.stringify({ codigo: "2", estado: "No Aceptada" }))).status).toBe("rejected");
  });

  it("y una aprobación de verdad se sigue leyendo bien", () => {
    expect(normalizeAcecfResponse(r(JSON.stringify({ codigo: "1", estado: "Aprobacion Comercial Aprobada." }))).status).toBe(
      "accepted",
    );
  });
});
