// Portada de agendapp: tests/unit/dgii-evidencia-del-veredicto-v615.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeEstadoResponse, normalizeAcecfResponse } from "./dgii-response-normalizer";
import type { DgiiHttpResponse } from "./dgii-http-transport-types";
import { rutaPortada } from "./__port__/rutas";

const leer = (rel: string) => readFileSync(rutaPortada(rel), "utf8");
const soloCodigo = (rel: string) =>
  leer(rel).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * v615 — Guardar lo que la DGII contestó cuando dio su veredicto.
 *
 * v584 añadió `rawBody` —«el cuerpo TAL CUAL lo mandó la DGII, para persistirlo como
 * prueba»— y lo puso sólo en la respuesta de la recepción. Pero para un comprobante que no
 * es RFCE, la recepción devuelve un TrackId y nada más: **el veredicto llega después**, al
 * consultar el estado. Justo el momento que habría que justificar ante la DGII era el
 * único sin cuerpo guardado.
 *
 * La columna donde ponerlo ya existe: `dgii_status_logs.raw_response_path`, que el envío y
 * la simulación ya rellenan. Faltaba el tercer camino.
 *
 * Decidido con el dueño: se guarda **sólo la respuesta con veredicto**. Un «en proceso» no
 * justifica nada y sólo añade archivos.
 */

const respuesta = (bodyText: string, status = 200): DgiiHttpResponse => ({
  status,
  bodyText,
  headersRedacted: {},
  elapsedMs: 1,
});

describe("v615 — el normalizador conserva el cuerpo original", () => {
  it("la consulta de estado lo devuelve", () => {
    const xml = "<Estado>Aceptado</Estado><Codigo>1</Codigo>";
    const r = normalizeEstadoResponse(respuesta(xml), "tid-1");
    expect(r.rawBody, "el veredicto llega sin su prueba detrás").toBe(xml);
  });

  it("también cuando la DGII responde con error", () => {
    // Un 400 con su cuerpo explica por qué; tirarlo deja el rechazo sin motivo.
    const xml = "<Error>Comprobante duplicado</Error>";
    const r = normalizeEstadoResponse(respuesta(xml, 400), "tid-2");
    expect(r.rawBody).toBe(xml);
  });

  it("y la aprobación comercial, que también trae veredicto en el acto", () => {
    const xml = "<codigo>1</codigo><estado>Aprobacion Comercial Aprobada</estado>";
    const r = normalizeAcecfResponse(respuesta(xml));
    expect(r.rawBody).toBe(xml);
  });

  it("un cuerpo vacío no inventa nada", () => {
    const r = normalizeEstadoResponse(respuesta(""), "tid-3");
    expect(r.rawBody === "" || r.rawBody === undefined).toBe(true);
  });
});

describe("v615 — y se guarda donde ya se guardaban los otros dos", () => {
  const src = () => soloCodigo("src/lib/dgii/estado-veredicto.ts");

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/estado-veredicto.ts.
  it.skip("escribe `raw_response_path`, la columna que llevaba vacía en este camino", () => {
    expect(src(), "el log del veredicto sigue sin su cuerpo").toMatch(/raw_response_path/);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/estado-veredicto.ts.
  it.skip("usa el mismo guardado que el envío, no uno nuevo", () => {
    expect(src()).toContain("saveDgiiResponsePayload");
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/estado-veredicto.ts.
  it.skip("sólo cuando hay veredicto DE VERDAD: un «en proceso» no se guarda", () => {
    /**
     * v616 — Este test comprobaba que el guardado fuera DESPUÉS de `VEREDICTOS.includes`, y
     * pasaba… apoyándose en una premisa falsa: `VEREDICTOS` incluye `in_process`. Un «en
     * proceso» cruzaba esa puerta y se archivaba como si probara algo, justo lo contrario
     * de lo que el título prometía. Comparar índices de texto no distingue una condición
     * correcta de una equivocada.
     *
     * Ahora la condición es explícita y se comprueba tal cual.
     */
    const s = src();
    expect(s, "la condición sigue colgando de VEREDICTOS, que incluye in_process").toMatch(
      /const HAY_VEREDICTO\s*=\s*estado === "accepted"[\s\S]{0,120}accepted_conditional[\s\S]{0,60}rejected/,
    );
    expect(s, "in_process seguiría archivándose").not.toMatch(
      /HAY_VEREDICTO[\s\S]{0,200}in_process/,
    );
    // Y la guarda envuelve al guardado, no va suelta.
    const iCond = s.indexOf("if (HAY_VEREDICTO");
    const iGuardado = s.indexOf("await saveDgiiResponsePayload(");
    expect(iCond).toBeGreaterThan(-1);
    expect(iGuardado).toBeGreaterThan(iCond);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/estado-veredicto.ts.
  it.skip("el cuerpo se archiva TAL CUAL, con su marca de truncado si la trae", () => {
    /**
     * v616 — v615 hacía `.slice(0, DGII_MAX_RESPONSE_BYTES)` sobre un cuerpo que el
     * transporte ya había recortado añadiéndole «…[truncated]». El segundo recorte cortaba
     * exactamente esa marca, así que se archivaba un trozo con pinta de documento entero:
     * la prueba mentía por omisión.
     */
    expect(src(), "vuelve a recortar lo ya recortado").not.toMatch(
      /rawBody\.slice\(0,\s*DGII_MAX_RESPONSE_BYTES\)/,
    );
    expect(src()).toMatch(/body:\s*r\.rawBody\s*[,}]/);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/estado-veredicto.ts.
  it.skip("se archiva bajo el id del ENVÍO, no bajo el del comprobante", () => {
    // `submissions/{id}` es el espacio de ids de `dgii_submissions`. v615 metía ahí el id
    // del comprobante, y dos entidades distintas pasaban a compartir directorio.
    const s = src();
    expect(s, "usa el id del comprobante como si fuera el del envío").not.toMatch(
      /submissionId:\s*inv\.id/,
    );
    expect(s).toMatch(/dgiiSubmission\.findFirst/);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/estado-veredicto.ts.
  it.skip("perder la evidencia no cuesta el veredicto, pero SÍ se cuenta", () => {
    /**
     * v615 lo envolvía en un `catch {}` mudo con un comentario que prometía un aviso
     * «abajo» que no existía en ninguna parte: la evidencia podía llevar meses sin
     * guardarse y cada veredicto se vería sano. Es el mismo defecto que v612 arregló en el
     * envío, repetido treinta líneas más allá.
     */
    const s = src();
    expect(s, "el fallo se sigue tragando en silencio").toMatch(/avisoDeEvidencia\s*=/);
    expect(s).toMatch(/catch \(e\)/);
    // Y el aviso sale del módulo, que es lo que lo hace visible.
    expect(s).toMatch(/avisoDeEvidencia\s*\}/);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/estado-veredicto.ts.
  it.skip("y el cierre de caja lo recoge junto a los demás motivos", () => {
    expect(src()).toMatch(/motivos\.add\(r\.avisoDeEvidencia\)/);
  });
});
