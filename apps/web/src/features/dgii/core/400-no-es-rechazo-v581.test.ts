// Portada de agendapp: tests/unit/dgii-400-no-es-rechazo-v581.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeRecepcionResponse } from "./dgii-response-normalizer";
import { estadoTrasEnvio } from "./estado-tras-envio";
import { rutaPortada } from "./__port__/rutas";

/**
 * v581 — Un HTTP 400 no es, por sí solo, un rechazo de la DGII.
 *
 * `statusForHttpError` traducía 400 → «rejected» sin mirar nada más. Mientras eso vivía
 * sólo en la respuesta normalizada era una etiqueta; desde v577 se escribe en
 * `electronic_invoices.status`, y `rejected` es TERMINAL: no se puede reenviar, deja de
 * congelar los pagos de la venta, y las pantallas le dicen al dueño «su número queda
 * consumido y no se puede reutilizar».
 *
 * El problema es que un 400 no siempre viene de la DGII evaluando el documento. Un proxy,
 * un WAF, un multipart mal formado o una pasarela intermedia devuelven 400 sin que la DGII
 * haya visto nada. Sin TrackId no hay manera de comprobarlo después. Quemar un número
 * autorizado —que no se devuelve— por un error de transporte es el peor final posible.
 *
 * La distinción está en el cuerpo: cuando la DGII rechaza, DICE POR QUÉ. Los dos rechazos
 * reales de hoy llegaron así, con su código y su texto:
 *   [176] El campo IndicadorMontoGravado del área IdDoc … no es válido
 *   [260] El campo MontoITBISRetenido de la sección DetallesItems … no es válido
 */

const resp = (status: number, bodyText: string) => ({ status, bodyText, headersRedacted: {}, elapsedMs: 12 });

describe("v581 — un 400 con veredicto de la DGII sigue siendo un rechazo", () => {
  it("el rechazo real de hoy se sigue leyendo como rechazo", () => {
    const r = normalizeRecepcionResponse(
      resp(400, JSON.stringify({ mensajes: [{ codigo: 176, valor: "El campo IndicadorMontoGravado del área IdDoc de la sección Encabezado no es válido" }] })),
    );
    expect(r.status).toBe("rejected");
    expect(r.messages.join(" ")).toMatch(/IndicadorMontoGravado/);
  });

  it("y basta con que la DGII devuelva su código", () => {
    const r = normalizeRecepcionResponse(resp(400, JSON.stringify({ codigo: 260, estado: "Rechazado" })));
    expect(r.status).toBe("rejected");
  });
});

describe("v581 — un 400 sin veredicto NO quema el comprobante", () => {
  it("un HTML de WAF no se convierte en rechazo", () => {
    const r = normalizeRecepcionResponse(resp(400, "<html><body><h1>400 Bad Request</h1></body></html>"));
    expect(r.status, "un WAF acaba de quemar un e-NCF").not.toBe("rejected");
    expect(r.status).toBe("error");
  });

  it("un cuerpo vacío tampoco", () => {
    expect(normalizeRecepcionResponse(resp(400, "")).status).toBe("error");
  });

  it("ni un texto genérico de pasarela", () => {
    expect(normalizeRecepcionResponse(resp(400, "Bad Request")).status).toBe("error");
  });

  it("y el mensaje dice que no se pudo confirmar, en vez de afirmar un rechazo", () => {
    const r = normalizeRecepcionResponse(resp(400, "Bad Request"));
    expect(r.message).not.toMatch(/rechaz/i);
    expect(r.message).toMatch(/no se pudo|sin confirmar|no confirm/i);
  });
});

describe("v581 — y aunque llegara, el estado no se promueve sin veredicto", () => {
  it("estadoTrasEnvio no marca rejected si la DGII no dijo por qué", () => {
    // Segunda puerta: `estadoTrasEnvio` es lo último antes de escribir un estado terminal.
    // Recibe la EVIDENCIA —los mensajes y el código de la respuesta—, no un flag que
    // alguien tenga que acordarse de poner.
    expect(estadoTrasEnvio({ status: "rejected", trackId: null, messages: [], code: null })).toBe("submitted");
  });

  it("con los mensajes de la DGII sí lo marca", () => {
    expect(
      estadoTrasEnvio({ status: "rejected", trackId: null, messages: ["[260] El campo MontoITBISRetenido…"], code: null }),
    ).toBe("rejected");
  });

  it("y con su código, también", () => {
    expect(estadoTrasEnvio({ status: "rejected", trackId: null, messages: [], code: "260" })).toBe("rejected");
  });

  it("un rechazo consultado por TrackId no necesita nada más", () => {
    // Ahí la DGII ya evaluó: el TrackId es la prueba de que vio el documento.
    expect(estadoTrasEnvio({ status: "rejected", trackId: "1a7b615e" })).toBe("rejected");
  });

  it("y una aceptación sigue exigiendo lo suyo, sin cambios", () => {
    expect(estadoTrasEnvio({ status: "accepted", trackId: null })).toBe("accepted");
  });
});

describe("v581 — el error queda reintentable, no atascado", () => {
  const leer = (rel: string) => readFileSync(rutaPortada(rel), "utf8");

  it("`error` sigue quedando en submitted, que es lo que permite reintentar", () => {
    // `error` es terminal en el grafo; promoverlo dejaría el comprobante fuera del
    // resolutor y fuera de la red del cierre de caja.
    expect(estadoTrasEnvio({ status: "error", trackId: null })).toBe("submitted");
  });

  // PENDIENTE fase 5 (adaptadores de negocio (POS)): revive cuando exista src/lib/server/pos-sale-send.ts.
  it.skip("y el drenado del cierre lo vuelve a intentar", () => {
    const s = leer("src/lib/server/pos-sale-send.ts");
    const i = s.indexOf("drainPendingEcf");
    expect(s.slice(i, i + 1200)).toMatch(/status:\s*\{\s*in:\s*\["signed",\s*"prepared"\]/);
  });
});
