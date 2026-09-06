// Portada de agendapp: tests/unit/dgii-certecf-rejection-diagnostic-v386.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  extractDgiiMessages, normalizeEstadoResponse, normalizeRecepcionResponse,
} from "./dgii-response-normalizer";
import type { DgiiHttpResponse } from "./dgii-http-transport-types";
import { rutaPortada, leerSiExiste } from "./__port__/rutas";

/**
 * v386 — Diagnóstico del rechazo CerteCF. El parser DEBE conservar el motivo real de DGII
 * (antes el rechazo quedaba solo como "Rechazado"). La consulta por TrackId es read-only y
 * funciona con el gate apagado. La UI muestra el detalle y bloquea el avance.
 */
const read = (p: string) => readFileSync(rutaPortada(p), "utf8");
const httpOf = (status: number, bodyText: string): DgiiHttpResponse => ({ status, headersRedacted: {}, bodyText, elapsedMs: 1 });

describe("v386 — extractDgiiMessages recupera el motivo (antes se descartaba)", () => {
  it("JSON con mensajes:[{valor,codigo}] → mensajes con código", () => {
    const body = JSON.stringify({
      trackId: "389aec90", codigo: 1, estado: "Rechazado", rnc: "131561985", encf: "E310000000001",
      mensajes: [{ valor: "Fecha de emisión inválida", codigo: 2 }, { valor: "RNC comprador no registrado", codigo: 5 }],
    });
    const msgs = extractDgiiMessages(body);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toContain("Fecha de emisión inválida");
    expect(msgs[0]).toContain("[2]");
    expect(msgs[1]).toContain("RNC comprador no registrado");
  });
  it("JSON con errores anidados + mensaje top-level", () => {
    const body = JSON.stringify({ estado: "Rechazado", errores: ["Firma no corresponde"], mensaje: "Documento rechazado" });
    const msgs = extractDgiiMessages(body);
    expect(msgs.some((m) => m.includes("Firma no corresponde"))).toBe(true);
  });
  it("XML con <mensaje> → los captura", () => {
    const msgs = extractDgiiMessages("<Resp><estado>Rechazado</estado><mensajes><mensaje>Monto ITBIS incorrecto</mensaje></mensajes></Resp>");
    expect(msgs.some((m) => m.includes("Monto ITBIS incorrecto"))).toBe(true);
  });
  it("sin mensajes → []", () => {
    expect(extractDgiiMessages(JSON.stringify({ estado: "Aceptado" }))).toEqual([]);
  });
});

describe("v386 — normalizadores pueblan messages + code", () => {
  it("estado Rechazado + mensajes → status rejected, messages, code", () => {
    const body = JSON.stringify({ trackId: "389aec90", codigo: 1, estado: "Rechazado", mensajes: [{ valor: "Campo X inválido", codigo: 9 }] });
    const r = normalizeEstadoResponse(httpOf(200, body), "389aec90");
    expect(r.status).toBe("rejected");
    expect(r.messages.length).toBe(1);
    expect(r.messages[0]).toContain("Campo X inválido");
    expect(r.code).toBe("1");
  });
  it("estado Aceptado → accepted, messages [] (backward-compatible)", () => {
    const r = normalizeEstadoResponse(httpOf(200, JSON.stringify({ estado: "Aceptado", trackId: "t" })), "t");
    expect(r.status).toBe("accepted");
    expect(r.messages).toEqual([]);
  });
  it("recepción 200 + trackId → submitted con messages capturados si vienen", () => {
    const r = normalizeRecepcionResponse(httpOf(200, JSON.stringify({ trackId: "t1", mensajes: ["ok recibido"] })));
    expect(r.status).toBe("submitted");
    expect(r.trackId).toBe("t1");
    expect(r.messages).toContain("ok recibido");
  });
  it("no filtra secretos ni body completo (acota)", () => {
    const r = normalizeEstadoResponse(httpOf(200, JSON.stringify({ estado: "Rechazado", mensajes: [{ valor: "x".repeat(500) }] })), null);
    expect(r.messages[0]!.length).toBeLessThanOrEqual(200);
  });
});

// PENDIENTE fase 3 (persistencia y orquestacion): el bloque entero guarda src/lib/dgii/certification-send-service.ts, que DermaLand aún no tiene.
describe.skip("v386 — consulta desacoplada del gate + persistencia del motivo", () => {
  const svc = leerSiExiste("src/lib/dgii/certification-send-service.ts");
  it("consultarCertificationCase ya NO se bloquea por el gate (read-only)", () => {
    expect(svc).not.toContain("Consulta deshabilitada mientras el gate esté apagado");
    expect(svc).toContain("la CONSULTA por TrackId es read-only");
  });
  it("el ENVÍO sigue gateado", () => {
    expect(svc).toContain("Envío deshabilitado (DGII_TESTECF_SEND_ENABLED=false)");
  });
  it("persiste messages + code en el resultado del caso", () => {
    expect(svc).toContain("messages: res.messages");
    expect(svc).toContain("code: res.code");
  });
});

// PENDIENTE fase 6 (pantallas y rutas API): el bloque entero guarda src/app/(dashboard)/settings/dgii/setup/_components/OfficialDatasetPanel.tsx, que DermaLand aún no tiene.
// PENDIENTE fase 6 (pantallas y rutas API): el bloque entero guarda src/app/(dashboard)/settings/dgii/setup/_components/RejectedCaseDetail.tsx, que DermaLand aún no tiene.
describe.skip("v386/v417 — UI del rechazo (presentador CANÓNICO compartido Paso 2/4)", () => {
  const panel = leerSiExiste("src/app/(dashboard)/settings/dgii/setup/_components/OfficialDatasetPanel.tsx");
  // v417 — el detalle del rechazo se extrajo a RejectedCaseDetail (compartido con el Paso 4); el panel lo REUSA.
  const detail = leerSiExiste("src/app/(dashboard)/settings/dgii/setup/_components/RejectedCaseDetail.tsx");
  it("muestra el rechazo persistente con TrackId, código y mensajes (via el componente compartido)", () => {
    expect(panel).toContain("rejectedCases");
    expect(panel).toContain("RejectedCaseDetail");
    expect(detail).toContain("rechazado por DGII");
    expect(detail).toContain("sendMessages");
    expect(detail).toContain("sendCode");
    expect(detail).toContain("TrackId:");
  });
  it("permite re-consultar el rechazo y bloquea el avance", () => {
    expect(panel).toContain("Consultar resultado");
    expect(panel).toContain("hasBlockingRejection");
    expect(panel).toMatch(/Corregir y volver a preparar/);
  });
});
