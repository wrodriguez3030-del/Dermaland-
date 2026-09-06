// Portada de agendapp: tests/unit/rfce-auth-host-v531.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { executeDgiiSubmission } from "./dgii-client";
import { DGII_FC_BASE_URLS, DGII_DEFAULT_BASE_URLS, DGII_RECEPCION_FC_PATH } from "./dgii-client-types";
import { rutaPortada } from "./__port__/rutas";

/**
 * v531 — El primer envío real de AgendApp, y por qué no salió.
 *
 * El dueño cobró la venta #17. El comprobante E320000000001 se armó, se firmó y se guardó
 * bien. El envío falló **en un segundo** y la pantalla dijo «sin respuesta a tiempo».
 *
 * No era el tiempo. Una factura de consumo bajo RD$250.000 va a DGII como RESUMEN, y el
 * resumen se recibe en `fc.dgii.gov.do`. v511 enrutó la entrega correctamente, pero lo hizo
 * cambiando `baseUrl` ENTERO — así que la semilla y su validación se iban también a `fc`,
 * donde ese servicio no existe. El envío moría antes de pedir el token.
 *
 * Medido contra DGII el 2026-08-06:
 *   ecf.dgii.gov.do/ecf/Autenticacion/api/Autenticacion/Semilla  → HTTP 200
 *   fc.dgii.gov.do/ecf/Autenticacion/api/Autenticacion/Semilla   → no conecta
 *   fc.dgii.gov.do/ecf/recepcionfc/api/recepcion/ecf             → HTTP 411 (existe)
 */

const leer = (rel: string) => readFileSync(rutaPortada(rel), "utf8");
const codigo = (rel: string) =>
  leer(rel).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

/** Transporte que sólo anota a qué URL fue cada llamada. No sale a la red. */
function transporteEspia() {
  const urls: string[] = [];
  return {
    urls,
    transport: {
      request: vi.fn(async ({ url }: { url: string }) => {
        urls.push(url);
        if (url.includes("Semilla") && !url.includes("Validar")) {
          return { status: 200, bodyText: "<SemillaModel><valor>x</valor><fecha>2026-08-06</fecha></SemillaModel>", headers: {} };
        }
        if (url.includes("ValidarSemilla")) {
          return { status: 200, bodyText: JSON.stringify({ token: "tok", expira: "2026-08-06T23:59:59" }), headers: {} };
        }
        return { status: 200, bodyText: JSON.stringify({ trackId: "T-1", estado: "Recibido" }), headers: {} };
      }),
    },
  };
}

const correr = async (over: Record<string, unknown>) => {
  const { urls, transport } = transporteEspia();
  await executeDgiiSubmission({
    mode: "live",
    prepared: { ambiente: "ecf", eNcf: "E320000000001", tipoEcf: "32" },
    signedXml: "<ECF/>",
    signSeed: async () => "<SemillaFirmada/>",
    transport,
    manualConfirmation: true,
    gates: { envSendEnabled: true, tenantRealSendEnabled: true, readyForTestecf: true },
    ...over,
  } as never);
  return urls;
};

describe("v531 — la autenticación NO se va al host del resumen", () => {
  it("con el resumen RFCE: semilla en ecf.dgii.gov.do, entrega en fc.dgii.gov.do", async () => {
    const urls = await correr({
      baseUrl: DGII_DEFAULT_BASE_URLS.ecf.replace(/\/+$/, ""),
      recepcionBaseUrl: DGII_FC_BASE_URLS.ecf.replace(/\/+$/, ""),
      paths: { recepcion: DGII_RECEPCION_FC_PATH },
    });
    const [semilla, validar, recepcion] = urls;
    expect(semilla, "la semilla se fue al host del resumen — es el bug de v511").toContain("ecf.dgii.gov.do");
    expect(semilla).not.toContain("fc.dgii.gov.do");
    expect(validar).toContain("ecf.dgii.gov.do");
    expect(validar).not.toContain("fc.dgii.gov.do");
    expect(recepcion, "el resumen dejó de ir a su host").toContain("fc.dgii.gov.do");
    expect(recepcion).toContain(DGII_RECEPCION_FC_PATH);
  });

  it("sin resumen, las tres llamadas van al mismo host de siempre", async () => {
    const urls = await correr({ baseUrl: DGII_DEFAULT_BASE_URLS.ecf.replace(/\/+$/, "") });
    for (const u of urls) expect(u).toContain("ecf.dgii.gov.do");
    expect(urls.some((u) => u.includes("fc.dgii.gov.do"))).toBe(false);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("el servicio ya no mueve `baseUrl` para enrutar el resumen", () => {
    // La regresión concreta: si vuelve `baseUrl: esResumen ? DGII_FC_BASE_URLS…`, el
    // handshake se va con él y el envío muere en un segundo, otra vez.
    const svc = codigo("src/lib/dgii/submission-service.ts");
    expect(svc).toMatch(/baseUrl: resolveDgiiBaseUrl\(ambiente\)/);
    expect(svc, "volvió a mandar la autenticación al host del resumen").not.toMatch(
      /baseUrl: esResumen \?/,
    );
    expect(svc).toMatch(/recepcionBaseUrl: DGII_FC_BASE_URLS\[ambiente\]/);
  });
});

describe("v531 — un envío que falla deja rastro", () => {
  const svc = () => codigo("src/lib/dgii/submission-service.ts");

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("el error se guarda con su detalle, no como `{ error: true }` a secas", () => {
    const s = svc();
    expect(s).toMatch(/after: \{ error: true, detalle: recorte \}/);
    expect(s, "el fallo no queda en la submission y hay que adivinarlo").toMatch(
      /data: \{ error_message: recorte/,
    );
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("se recorta: un error de DGII no arrastra el XML ni el token a la auditoría", () => {
    expect(svc()).toMatch(/\.slice\(0, 500\)/);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("registrar el error no puede provocar otro error", () => {
    // Si el update fallara, el envío ya fallido tumbaría además la respuesta al cliente.
    // Se afirma la ESTRUCTURA (el update va dentro de un try), no el comentario: `codigo()`
    // quita los comentarios justamente para no afirmar sobre la explicación.
    const s = svc();
    const i = s.indexOf("data: { error_message: recorte");
    expect(i).toBeGreaterThan(0);
    const antes = s.slice(Math.max(0, i - 600), i);
    expect(antes, "el registro del error quedó fuera de un try").toMatch(/try \{/);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("el motivo llega hasta la caja en vez de perderse", () => {
    expect(svc()).toMatch(/warnings: \[recorte\]/);
  });
});

describe("v531 — el mostrador deja de llamar «tiempo» a todo", () => {
  const envio = () => codigo("src/lib/server/pos-sale-send.ts");

  // PENDIENTE fase 5 (adaptadores de negocio (POS)): revive cuando exista src/lib/server/pos-sale-send.ts.
  it.skip("sólo dice «no respondió a tiempo» cuando el error habla de tiempo", () => {
    const s = envio();
    expect(s).toMatch(/parecerTimeout/);
    expect(s).toMatch(/timeout\|abort\|ETIMEDOUT\|tiempo/i);
    expect(s, "volvió el mensaje fijo que mandaba a buscar al lugar equivocado").not.toMatch(
      /"No se pudo enviar a DGII \(sin respuesta a tiempo\)\."/,
    );
  });

  // PENDIENTE fase 5 (adaptadores de negocio (POS)): revive cuando exista src/lib/server/pos-sale-send.ts.
  it.skip("cuando hay motivo real, lo dice", () => {
    expect(envio()).toMatch(/No se pudo enviar a DGII: \$\{detalle\}/);
  });
});
