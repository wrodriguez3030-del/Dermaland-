// Portada de agendapp: tests/unit/dgii-seed-flow.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { executeDgiiSubmission } from "./dgii-client";
import { signDgiiSeedXml, verifyDgiiSeedSignature } from "./seed-signer";
import { getDummyCert } from "./__port__/dgii-test-cert";
import type { DgiiHttpRequest, DgiiHttpResponse, DgiiHttpTransport } from "./dgii-http-transport-types";
import type { PreparedDgiiSubmission } from "./dgii-client-types";

const prepared: PreparedDgiiSubmission = { method: "POST", endpointUrl: "x", headersRedacted: {}, multipartParts: [], contentLength: 1, xmlSha256: "a", eNcf: "E320000000001", tipoEcf: "32", ambiente: "testecf", executed: false };

/** Captura las requests para inspeccionar la semilla firmada enviada a ValidarSemilla. */
function flowTransport() {
  const calls: DgiiHttpRequest[] = [];
  const transport: DgiiHttpTransport = {
    async request(req): Promise<DgiiHttpResponse> {
      calls.push(req);
      const u = req.url.toLowerCase();
      if (u.includes("validarsemilla")) return { status: 200, bodyText: '{"token":"MOCK-TOKEN"}', headersRedacted: {}, elapsedMs: 1 };
      if (u.includes("/semilla")) return { status: 200, bodyText: `<SemillaModel><valor>S-${Date.now()}</valor></SemillaModel>`, headersRedacted: {}, elapsedMs: 1 };
      return { status: 200, bodyText: "<trackId>TRK-FLOW</trackId>", headersRedacted: {}, elapsedMs: 1 };
    },
  };
  return { transport, calls };
}

describe("flujo mock completo: requestSemilla → signSeed → validarSemilla → recepción", () => {
  it("firma la semilla con cert dummy y obtiene trackId (sin fetch real)", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const dummy = getDummyCert();
    const f = flowTransport();
    let signedSeedSent: string | null = null;

    const r = await executeDgiiSubmission({
      mode: "live", prepared, signedXml: "<ECF/>", transport: f.transport,
      baseUrl: "https://mock.local/testecf", timeoutMs: 1000,
      manualConfirmation: true, gates: { envSendEnabled: true, tenantRealSendEnabled: true, readyForTestecf: true },
      signSeed: (seedXml) => {
        const out = signDgiiSeedXml({ seedXml, certificatePem: dummy.certificatePem, privateKeyPem: dummy.privateKeyPem }).signedSeedXml;
        signedSeedSent = out;
        return out;
      },
    });

    expect(r.executed).toBe(true);
    expect(r.status).toBe("submitted");
    expect(r.trackId).toBe("TRK-FLOW");
    // La semilla firmada fue válida y se envió a ValidarSemilla (como FormData).
    expect(signedSeedSent).toBeTruthy();
    expect(verifyDgiiSeedSignature({ signedSeedXml: signedSeedSent! }).ok).toBe(true);
    const validarCall = f.calls.find((c) => c.url.toLowerCase().includes("validarsemilla"));
    expect(validarCall?.body).toBeInstanceOf(FormData);
    expect(spy).not.toHaveBeenCalled(); // transporte inyectado, no fetch real
    spy.mockRestore();
  });

  it("la semilla firmada NO aparece en el resultado devuelto", async () => {
    const dummy = getDummyCert();
    const f = flowTransport();
    const r = await executeDgiiSubmission({
      mode: "live", prepared, signedXml: "<ECF/>", transport: f.transport,
      baseUrl: "https://mock.local/testecf", timeoutMs: 1000, manualConfirmation: true,
      gates: { envSendEnabled: true, tenantRealSendEnabled: true, readyForTestecf: true },
      signSeed: (seedXml) => signDgiiSeedXml({ seedXml, certificatePem: dummy.certificatePem, privateKeyPem: dummy.privateKeyPem }).signedSeedXml,
    });
    const blob = JSON.stringify(r);
    expect(blob).not.toContain("Signature");
    expect(blob).not.toContain("X509Certificate");
    expect(blob).not.toContain("MOCK-TOKEN");
  });
});
