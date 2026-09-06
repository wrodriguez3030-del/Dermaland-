// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  prepareTestecfSubmission,
  prepareSemillaRequest,
  prepareValidarSemillaRequest,
  prepareRecepcionEcfRequest,
  prepareStatusTrackIdRequest,
  executeDgiiSubmission,
} from "./dgii-client";
import { DgiiSendDisabledError } from "./killswitches";
import type { PreparedDgiiSubmission } from "./dgii-client-types";

const SIGNED = `<?xml version="1.0" encoding="UTF-8"?>\n<ECF><Encabezado/></ECF>`;
const prepared: PreparedDgiiSubmission = { method: "POST", endpointUrl: "x", headersRedacted: {}, multipartParts: [], contentLength: 1, xmlSha256: "a", eNcf: "E320000000001", tipoEcf: "32", ambiente: "testecf", executed: false };

describe("prepareTestecfSubmission", () => {
  it("arma request (executed=false) con sha256 y sin XML", () => {
    const p = prepareTestecfSubmission({ signedXml: SIGNED, tipoEcf: "32", eNcf: "E320000000001", ambiente: "testecf" });
    expect(p.executed).toBe(false);
    expect(p.xmlSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(p.endpointUrl).toBe("https://ecf.dgii.gov.do/testecf/recepcion/api/facturaselectronicas");
    expect(JSON.stringify(p)).not.toContain("<Encabezado");
  });
});

describe("prepare*Request (preview, sin fetch)", () => {
  it("no llaman fetch y redactan Authorization", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(prepareSemillaRequest("testecf").endpointUrl).toContain("Autenticacion/api/Autenticacion/Semilla");
    expect(prepareValidarSemillaRequest("testecf").endpointUrl).toContain("Autenticacion/api/Autenticacion/ValidarSemilla");
    expect(prepareRecepcionEcfRequest({ signedXml: SIGNED, tipoEcf: "32", eNcf: "E320000000001", ambiente: "testecf" }).executed).toBe(false);
    expect(prepareStatusTrackIdRequest("testecf", "TRK-1").headersRedacted.Authorization).toContain("redacted");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("executeDgiiSubmission — bloqueado por defecto", () => {
  it("sin mode (disabled) rechaza con DgiiSendDisabledError, sin fetch", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(executeDgiiSubmission({ prepared })).rejects.toBeInstanceOf(DgiiSendDisabledError);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("future-live sigue bloqueado", async () => {
    await expect(executeDgiiSubmission({ prepared, mode: "future-live" })).rejects.toBeInstanceOf(DgiiSendDisabledError);
  });
});
