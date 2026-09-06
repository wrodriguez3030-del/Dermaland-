// Portada de agendapp: tests/unit/dgii-condicional-no-se-atasca-v615.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { ALLOWED_TRANSITIONS, evaluateTransition } from "./submission-state-machine";
import type { TransitionInput } from "./submission-state-types";
import { estadoTrasEnvio } from "./estado-tras-envio";

/**
 * v615 — Un comprobante aceptado con condiciones no puede quedarse colgado.
 *
 * `ALLOWED_TRANSITIONS` daba a `submitted` los destinos `in_process`, `accepted`,
 * `rejected` y `error`, pero no `accepted_conditional` — que `in_process` sí tenía. Y la
 * DGII puede responder «aceptado condicional» en la propia respuesta del envío: el
 * normalizador lo devuelve (`dgii-response-normalizer.ts`) y `estadoTrasEnvio` lo promueve.
 *
 * O sea: el veredicto llegaba, la transición se rechazaba por no estar en el grafo, y el
 * comprobante se quedaba en «Enviado, esperando respuesta» para siempre, con la DGII
 * habiéndolo aceptado. Nadie lo había visto porque todavía no ha pasado: hoy hay quince
 * aceptados y dos rechazados, ninguno condicional. Se arregla antes, no después.
 *
 * Ningún test fijaba la ausencia: era un olvido, no una decisión.
 */

const conEvidencia: TransitionInput = {
  currentStatus: "submitted",
  targetStatus: "accepted_conditional",
  // El comprobante ya se envió: por eso está en `submitted`.
  hasPreparedSubmission: true,
  realSendAllowed: true,
  ambiente: "ecf",
  trackId: "3f5d8a12-0000-4000-8000-000000000000",
};

describe("v615 — el grafo admite la aceptación condicional al enviar", () => {
  it("`submitted` puede pasar a `accepted_conditional`", () => {
    expect(
      ALLOWED_TRANSITIONS.submitted,
      "un condicional directo se queda atascado en «enviado»",
    ).toContain("accepted_conditional");
  });

  it("y `in_process` lo sigue admitiendo, como antes", () => {
    expect(ALLOWED_TRANSITIONS.in_process).toContain("accepted_conditional");
  });

  it("sigue siendo terminal: de ahí no se sale", () => {
    // La DGII ya se pronunció. Reabrirlo sería inventar un veredicto posterior.
    expect(ALLOWED_TRANSITIONS.accepted_conditional).toEqual([]);
  });

  it("la transición se permite cuando hay evidencia", () => {
    const r = evaluateTransition(conEvidencia);
    expect(r.allowed, `bloqueada: ${r.blockingReasons.join(" · ")}`).toBe(true);
  });
});

describe("v615 — abrirlo NO abre la puerta a una aceptación inventada", () => {
  /**
   * La guarda que importa: «No se puede marcar aceptado sin trackId/respuesta DGII». Ya
   * cubría `accepted_conditional` antes de este cambio, y tiene que seguir cubriéndolo —
   * es la única salvaguarda contra escribir un veredicto que nadie dio, y es exactamente
   * lo que v577 dejó fuera del camino cuando empezó a escribir «accepted».
   */
  it("sin trackId ni respuesta, se rechaza", () => {
    const r = evaluateTransition({ ...conEvidencia, trackId: null });
    expect(r.allowed, "se aceptó con condiciones sin una sola prueba").toBe(false);
    expect(r.blockingReasons.join(" ")).toMatch(/sin trackId|respuesta DGII/i);
  });

  it("con respuesta simulada se permite, pero avisando de que no es fiscal", () => {
    const r = evaluateTransition({ ...conEvidencia, trackId: null, hasSimulatedResponse: true });
    expect(r.allowed).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/SIMULADA/i);
  });
});

describe("v615 — el veredicto condicional llega de verdad por este camino", () => {
  it("`estadoTrasEnvio` lo promueve cuando la DGII lo dice al enviar", () => {
    // Si no lo promoviera, el grafo daría igual: es lo que hace real el atasco.
    const v = estadoTrasEnvio({
      status: "accepted_conditional",
      trackId: "3f5d8a12-0000-4000-8000-000000000000",
    });
    expect(v).toBe("accepted_conditional");
  });

  it("y ese estado está en el grafo desde `submitted`, que es donde queda tras enviar", () => {
    const v = estadoTrasEnvio({
      status: "accepted_conditional",
      trackId: "3f5d8a12-0000-4000-8000-000000000000",
    });
    expect(ALLOWED_TRANSITIONS.submitted).toContain(v);
  });
});
