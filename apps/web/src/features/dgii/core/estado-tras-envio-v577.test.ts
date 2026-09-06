// Portada de agendapp: tests/unit/dgii-estado-tras-envio-v577.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { estadoTrasEnvio } from "./estado-tras-envio";
import { rutaPortada } from "./__port__/rutas";

/**
 * v577 — El veredicto que llegaba en la misma respuesta y se tiraba.
 *
 * Las once Facturas de Consumo de este negocio (E32…001 a E32…011, del 17 y el 22 de
 * agosto) llevaban semanas en `submitted`. Parecían no haber salido. Habían salido: las
 * once tienen `200 · Aceptado` en `dgii_status_logs`.
 *
 * Un E32 bajo RD$250,000 va por RFCE (fc.dgii.gov.do/recepcionfc), que acepta en el acto y
 * NO devuelve TrackId — es su diseño. El cliente ya clasificaba esa respuesta en
 * `result.status`, y `submission-service.ts` escribía `status: "submitted"` fijo, tirando
 * el veredicto. Como el resolutor sólo consulta lo que tiene TrackId, un RFCE no podía
 * salir de `submitted` nunca.
 *
 * Tercer caso del mismo patrón en esta tanda: el dato correcto estaba a mano y se perdía.
 */

describe("v577 — el estado sale de lo que respondió la DGII", () => {
  it("«Aceptado» deja el comprobante aceptado, no «enviado»", () => {
    // El caso de las once. Sin TrackId, porque el RFCE no da ninguno.
    expect(estadoTrasEnvio({ status: "accepted", trackId: null })).toBe("accepted");
  });

  it("aceptado con condiciones se conserva tal cual", () => {
    expect(estadoTrasEnvio({ status: "accepted_conditional", trackId: null })).toBe("accepted_conditional");
  });

  it("un rechazo queda rechazado desde el primer momento", () => {
    // Antes un rechazo en la propia respuesta se guardaba como «submitted» y había que
    // preguntar después para enterarse.
    //
    // v581 — Con la evidencia delante. Este caso pasaba `trackId: null` y ningún detalle, y
    // así escrito afirmaba que un rechazo SIN nada que lo respalde debía quemar el
    // comprobante: es el agujero por el que un 400 de proxy se llevaba un número
    // autorizado. El rechazo real siempre trae lo suyo — aquí, el código de la DGII.
    expect(estadoTrasEnvio({ status: "rejected", trackId: null, code: "260" })).toBe("rejected");
    expect(estadoTrasEnvio({ status: "rejected", trackId: "1a7b615e" })).toBe("rejected");
  });

  it("«en proceso» se conserva, que es consultable", () => {
    expect(estadoTrasEnvio({ status: "in_process", trackId: "t-1" })).toBe("in_process");
  });

  it("un acuse con TrackId sigue siendo «enviado»: el veredicto llega después", () => {
    // Es el camino del e-CF normal, y no cambia.
    expect(estadoTrasEnvio({ status: "submitted", trackId: "1a7b615e" })).toBe("submitted");
  });

  it("un fallo de transporte NO se promueve: queda enviado, como hasta ahora", () => {
    // A propósito, y por eso está escrito: mover `error` fuera de `submitted` lo sacaría
    // del alcance del resolutor y de la red del cierre de caja. Es otra conversación.
    expect(estadoTrasEnvio({ status: "error", trackId: null })).toBe("submitted");
  });

  it("un estado que no conocemos cae en «enviado», nunca en «aceptado»", () => {
    // Conservador a propósito: inventar un «aceptado» es el error caro.
    expect(estadoTrasEnvio({ status: "loquesea", trackId: null })).toBe("submitted");
    expect(estadoTrasEnvio({ status: "", trackId: null })).toBe("submitted");
  });
});

const leer = (rel: string) => readFileSync(rutaPortada(rel), "utf8");

describe("v577 — y el servicio de envío lo usa", () => {
  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("ya no escribe «submitted» a pelo tras enviar", () => {
    const s = leer("src/lib/dgii/submission-service.ts");
    expect(s, "sigue clavando el estado sin mirar la respuesta").not.toMatch(
      /data:\s*\{\s*status:\s*"submitted",\s*track_id:\s*result\.trackId/,
    );
    expect(s).toContain("estadoTrasEnvio");
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("y el resultado que devuelve dice el estado real, no «submitted» siempre", () => {
    const s = leer("src/lib/dgii/submission-service.ts");
    const i = s.indexOf("return { ok: true, invoiceId: inv.id, eNcf: inv.e_ncf");
    expect(i).toBeGreaterThan(-1);
    expect(s.slice(i, i + 200), "el llamador sigue viendo «submitted» pase lo que pase").not.toMatch(
      /status:\s*"submitted"/,
    );
  });
});
