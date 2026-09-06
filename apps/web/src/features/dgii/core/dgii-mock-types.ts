/**
 * Tipos del mock/adapter DGII (Fase 11A). Simulan el flujo sin red real.
 * NUNCA representan aceptación fiscal real.
 */

export type DgiiMockScenario =
  | "accepted"
  | "accepted_conditional"
  | "rejected"
  | "timeout"
  | "unauthorized_401"
  | "forbidden_403"
  | "schema_error_400"
  | "rate_limited_429"
  | "server_error_5xx";

export type MockSemillaResult = { status: 200; seedXml: string; expiresAt: string };

export type MockValidarSemillaResult =
  | { status: 200; token: string; expiresAt: string }
  | { status: 401; error: string };

export type MockRecepcionResult =
  | { status: 200; trackId: string }
  | { status: 400 | 403 | 429 | 500; error: string }
  | { status: 0; timedOut: true };

export type MockEstado = "in_process" | "accepted" | "accepted_conditional" | "rejected" | "error";

export type MockStatusResult = {
  trackId: string;
  estado: MockEstado;
  codigo: string;
  mensaje: string;
};

export type DgiiMockServer = {
  scenario: DgiiMockScenario;
  semilla: () => MockSemillaResult;
  validarSemilla: (signedSeedXml: string) => MockValidarSemillaResult;
  recepcion: (meta: { eNcf: string }) => MockRecepcionResult;
  consultarEstado: (trackId: string) => MockStatusResult;
};
