/**
 * Mock/adapter DGII (Fase 11A) — adapter PURO, sin servidor HTTP ni fetch.
 * Simula Semilla → ValidarSemilla → Recepción e-CF → Estado por TrackId.
 * NO toca DGII. NO representa aceptación fiscal real.
 */
import type {
  DgiiMockScenario,
  DgiiMockServer,
  MockRecepcionResult,
  MockStatusResult,
  MockValidarSemillaResult,
} from "./dgii-mock-types";

/** Error de timeout simulado (no hay red real). */
export class DgiiMockTimeoutError extends Error {
  constructor() {
    super("DGII mock: timeout simulado.");
    this.name = "DgiiMockTimeoutError";
  }
}

/** TrackId fake determinístico por eNCF (no aleatorio: tests reproducibles). */
function fakeTrackId(eNcf: string): string {
  let acc = 0;
  for (let i = 0; i < eNcf.length; i++) acc = (acc * 31 + eNcf.charCodeAt(i)) >>> 0;
  return `MOCK-${acc.toString(16).padStart(8, "0").toUpperCase()}`;
}

export function createDgiiMockServer(scenario: DgiiMockScenario): DgiiMockServer {
  return {
    scenario,
    semilla: () => ({
      status: 200,
      seedXml: `<SemillaModel><valor>MOCK-SEED-${scenario}</valor><fecha>2026-06-09T00:00:00Z</fecha></SemillaModel>`,
      expiresAt: "2026-06-09T01:00:00Z",
    }),

    validarSemilla: (signedSeedXml: string): MockValidarSemillaResult => {
      if (typeof signedSeedXml !== "string" || signedSeedXml.trim() === "") {
        return { status: 401, error: "Semilla firmada inválida (mock)." };
      }
      if (scenario === "unauthorized_401") return { status: 401, error: "Token inválido / certificado no autorizado (mock)." };
      return { status: 200, token: `MOCK-TOKEN-${scenario}`, expiresAt: "2026-06-09T01:00:00Z" };
    },

    recepcion: (meta: { eNcf: string }): MockRecepcionResult => {
      switch (scenario) {
        case "timeout":
          return { status: 0, timedOut: true };
        case "schema_error_400":
          return { status: 400, error: "Esquema inválido (mock)." };
        case "forbidden_403":
          return { status: 403, error: "Contribuyente no autorizado (mock)." };
        case "rate_limited_429":
          return { status: 429, error: "Rate limit (mock)." };
        case "server_error_5xx":
          return { status: 500, error: "DGII no disponible (mock)." };
        case "unauthorized_401":
          // Si llegó a recepción sin token válido, también falla.
          return { status: 403, error: "Sin token válido (mock)." };
        default:
          return { status: 200, trackId: fakeTrackId(meta.eNcf) };
      }
    },

    consultarEstado: (trackId: string): MockStatusResult => {
      const base = { trackId };
      switch (scenario) {
        case "accepted":
          return { ...base, estado: "accepted", codigo: "1", mensaje: "Aceptado (mock)" };
        case "accepted_conditional":
          return { ...base, estado: "accepted_conditional", codigo: "2", mensaje: "Aceptado condicional (mock)" };
        case "rejected":
        case "schema_error_400":
          return { ...base, estado: "rejected", codigo: "3", mensaje: "Rechazado (mock)" };
        case "timeout":
        case "unauthorized_401":
        case "forbidden_403":
        case "rate_limited_429":
        case "server_error_5xx":
          return { ...base, estado: "error", codigo: "9", mensaje: "Error de transporte (mock)" };
        default:
          return { ...base, estado: "in_process", codigo: "0", mensaje: "En proceso (mock)" };
      }
    },
  };
}

/** Estado local que correspondería al escenario (para la máquina de estados). */
export function scenarioToLocalStatus(scenario: DgiiMockScenario): "accepted" | "accepted_conditional" | "rejected" | "in_process" | "error" {
  switch (scenario) {
    case "accepted": return "accepted";
    case "accepted_conditional": return "accepted_conditional";
    case "rejected":
    case "schema_error_400": return "rejected";
    default: return "error";
  }
}
