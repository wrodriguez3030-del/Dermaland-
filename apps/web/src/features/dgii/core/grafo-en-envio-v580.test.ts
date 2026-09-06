// Portada de agendapp: tests/unit/dgii-grafo-en-envio-v580.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateTransition } from "./submission-state-machine";
import { rutaPortada } from "./__port__/rutas";

/**
 * v580 — El grafo manda también en el envío.
 *
 * v577 hizo que el estado saliera del veredicto de la DGII en vez de una constante. Lo que
 * no hizo fue pasar por la máquina de estados: escribía `status` con un UPDATE crudo dentro
 * de la transacción, salteándose `evaluateTransition` y `ALLOWED_TRANSITIONS`.
 *
 * Lo grave no es el atajo, es CUÁL guarda se saltaba. `evaluateTransition` tiene una regla
 * escrita para esto: «No se puede marcar aceptado sin trackId/respuesta DGII». Es la única
 * salvaguarda del sistema contra una aceptación inventada, y v577 la dejó fuera del camino
 * justo cuando empezó a escribir «accepted». Además el grafo sólo admite
 * `prepared → submitted`, no `prepared → accepted`: el estado que se escribía era uno que
 * la máquina considera imposible, y sin su fila de auditoría de transición.
 *
 * El caso legítimo que lo provocó: el resumen RFCE acepta en el acto y NO devuelve TrackId,
 * así que la evidencia que la guarda pedía no existe para él. La respuesta se necesitaba
 * como evidencia de pleno derecho, no saltándose la guarda.
 */

const leer = (rel: string) => readFileSync(rutaPortada(rel), "utf8");
const soloCodigo = (rel: string) =>
  leer(rel)
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\*.*$/gm, "");

const base = {
  hasPreparedSubmission: true,
  ambiente: "ecf",
  realSendAllowed: true,
};

describe("v580 — la respuesta de recepción es evidencia de pleno derecho", () => {
  it("un RFCE aceptado sin TrackId ya puede marcarse aceptado", () => {
    // El caso de las once Facturas de Consumo: 200 + «Aceptado», sin TrackId nunca.
    const r = evaluateTransition({
      ...base,
      currentStatus: "submitted",
      targetStatus: "accepted",
      trackId: null,
      respuestaRecepcion: { httpStatus: 200, estado: "Aceptado" },
    });
    expect(r.allowed, r.blockingReasons.join(" ")).toBe(true);
  });

  it("y NO se marca como aceptación simulada, porque es real", () => {
    // `hasSimulatedResponse` habría colado, pero añade el warning «no representa
    // aceptación fiscal real». Usarlo para un RFCE sería mentir en el registro.
    const r = evaluateTransition({
      ...base,
      currentStatus: "submitted",
      targetStatus: "accepted",
      trackId: null,
      respuestaRecepcion: { httpStatus: 200, estado: "Aceptado" },
    });
    expect(r.warnings.join(" ")).not.toMatch(/SIMULADA/i);
  });

  it("sin evidencia de ningún tipo sigue bloqueado", () => {
    const r = evaluateTransition({ ...base, currentStatus: "submitted", targetStatus: "accepted", trackId: null });
    expect(r.allowed).toBe(false);
    expect(r.blockingReasons.join(" ")).toMatch(/sin trackId/i);
  });

  it("una respuesta que no es 2xx no vale como evidencia de aceptación", () => {
    // Un 500 con un cuerpo raro no puede convertirse en «la DGII lo aceptó».
    const r = evaluateTransition({
      ...base,
      currentStatus: "submitted",
      targetStatus: "accepted",
      trackId: null,
      respuestaRecepcion: { httpStatus: 500, estado: "Aceptado" },
    });
    expect(r.allowed).toBe(false);
  });

  it("una respuesta 2xx sin estado tampoco", () => {
    const r = evaluateTransition({
      ...base,
      currentStatus: "submitted",
      targetStatus: "accepted",
      trackId: null,
      respuestaRecepcion: { httpStatus: 200, estado: "   " },
    });
    expect(r.allowed).toBe(false);
  });

  it("el grafo sigue siendo el grafo: de prepared no se salta a accepted", () => {
    const r = evaluateTransition({
      ...base,
      currentStatus: "prepared",
      targetStatus: "accepted",
      trackId: "t-1",
      respuestaRecepcion: { httpStatus: 200, estado: "Aceptado" },
    });
    expect(r.allowed).toBe(false);
    expect(r.blockingReasons.join(" ")).toMatch(/prepared → accepted/);
  });
});

describe("v580 — ningún camino legítimo se queda fuera del grafo", () => {
  it("el grafo NO admite signed → submitted, y al envío llegan comprobantes en signed", () => {
    // El hecho que obliga a encadenar. `drainPendingEcf` recoge {signed, prepared} y el
    // botón «Enviar a la DGII ahora» sale de `signed`. Si el envío intentara ir directo,
    // un comprobante que YA salió hacia la DGII se quedaría escrito como «signed».
    const r = evaluateTransition({ ...base, currentStatus: "signed", targetStatus: "submitted" });
    expect(r.allowed).toBe(false);
  });

  it("por eso desde signed se pasa por prepared, que sí está en el grafo", () => {
    expect(evaluateTransition({ ...base, currentStatus: "signed", targetStatus: "prepared" }).allowed).toBe(true);
    expect(evaluateTransition({ ...base, currentStatus: "prepared", targetStatus: "submitted" }).allowed).toBe(true);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("y el servicio encadena ese salto en vez de bloquear el envío", () => {
    // Sin esto, endurecer el guardarraíl habría roto el envío desde `signed`: exactamente
    // el error de v575, que puso un assert y dejó fuera al productor que lo alimenta.
    const s = soloCodigo("src/lib/dgii/submission-service.ts");
    const i = s.indexOf('targetStatus: "submitted"');
    expect(i).toBeGreaterThan(-1);
    expect(s, "el envío desde `signed` quedaría bloqueado por el grafo").toMatch(
      /estadoActual === "signed"[\s\S]{0,200}?"prepared"|aplicar\("prepared"/,
    );
  });
});

describe("v580 — el envío deja de escribir el estado por su cuenta", () => {
  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("submission-service usa la máquina de estados", () => {
    expect(soloCodigo("src/lib/dgii/submission-service.ts")).toContain("evaluateTransition");
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("y ya no escribe `status` con un UPDATE crudo", () => {
    const s = soloCodigo("src/lib/dgii/submission-service.ts");
    for (const m of s.matchAll(/electronicInvoice\.update(Many)?\(/g)) {
      const bloque = s.slice(m.index, m.index + 500);
      if (!/\bstatus:/.test(bloque)) continue;
      expect(bloque, "hay un UPDATE que escribe el estado sin pasar por el grafo").toMatch(
        /nextStatus|estadoPermitido/,
      );
    }
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("pasa por `submitted` antes de un veredicto, como exige el grafo", () => {
    // prepared → submitted → accepted. Que las dos cosas lleguen en la misma respuesta
    // HTTP no las convierte en un solo evento.
    const s = soloCodigo("src/lib/dgii/submission-service.ts");
    expect(s).toMatch(/targetStatus:\s*"submitted"/);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("y registra la transición en auditoría, que antes no ocurría", () => {
    // La acción sale de la propia máquina (`paso.auditAction`), no de una cadena copiada:
    // así el nombre del evento no puede divergir del que decide si la transición valió.
    const s = soloCodigo("src/lib/dgii/submission-service.ts");
    expect(s).toMatch(/action:\s*paso\.auditAction/);
  });
});

describe("v580 — el guardarraíl de v569, con sus dos agujeros tapados", () => {
  const GUARDA = "tests/unit/dgii-veredicto-v569.test.ts";

  // PENDIENTE fase 9 (ensayo completo y empaquetado): revive cuando exista tests/unit/dgii-veredicto-v569.test.ts.
  it.skip("cubre también `updateMany`, que v578 introdujo", () => {
    expect(leer(GUARDA)).toMatch(/update\(Many\)\?|updateMany/);
  });

  // PENDIENTE fase 9 (ensayo completo y empaquetado): revive cuando exista tests/unit/dgii-veredicto-v569.test.ts.
  it.skip("y mira también el servicio de envío, donde apareció la violación de verdad", () => {
    expect(leer(GUARDA)).toContain("submission-service");
  });
});
