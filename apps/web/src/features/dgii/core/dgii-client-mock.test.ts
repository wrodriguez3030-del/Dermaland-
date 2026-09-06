// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  requestSemilla,
  validarSemilla,
  recepcionEcf,
  consultarEstadoTrackId,
} from "./dgii-client";
import type { DgiiHttpRequest, DgiiHttpResponse, DgiiHttpTransport } from "./dgii-http-transport-types";

/** Mock transport: respuestas canned por substring de URL. Registra lo recibido. */
function mockTransport(map: (req: DgiiHttpRequest) => DgiiHttpResponse) {
  const calls: DgiiHttpRequest[] = [];
  const transport: DgiiHttpTransport = { async request(req) { calls.push(req); return map(req); } };
  return { transport, calls };
}
const baseUrl = "https://mock.local/testecf";
const t = (transport: DgiiHttpTransport) => ({ transport, baseUrl, timeoutMs: 1000 });

describe("primitivas HTTP con transporte inyectable (sin fetch real)", () => {
  it("requestSemilla devuelve seedXml", async () => {
    const m = mockTransport(() => ({ status: 200, bodyText: "<SemillaModel>seed</SemillaModel>", headersRedacted: {}, elapsedMs: 1 }));
    const r = await requestSemilla(t(m.transport));
    expect(r.seedXml).toContain("SemillaModel");
    expect(m.calls[0]!.url).toContain("Autenticacion/api/Autenticacion/Semilla");
  });

  it("validarSemilla devuelve token (JSON) y envía multipart", async () => {
    const m = mockTransport(() => ({ status: 200, bodyText: '{"token":"MOCK-TOKEN"}', headersRedacted: {}, elapsedMs: 1 }));
    const r = await validarSemilla({ ...t(m.transport), signedSeedXml: "<SignedSeed/>" });
    expect(r.token).toBe("MOCK-TOKEN");
    expect(m.calls[0]!.method).toBe("POST");
    expect(m.calls[0]!.body).toBeInstanceOf(FormData);
  });

  it("recepcionEcf devuelve trackId normalizado (submitted) y manda Authorization", async () => {
    const m = mockTransport(() => ({ status: 200, bodyText: "<trackId>TRK-77</trackId>", headersRedacted: {}, elapsedMs: 1 }));
    const r = await recepcionEcf({ ...t(m.transport), token: "MOCK-TOKEN", signedXml: "<ECF/>", eNcf: "E320000000001" });
    expect(r.status).toBe("submitted");
    expect(r.trackId).toBe("TRK-77");
    expect(m.calls[0]!.headers?.Authorization).toBe("Bearer MOCK-TOKEN");
  });

  it("consultarEstadoTrackId normaliza accepted/rejected/in_process", async () => {
    const make = (estado: string) => mockTransport(() => ({ status: 200, bodyText: `<estado>${estado}</estado>`, headersRedacted: {}, elapsedMs: 1 }));
    expect((await consultarEstadoTrackId({ ...t(make("Aceptado").transport), token: "T", trackId: "X" })).status).toBe("accepted");
    expect((await consultarEstadoTrackId({ ...t(make("Rechazado").transport), token: "T", trackId: "X" })).status).toBe("rejected");
    expect((await consultarEstadoTrackId({ ...t(make("En Proceso").transport), token: "T", trackId: "X" })).status).toBe("in_process");
  });

  it("ninguna primitiva llama fetch real", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const m = mockTransport(() => ({ status: 200, bodyText: "<SemillaModel/>", headersRedacted: {}, elapsedMs: 1 }));
    await requestSemilla(t(m.transport));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("status no-200 en semilla → DgiiHttpError (no expone body)", async () => {
    const m = mockTransport(() => ({ status: 500, bodyText: "<error>secreto interno</error>", headersRedacted: {}, elapsedMs: 1 }));
    await expect(requestSemilla(t(m.transport))).rejects.toMatchObject({ name: "DgiiHttpError" });
  });
});
