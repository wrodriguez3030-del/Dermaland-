// Portada de agendapp: tests/unit/dgii-submission-state-machine.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { evaluateTransition, ALLOWED_TRANSITIONS } from "./submission-state-machine";
import type { TransitionInput } from "./submission-state-types";

function t(over: Partial<TransitionInput> = {}): TransitionInput {
  return {
    currentStatus: "signed",
    targetStatus: "prepared",
    hasPreparedSubmission: true,
    trackId: null,
    ambiente: "testecf",
    realSendAllowed: false,
    ...over,
  };
}

describe("evaluateTransition — válidas (locales)", () => {
  it("signed → prepared permitido", () => {
    const r = evaluateTransition(t());
    expect(r.allowed).toBe(true);
    expect(r.nextStatus).toBe("prepared");
    expect(r.auditAction).toBe("dgii_invoice_status_transition");
  });
  it("signed → cancelled permitido", () => {
    expect(evaluateTransition(t({ targetStatus: "cancelled" })).allowed).toBe(true);
  });
  it("prepared → cancelled permitido", () => {
    expect(evaluateTransition(t({ currentStatus: "prepared", targetStatus: "cancelled" })).allowed).toBe(true);
  });
});

describe("evaluateTransition — inválidas / terminales", () => {
  it("signed → submitted NO está en el grafo (solo prepared→submitted)", () => {
    const r = evaluateTransition(t({ targetStatus: "submitted" }));
    expect(r.allowed).toBe(false);
  });
  it("accepted → signed bloqueado (terminal)", () => {
    const r = evaluateTransition(t({ currentStatus: "accepted", targetStatus: "signed" }));
    expect(r.allowed).toBe(false);
    expect(r.blockingReasons.some((x) => /terminal/i.test(x))).toBe(true);
  });
  it("rejected/cancelled son terminales (sin salidas)", () => {
    expect(ALLOWED_TRANSITIONS.rejected).toEqual([]);
    expect(ALLOWED_TRANSITIONS.cancelled).toEqual([]);
    expect(ALLOWED_TRANSITIONS.accepted).toEqual([]);
  });
});

describe("evaluateTransition — submitted (killswitch)", () => {
  it("prepared → submitted bloqueado si realSendAllowed=false", () => {
    const r = evaluateTransition(t({ currentStatus: "prepared", targetStatus: "submitted", realSendAllowed: false }));
    expect(r.allowed).toBe(false);
    expect(r.blockingReasons.some((x) => /killswitch/i.test(x))).toBe(true);
    expect(r.auditAction).toBe("dgii_submission_status_transition_blocked");
  });
  it("prepared → submitted bloqueado si no hay submission preparado", () => {
    const r = evaluateTransition(t({ currentStatus: "prepared", targetStatus: "submitted", realSendAllowed: true, hasPreparedSubmission: false }));
    expect(r.allowed).toBe(false);
    expect(r.blockingReasons.some((x) => /submission/i.test(x))).toBe(true);
  });
  it("prepared → submitted permitido SOLO con submission + realSendAllowed (escenario futuro)", () => {
    const r = evaluateTransition(t({ currentStatus: "prepared", targetStatus: "submitted", realSendAllowed: true, hasPreparedSubmission: true }));
    expect(r.allowed).toBe(true);
  });
});

describe("evaluateTransition — accepted requiere evidencia", () => {
  it("submitted → accepted bloqueado sin trackId/respuesta", () => {
    const r = evaluateTransition(t({ currentStatus: "submitted", targetStatus: "accepted" }));
    expect(r.allowed).toBe(false);
    expect(r.blockingReasons.some((x) => /trackId|respuesta/i.test(x))).toBe(true);
  });
  it("submitted → accepted permitido con trackId", () => {
    const r = evaluateTransition(t({ currentStatus: "submitted", targetStatus: "accepted", trackId: "TRK-1" }));
    expect(r.allowed).toBe(true);
  });
  it("in_process → accepted_conditional con respuesta simulada (warning no-fiscal)", () => {
    const r = evaluateTransition(t({ currentStatus: "in_process", targetStatus: "accepted_conditional", hasSimulatedResponse: true }));
    expect(r.allowed).toBe(true);
    expect(r.warnings.some((w) => /SIMULAD/i.test(w))).toBe(true);
  });
});

describe("v501 — producción ya no bloquea por fase, pero enviar sigue gateado", () => {
  it("una transición local en producción ya no se bloquea por el ambiente", () => {
    // Antes, `ambiente: "ecf"` invalidaba CUALQUIER transición, incluidas las que no
    // envían nada: marcar preparado, registrar un rechazo. Eso quedó escrito cuando la
    // certificación DGII estaba pendiente; se completó 15/15 el 2026-07-28.
    const r = evaluateTransition(t({ ambiente: "ecf", targetStatus: "prepared" }));
    expect(r.allowed).toBe(true);
    expect(r.blockingReasons).toEqual([]);
  });

  it("pero pasar a 'submitted' en producción SIGUE exigiendo el killswitch de envío", () => {
    // Esta es la línea que de verdad separa «preparado» de «enviado a DGII», y no se tocó.
    const r = evaluateTransition(t({ ambiente: "ecf", currentStatus: "prepared", targetStatus: "submitted", realSendAllowed: false }));
    expect(r.allowed).toBe(false);
    expect(r.blockingReasons.some((x) => /killswitch/i.test(x))).toBe(true);
  });

  it("ni con el killswitch abierto se envía sin submission preparado", () => {
    const r = evaluateTransition(t({ ambiente: "ecf", currentStatus: "prepared", targetStatus: "submitted", realSendAllowed: true, hasPreparedSubmission: false }));
    expect(r.allowed).toBe(false);
    expect(r.blockingReasons.some((x) => /preparado/i.test(x))).toBe(true);
  });
});
