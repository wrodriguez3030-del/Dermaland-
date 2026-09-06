// Portada de agendapp: tests/unit/dgii-response-normalizer.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { normalizeRecepcionResponse, normalizeEstadoResponse, seedHttpErrorMessage } from "./dgii-response-normalizer";
import type { DgiiHttpResponse } from "./dgii-http-transport-types";

const r = (status: number, bodyText: string): DgiiHttpResponse => ({ status, bodyText, headersRedacted: {}, elapsedMs: 1 });

describe("normalizeRecepcionResponse", () => {
  it("200 con trackId XML → submitted", () => {
    const n = normalizeRecepcionResponse(r(200, "<Resp><trackId>TRK-9</trackId></Resp>"));
    expect(n.status).toBe("submitted");
    expect(n.trackId).toBe("TRK-9");
  });
  it("200 con trackId JSON → submitted", () => {
    const n = normalizeRecepcionResponse(r(200, '{"trackId":"ABC123"}'));
    expect(n.trackId).toBe("ABC123");
    expect(n.status).toBe("submitted");
  });
  it("200 sin trackId ni estado → error", () => {
    expect(normalizeRecepcionResponse(r(200, "<ok/>")).status).toBe("error");
  });
  it("400 CON detalle de la DGII → rejected; 401/403/404/429/5xx → error", () => {
    /**
     * v581 — Este `r(400, "bad")` esperando «rejected» era justo el caso que quemaba un
     * e-NCF: un cuerpo sin código, sin estado y sin mensajes no prueba que la DGII llegara
     * a evaluar el comprobante, y `rejected` es terminal. Ahora el rechazo exige el detalle
     * que la DGII sí manda cuando rechaza de verdad.
     */
    expect(normalizeRecepcionResponse(r(400, JSON.stringify({ codigo: 176, estado: "Rechazado" }))).status).toBe("rejected");
    expect(normalizeRecepcionResponse(r(400, "bad")).status).toBe("error");
    expect(normalizeRecepcionResponse(r(401, "")).status).toBe("error");
    expect(normalizeRecepcionResponse(r(403, "")).status).toBe("error");
    expect(normalizeRecepcionResponse(r(404, "")).status).toBe("error");
    expect(normalizeRecepcionResponse(r(429, "")).status).toBe("error");
    expect(normalizeRecepcionResponse(r(503, "")).status).toBe("error");
  });
  it("no incluye el body completo en el mensaje", () => {
    const big = "X".repeat(5000);
    const n = normalizeRecepcionResponse(r(400, big));
    expect(n.message.length).toBeLessThan(220);
    expect(n.message).not.toContain(big);
  });
});

describe("normalizeEstadoResponse", () => {
  it("mapea estados", () => {
    expect(normalizeEstadoResponse(r(200, "<estado>Aceptado</estado>"), "T").status).toBe("accepted");
    expect(normalizeEstadoResponse(r(200, "<estado>Aceptado Condicional</estado>"), "T").status).toBe("accepted_conditional");
    expect(normalizeEstadoResponse(r(200, "<estado>Rechazado</estado>"), "T").status).toBe("rejected");
    expect(normalizeEstadoResponse(r(200, "<estado>En Proceso</estado>"), "T").status).toBe("in_process");
  });
  it("conserva el trackId provisto si no viene en el body", () => {
    expect(normalizeEstadoResponse(r(200, "<estado>En Proceso</estado>"), "TRK-7").trackId).toBe("TRK-7");
  });
  it("HTTP error → error", () => {
    expect(normalizeEstadoResponse(r(500, ""), "T").status).toBe("error");
  });
});

describe("seedHttpErrorMessage", () => {
  it("mensajes seguros por status, sin body/token", () => {
    expect(seedHttpErrorMessage(0, "semilla")).toMatch(/timeout/i);
    expect(seedHttpErrorMessage(400, "validar_semilla")).toContain("400");
    expect(seedHttpErrorMessage(401, "validar_semilla")).toContain("401");
    expect(seedHttpErrorMessage(403, "validar_semilla")).toContain("403");
    expect(seedHttpErrorMessage(429, "semilla")).toContain("429");
    expect(seedHttpErrorMessage(503, "semilla")).toMatch(/no est[áa] disponible/i);
    // nunca incluye token/semilla
    for (const s of [0, 400, 401, 403, 429, 503]) {
      expect(seedHttpErrorMessage(s, "validar_semilla")).not.toMatch(/token=|Bearer|SignedSeed/);
    }
    // v532 — El cuerpo de DGII SÍ se cita (es lo único que explica el fallo), pero sigue sin
    // arrastrar secretos: lo que se pasa es la respuesta de error, nunca la semilla firmada.
    const conCuerpo = seedHttpErrorMessage(400, "validar_semilla", '"Tipo de certificado no admitido"');
    expect(conCuerpo).toMatch(/Tipo de certificado no admitido/);
    expect(conCuerpo).not.toMatch(/token=|Bearer|SignedSeed/);
  });
});
