// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { executeDgiiSubmission } from "./dgii-client";
import { DgiiSendDisabledError } from "./killswitches";
import type { DgiiHttpResponse, DgiiHttpTransport } from "./dgii-http-transport-types";
import type { ExecuteDgiiSubmissionInput, PreparedDgiiSubmission } from "./dgii-client-types";

const prepared: PreparedDgiiSubmission = { method: "POST", endpointUrl: "x", headersRedacted: {}, multipartParts: [], contentLength: 1, xmlSha256: "a", eNcf: "E320000000001", tipoEcf: "32", ambiente: "testecf", executed: false };

/** Transporte mock que resuelve el flujo Semilla→token→recepción. */
function liveMockTransport(): DgiiHttpTransport {
  return {
    async request(req): Promise<DgiiHttpResponse> {
      const u = req.url.toLowerCase();
      if (u.includes("validarsemilla")) return { status: 200, bodyText: '{"token":"MOCK-TOKEN"}', headersRedacted: {}, elapsedMs: 1 };
      if (u.includes("/semilla")) return { status: 200, bodyText: "<SemillaModel>seed</SemillaModel>", headersRedacted: {}, elapsedMs: 1 };
      return { status: 200, bodyText: "<trackId>TRK-LIVE</trackId>", headersRedacted: {}, elapsedMs: 1 };
    },
  };
}

const okGates = { envSendEnabled: true, tenantRealSendEnabled: true, readyForTestecf: true };
function liveInput(over: Partial<ExecuteDgiiSubmissionInput> = {}): ExecuteDgiiSubmissionInput {
  return {
    mode: "live", prepared, signedXml: "<ECF/>", transport: liveMockTransport(),
    baseUrl: "https://mock.local/testecf", timeoutMs: 1000,
    signSeed: () => "<SignedSeed/>", manualConfirmation: true, gates: okGates, ...over,
  };
}

describe("executeDgiiSubmission — gating live", () => {
  it("killswitch entorno false → bloqueado (antes de tocar transporte)", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(executeDgiiSubmission(liveInput({ gates: { ...okGates, envSendEnabled: false } }))).rejects.toBeInstanceOf(DgiiSendDisabledError);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("dgii_enabled_real_send false → bloqueado", async () => {
    await expect(executeDgiiSubmission(liveInput({ gates: { ...okGates, tenantRealSendEnabled: false } }))).rejects.toBeInstanceOf(DgiiSendDisabledError);
  });
  it("ready_for_testecf false → bloqueado", async () => {
    await expect(executeDgiiSubmission(liveInput({ gates: { ...okGates, readyForTestecf: false } }))).rejects.toBeInstanceOf(DgiiSendDisabledError);
  });
  it("v511 — producción ya NO se bloquea por el ambiente", async () => {
    // Era el último bloqueo de la fase de certificación: vivía en el transporte y por eso no
    // estaba entre los seis que v501 levantó. Con el negocio en `ambiente = ecf` hacía
    // imposible transmitir aunque todos los gates estuvieran abiertos.
    await expect(
      executeDgiiSubmission(liveInput({ prepared: { ...prepared, ambiente: "ecf" } })),
    ).resolves.toMatchObject({ executed: true });
  });

  it("v511 — pero en producción los gates siguen mandando", async () => {
    // Lo que protege ahora son los killswitches, no la fase. Ninguno se relajó.
    for (const gates of [
      { envSendEnabled: false, tenantRealSendEnabled: true, readyForTestecf: true },
      { envSendEnabled: true, tenantRealSendEnabled: false, readyForTestecf: true },
      { envSendEnabled: true, tenantRealSendEnabled: true, readyForTestecf: false },
    ]) {
      await expect(
        executeDgiiSubmission(liveInput({ prepared: { ...prepared, ambiente: "ecf" }, gates })),
      ).rejects.toBeInstanceOf(DgiiSendDisabledError);
    }
  });
  it("sin confirmación manual → bloqueado", async () => {
    await expect(executeDgiiSubmission(liveInput({ manualConfirmation: false }))).rejects.toBeInstanceOf(DgiiSendDisabledError);
  });
  it("sin transporte → bloqueado", async () => {
    await expect(executeDgiiSubmission(liveInput({ transport: undefined }))).rejects.toBeInstanceOf(DgiiSendDisabledError);
  });
});

describe("executeDgiiSubmission — happy path SOLO con mock transport", () => {
  it("con todos los gates + mock transport → submitted + trackId, sin fetch real", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const r = await executeDgiiSubmission(liveInput());
    expect(r.executed).toBe(true);
    expect(r.status).toBe("submitted");
    expect(r.trackId).toBe("TRK-LIVE");
    expect(spy).not.toHaveBeenCalled(); // usó el transporte inyectado, no fetch real
    spy.mockRestore();
  });
});
