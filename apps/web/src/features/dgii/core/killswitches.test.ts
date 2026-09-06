// Portada de agendapp: tests/unit/dgii-killswitches.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  evaluateDgiiPreflightGates,
  assertDgiiSendAllowed,
  getDgiiSendEnvironmentFlags,
  DgiiSendDisabledError,
  type PreflightGateInput,
} from "./killswitches";

function baseGates(over: Partial<PreflightGateInput> = {}): PreflightGateInput {
  return {
    targetAmbiente: "testecf",
    tenantAmbiente: "testecf",
    settingsExists: true,
    dgiiEnabledRealSend: false,
    hasActiveCertificate: true,
    certificateExpired: false,
    hasActiveSequence: true,
    sequenceExhausted: false,
    postulationConfirmed: false,
    rangeAuthorized: false,
    userConfirmed: false,
    canWriteDgii: true,
    envFlags: { testecf: false, certecf: false, prod: false },
    ...over,
  };
}

describe("getDgiiSendEnvironmentFlags", () => {
  it("default false salvo 'true' exacto", () => {
    const prev = { ...process.env };
    delete process.env.DGII_TESTECF_SEND_ENABLED;
    process.env.DGII_CERTECF_SEND_ENABLED = "1";
    process.env.DGII_PROD_SEND_ENABLED = "true";
    try {
      const f = getDgiiSendEnvironmentFlags();
      expect(f.testecf).toBe(false);
      expect(f.certecf).toBe(false); // "1" no habilita
      expect(f.prod).toBe(true);
    } finally {
      Object.assign(process.env, prev);
      delete process.env.DGII_CERTECF_SEND_ENABLED;
      delete process.env.DGII_PROD_SEND_ENABLED;
    }
  });
});

describe("evaluateDgiiPreflightGates", () => {
  it("Fase 8: nunca permite envío real (postulación/rango/killswitch pendientes)", () => {
    const r = evaluateDgiiPreflightGates(baseGates());
    expect(r.allowed).toBe(false);
    expect(r.blockingReasons.length).toBeGreaterThan(0);
  });

  it("bloquea si el env killswitch del ambiente está apagado", () => {
    const r = evaluateDgiiPreflightGates(baseGates());
    expect(r.blockingReasons.some((x) => /Killswitch de envío testecf/.test(x))).toBe(true);
  });

  it("bloquea si no hay certificado", () => {
    const r = evaluateDgiiPreflightGates(baseGates({ hasActiveCertificate: false }));
    expect(r.blockingReasons.some((x) => /certificado activo/i.test(x))).toBe(true);
    expect(r.checklist.find((c) => c.key === "cert_active")?.ok).toBe(false);
  });

  it("bloquea si no hay secuencia", () => {
    const r = evaluateDgiiPreflightGates(baseGates({ hasActiveSequence: false }));
    expect(r.blockingReasons.some((x) => /secuencia/i.test(x))).toBe(true);
  });

  it("bloquea si la postulación no está confirmada", () => {
    const r = evaluateDgiiPreflightGates(baseGates({ postulationConfirmed: false }));
    expect(r.blockingReasons.some((x) => /Postulación/i.test(x))).toBe(true);
  });

  it("v501 — producción ya no se bloquea POR FASE, pero sus gates reales siguen", () => {
    // El bloqueo de fase devolvía `blocked` sin mirar nada más, y con eso TAPABA los gates
    // que sí importan: el dueño no podía ver cuál le faltaba realmente.
    const r = evaluateDgiiPreflightGates(baseGates({ targetAmbiente: "ecf", tenantAmbiente: "ecf" }));
    expect(r.blockingReasons.some((x) => /Producción fiscal/i.test(x)), "quedó el bloqueo de fase").toBe(false);
    // Sigue sin permitirse: el fixture tiene el killswitch de entorno apagado y la
    // postulación, el rango y la confirmación manual pendientes.
    expect(r.allowed).toBe(false);
    for (const esperado of [/Killswitch/i, /Postulación/i, /Rango/i, /Confirmación/i]) {
      expect(r.blockingReasons.some((x) => esperado.test(x)), `falta el gate ${esperado}`).toBe(true);
    }
  });

  it("v501 — en producción, con TODO cumplido, el preflight permite", () => {
    // La contracara del test de arriba: si el bloqueo de fase siguiera puesto, este caso
    // sería imposible de alcanzar y nadie notaría que la app no puede facturar nunca.
    const r = evaluateDgiiPreflightGates(
      baseGates({
        targetAmbiente: "ecf", tenantAmbiente: "ecf",
        envFlags: { testecf: false, certecf: false, prod: true },
        postulationConfirmed: true, rangeAuthorized: true, userConfirmed: true,
      }),
    );
    expect(r.blockingReasons, `todavía bloquea: ${r.blockingReasons.join(" · ")}`).toEqual([]);
    expect(r.allowed).toBe(true);
  });

  it("RBAC denegado → mode=blocked", () => {
    const r = evaluateDgiiPreflightGates(baseGates({ canWriteDgii: false }));
    expect(r.mode).toBe("blocked");
  });

  it("estructural completo pero killswitch/postulación off → mode=future-live", () => {
    const r = evaluateDgiiPreflightGates(baseGates());
    expect(r.mode).toBe("future-live");
    expect(r.allowed).toBe(false);
  });

  it("certificado vencido → bloquea", () => {
    const r = evaluateDgiiPreflightGates(baseGates({ certificateExpired: true }));
    expect(r.blockingReasons.some((x) => /vencido/i.test(x))).toBe(true);
  });
});

describe("assertDgiiSendAllowed", () => {
  it("lanza DgiiSendDisabledError cuando no está permitido", () => {
    const r = evaluateDgiiPreflightGates(baseGates());
    expect(() => assertDgiiSendAllowed(r)).toThrow(DgiiSendDisabledError);
  });
});
