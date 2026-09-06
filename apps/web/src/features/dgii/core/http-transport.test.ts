// Portada de agendapp: tests/unit/dgii-http-transport.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { createFetchTransport, createDisabledTransport } from "./dgii-http-transport";
import { DgiiHttpError } from "./dgii-http-transport-types";

afterEach(() => vi.restoreAllMocks());

function fakeResponse(status: number, body: string, headers: Record<string, string> = {}) {
  return { status, text: async () => body, headers: new Headers(headers) } as unknown as Response;
}

describe("createFetchTransport", () => {
  it("devuelve status/bodyText y redacta Authorization en headers", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(fakeResponse(200, "<ok/>", { authorization: "Bearer secret", "content-type": "text/xml" }));
    const t = createFetchTransport();
    const res = await t.request({ method: "GET", url: "https://mock.local/x", timeoutMs: 1000 });
    expect(res.status).toBe(200);
    expect(res.bodyText).toBe("<ok/>");
    expect(res.headersRedacted.authorization).toBe("<redacted>");
    expect(res.headersRedacted["content-type"]).toBe("text/xml");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("trunca bodies grandes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(fakeResponse(200, "Y".repeat(300_000)));
    const res = await createFetchTransport().request({ method: "GET", url: "https://mock.local/x", timeoutMs: 1000 });
    expect(res.bodyText.endsWith("…[truncated]")).toBe(true);
  });

  it("AbortError → DgiiHttpError timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await expect(createFetchTransport().request({ method: "GET", url: "https://mock.local/x", timeoutMs: 5 }))
      .rejects.toMatchObject({ code: "timeout" });
  });

  it("error de red → DgiiHttpError network", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
    await expect(createFetchTransport().request({ method: "GET", url: "https://mock.local/x", timeoutMs: 1000 }))
      .rejects.toBeInstanceOf(DgiiHttpError);
  });
});

describe("createDisabledTransport", () => {
  it("siempre lanza transport_disabled, sin fetch", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(createDisabledTransport().request({ method: "GET", url: "x", timeoutMs: 1 }))
      .rejects.toMatchObject({ code: "transport_disabled" });
    expect(spy).not.toHaveBeenCalled();
  });
});
