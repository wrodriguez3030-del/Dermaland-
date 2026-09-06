// Portada de agendapp: tests/unit/nombre-archivo-oficial-v534.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { executeDgiiSubmission, buildDgiiXmlFilename } from "./dgii-client";
import { rutaPortada } from "./__port__/rutas";

/**
 * v534 — El nombre del archivo que espera DGII.
 *
 * DGII recibe el comprobante como un archivo y el nombre importa: `{RNC}{e-NCF}.xml`.
 * `recepcionEcf` lo arma desde v387 **si recibe el RNC del emisor**; sin él cae a un nombre
 * legacy (`{e-NCF}.xml`).
 *
 * El camino de la certificación —el que DGII aceptó 165 veces— siempre lo pasó.
 * `executeDgiiSubmission`, que es el de producción, **no tenía por dónde recibirlo**: iba a
 * subir `E320000000006.xml` en vez de `131561985E320000000006.xml`.
 *
 * No se veía antes porque el envío productivo nunca había pasado de la autenticación: v531
 * arregló el host, v533 clasificó el permiso pendiente, y esto era lo siguiente en la fila.
 * Se encontró comparando los dos caminos, no esperando a que fallara con una clienta
 * enfrente.
 */

const leer = (rel: string) => readFileSync(rutaPortada(rel), "utf8");
const codigo = (rel: string) =>
  leer(rel).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

function espia() {
  const enviados: { url: string; filename?: string }[] = [];
  return {
    enviados,
    transport: {
      request: vi.fn(async ({ url, body }: { url: string; body?: unknown }) => {
        let filename: string | undefined;
        if (body instanceof FormData) {
          const f = body.get("xml");
          if (f && typeof f === "object" && "name" in f) filename = (f as File).name;
        }
        enviados.push({ url, filename });
        if (url.includes("Semilla") && !url.includes("Validar")) {
          return { status: 200, bodyText: "<SemillaModel><valor>x</valor><fecha>2026-08-06</fecha></SemillaModel>", headers: {} };
        }
        if (url.includes("ValidarSemilla")) return { status: 200, bodyText: JSON.stringify({ token: "tok" }), headers: {} };
        return { status: 200, bodyText: JSON.stringify({ trackId: "T-1", estado: "Recibido" }), headers: {} };
      }),
    },
  };
}

const correr = async (over: Record<string, unknown>) => {
  const { enviados, transport } = espia();
  await executeDgiiSubmission({
    mode: "live",
    prepared: { ambiente: "ecf", eNcf: "E320000000006", tipoEcf: "32" },
    signedXml: "<ECF/>",
    signSeed: async () => "<SemillaFirmada/>",
    transport,
    manualConfirmation: true,
    gates: { envSendEnabled: true, tenantRealSendEnabled: true, readyForTestecf: true },
    ...over,
  } as never);
  return enviados;
};

describe("v534 — el comprobante se sube con el nombre oficial", () => {
  it("con el RNC del emisor: `{RNC}{e-NCF}.xml`", async () => {
    const enviados = await correr({ rncEmisor: "131561985" });
    const recepcion = enviados[enviados.length - 1]!;
    expect(recepcion.filename, "volvió el nombre legacy que DGII no espera").toBe(
      "131561985E320000000006.xml",
    );
  });

  it("el armador no inventa: limpia separadores y concatena", () => {
    expect(buildDgiiXmlFilename({ rnc: "131-56198-5", encf: "E320000000006" })).toBe(
      "131561985E320000000006.xml",
    );
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("el servicio SÍ le pasa el RNC — sin eso lo de arriba es decorativo", () => {
    const svc = codigo("src/lib/dgii/submission-service.ts");
    expect(svc).toMatch(/rncEmisor: settings\?\.rnc_emisor \?\? undefined/);
    // Y lo trae del query: si no está en el `select`, llega `undefined` y vuelve el legacy.
    expect(svc, "consulta la config sin el RNC del emisor").toMatch(
      /dgii_enabled_real_send: true, rnc_emisor: true/,
    );
  });

  it("el cliente lo traslada a la entrega", () => {
    expect(codigo("src/lib/dgii/dgii-client.ts")).toMatch(/rncEmisor: input\.rncEmisor/);
  });

  it("sin RNC sigue funcionando el camino viejo (compat, no se rompe nada)", async () => {
    const enviados = await correr({});
    expect(enviados[enviados.length - 1]!.filename).toBe("E320000000006.xml");
  });
});
