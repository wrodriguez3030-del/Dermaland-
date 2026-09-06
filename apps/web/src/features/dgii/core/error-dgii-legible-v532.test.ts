// Portada de agendapp: tests/unit/error-dgii-legible-v532.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { seedHttpErrorMessage } from "./dgii-response-normalizer";
import { rutaPortada } from "./__port__/rutas";

/**
 * v532 — Que el error diga lo que DGII dijo.
 *
 * El primer envío real falló y la pantalla mostró «ValidarSemilla: 400 (semilla/firma
 * inválida)». Ese texto es NUESTRO: el cliente descartaba el cuerpo de la respuesta y lo
 * reemplazaba por un enlatado que mezcla causas distintas.
 *
 * DGII sí explica, y con precisión. Comprobado contra producción el 2026-08-06:
 *   XML incompleto      → «La estructura del archivo XML no es válido… verificar el XSD»
 *                          + errores: ["The element 'SemillaModel' has incomplete content…"]
 *   certificado ajeno   → «Tipo de certificado no admitido»
 *
 * Son dos problemas que se arreglan de formas completamente distintas, y el enlatado los
 * volvía indistinguibles. Esa diferencia costó dos releases de diagnóstico.
 */

const leer = (rel: string) => readFileSync(rutaPortada(rel), "utf8");
const codigo = (rel: string) =>
  leer(rel).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("v532 — el mensaje incorpora lo que respondió DGII", () => {
  it("respuesta de texto plano: la cita entera", () => {
    const m = seedHttpErrorMessage(400, "validar_semilla", '"Tipo de certificado no admitido"');
    expect(m, "se perdió lo único que explicaba el fallo").toMatch(/Tipo de certificado no admitido/);
    expect(m).toMatch(/DGII dice:/);
  });

  it("respuesta JSON: junta `mensaje` y `errores`, que es donde está el detalle fino", () => {
    const cuerpo = JSON.stringify({
      mensaje: "La estructura del archivo XML no es válido, favor proveer un XML con una estructura válida, verificar el XSD correspondiente.",
      errores: ["The element 'SemillaModel' has incomplete content. List of possible elements expected: 'fecha'."],
    });
    const m = seedHttpErrorMessage(400, "validar_semilla", cuerpo);
    expect(m).toMatch(/estructura del archivo XML no es válido/);
    expect(m, "el detalle del XSD es justo lo que dice QUÉ falta").toMatch(/incomplete content/);
  });

  it("sin cuerpo, o con una página de error del WAF, no inventa nada", () => {
    expect(seedHttpErrorMessage(400, "validar_semilla")).not.toMatch(/DGII dice/);
    expect(seedHttpErrorMessage(400, "validar_semilla", "<html><body>Error</body></html>")).not.toMatch(/DGII dice/);
    expect(seedHttpErrorMessage(500, "semilla")).toMatch(/no está disponible/);
  });

  it("se recorta: un cuerpo enorme no se arrastra entero a la auditoría", () => {
    const m = seedHttpErrorMessage(400, "validar_semilla", "x".repeat(5000));
    expect(m.length).toBeLessThan(400);
  });

  it("el cliente le PASA el cuerpo — sin eso, todo lo anterior es decorativo", () => {
    const c = codigo("src/lib/dgii/dgii-client.ts");
    expect(c).toMatch(/seedHttpErrorMessage\(res\.status, "semilla", res\.bodyText\)/);
    expect(c).toMatch(/seedHttpErrorMessage\(res\.status, "validar_semilla", res\.bodyText\)/);
  });
});

describe("v532 — la cajera ve una cosa; quien resuelve, otra", () => {
  const dlg = () => codigo("src/components/facturar/SaleResultDialog.tsx");

  // PENDIENTE fase 6 (pantallas y rutas API): revive cuando exista src/components/facturar/SaleResultDialog.tsx.
  it.skip("el motivo técnico deja de estar suelto en el modal", () => {
    // «DgiiHttpError: ValidarSemilla: 400…» no le dice a la cajera qué hacer, y lo único
    // que puede hacer es reintentar o seguir cobrando.
    const d = dlg();
    expect(d, "el motivo crudo volvió al cuerpo del aviso").not.toMatch(
      /<p className="mt-0\.5 text-xs text-warning-strong">\{motivoEnvio\}<\/p>/,
    );
    expect(d).toMatch(/La factura ya está registrada y el ticket se puede imprimir/);
  });

  // PENDIENTE fase 6 (pantallas y rutas API): revive cuando exista src/components/facturar/SaleResultDialog.tsx.
  it.skip("pero NO se pierde: queda plegado, en el componente que ya existe para eso", () => {
    const d = dlg();
    expect(d).toMatch(/<TechnicalDetails/);
    expect(d).toMatch(/data-testid="envio-detalle-tecnico"/);
    expect(d).toMatch(/\{motivoEnvio\}/);
  });

  // PENDIENTE fase 6 (pantallas y rutas API): revive cuando exista src/components/facturar/SaleResultDialog.tsx.
  it.skip("y el botón de reintentar sigue ahí, que es la acción que sí puede tomar", () => {
    expect(dlg()).toMatch(/data-testid="envio-reintentar"/);
  });
});
