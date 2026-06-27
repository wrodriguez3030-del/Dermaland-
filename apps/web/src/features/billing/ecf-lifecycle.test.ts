import { describe, expect, it } from "vitest";
import { DEFAULT_BILLING_SETTINGS } from "./billing-settings-store";
import {
  applyEcfEvent,
  canTransition,
  evaluateRealSendGuard,
  isTerminal,
  simulateEcfFlow,
  type RealSendPreconditions,
} from "./ecf-lifecycle";

describe("máquina de estados e-CF", () => {
  it("transición válida: borrador → generado_xml", () => {
    const r = applyEcfEvent("borrador", "generar_xml");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state).toBe("generado_xml");
  });

  it("transición inválida: no se puede firmar desde borrador", () => {
    const r = applyEcfEvent("borrador", "firmar");
    expect(r.ok).toBe(false);
  });

  it("camino feliz completo hasta almacenado", () => {
    let state: import("./ecf-lifecycle").EcfState = "borrador";
    const events = [
      "generar_xml",
      "firmar",
      "enviar_dgii",
      "recibir_dgii",
      "aceptar",
      "enviar_receptor",
      "recibir_acuse",
      "aprobar_comercial",
      "almacenar",
    ] as const;
    for (const e of events) {
      const r = applyEcfEvent(state, e);
      expect(r.ok).toBe(true);
      if (r.ok) state = r.state;
    }
    expect(state).toBe("almacenado");
    expect(isTerminal(state)).toBe(true);
  });

  it("estados terminales no transicionan", () => {
    expect(canTransition("almacenado", "anular")).toBe(false);
    expect(canTransition("rechazado", "aceptar")).toBe(false);
    expect(canTransition("anulado", "generar_xml")).toBe(false);
  });

  it("aceptado puede anularse", () => {
    expect(canTransition("aceptado", "anular")).toBe(true);
  });

  it("pendiente puede resolverse a aceptado o rechazado", () => {
    expect(canTransition("pendiente", "aceptar")).toBe(true);
    expect(canTransition("pendiente", "rechazar")).toBe(true);
  });
});

describe("guard de envío real", () => {
  const allTrue: RealSendPreconditions = {
    hasValidCertificate: true,
    hasAuthorizedRange: true,
    hasOfficialEndpoint: true,
    isBusinessAuthorized: true,
    isFiscalConfigComplete: true,
  };

  it("mock/demo siempre bloquea el envío real", () => {
    const r = evaluateRealSendGuard(DEFAULT_BILLING_SETTINGS, allTrue);
    expect(r.allowed).toBe(false);
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it("bloquea si falta certificado aunque sea producción", () => {
    const prod = {
      ...DEFAULT_BILLING_SETTINGS,
      ecfEnvironment: "produccion" as const,
      realEmissionEnabled: true,
    };
    const r = evaluateRealSendGuard(prod, {
      ...allTrue,
      hasValidCertificate: false,
    });
    expect(r.allowed).toBe(false);
    expect(r.blockers.some((b) => /certificado/i.test(b))).toBe(true);
  });

  it("permite solo con producción + emisión real + todas las precondiciones", () => {
    const prod = {
      ...DEFAULT_BILLING_SETTINGS,
      ecfEnvironment: "produccion" as const,
      realEmissionEnabled: true,
    };
    const r = evaluateRealSendGuard(prod, allTrue);
    expect(r.allowed).toBe(true);
    expect(r.blockers).toEqual([]);
  });
});

describe("simulación de flujo mock", () => {
  it("aceptado: recorre hasta almacenado, sin tocar DGII real ni secuencia real", () => {
    const flow = simulateEcfFlow({
      ecfNumber: "E320000000095",
      settings: DEFAULT_BILLING_SETTINGS,
    });
    expect(flow.finalState).toBe("almacenado");
    expect(flow.isMock).toBe(true);
    expect(flow.consumedRealSequence).toBe(false);
    expect(flow.demoTrackId).toContain("DEMO-");
    // El paso de envío deja claro que fue simulado.
    expect(flow.steps.some((s) => /SIMULADO/i.test(s.detail))).toBe(true);
  });

  it("rechazado: termina en rechazado", () => {
    const flow = simulateEcfFlow({
      ecfNumber: "E320000000096",
      settings: DEFAULT_BILLING_SETTINGS,
      outcome: "rechazado",
    });
    expect(flow.finalState).toBe("rechazado");
  });

  it("pendiente: termina en pendiente", () => {
    const flow = simulateEcfFlow({
      ecfNumber: "E320000000097",
      settings: DEFAULT_BILLING_SETTINGS,
      outcome: "pendiente",
    });
    expect(flow.finalState).toBe("pendiente");
  });
});
