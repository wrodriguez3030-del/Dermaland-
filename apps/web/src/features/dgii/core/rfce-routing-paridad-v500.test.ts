// Portada de agendapp: tests/unit/rfce-routing-paridad-v500.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveEcfDelivery } from "./rfce-routing";
import { RFCE_MONTO_MAXIMO } from "./builders/rfce";
import { rutaPortada, leerSiExiste } from "./__port__/rutas";

/**
 * v500 — El QR y el envío deciden lo mismo, porque lo decide la misma función.
 *
 * `ri-generator.ts` comparaba el umbral por su cuenta (`tipo === "32" && monto <
 * RFCE_MONTO_MAXIMO`) para elegir entre `consultatimbrefc` (4 parámetros) y
 * `consultatimbre` (7). Era correcto, pero era una segunda copia de la regla.
 *
 * El riesgo no es que hoy discrepen —hoy coinciden—: es que el día que DGII mueva el tope
 * se corrija una y la otra quede mintiendo. El síntoma sería un QR apuntando al servicio
 * equivocado en un comprobante ya impreso y entregado a la clienta, que es de los errores
 * que no se pueden deshacer.
 *
 * Este test compara la decisión VIEJA contra la NUEVA en todo el rango relevante. Se
 * escribió ANTES de consolidar, para no cambiar código certificado a ciegas.
 */

/** La expresión textual que vivía en `ri-generator.ts:380` antes de v500. */
function decisionVieja(tipo: string, monto: number): boolean {
  return tipo === "32" && monto < RFCE_MONTO_MAXIMO;
}

function decisionNueva(tipo: string, monto: number): boolean {
  return resolveEcfDelivery({ tipoEcf: tipo, montoTotalDop: monto }).kind === "rfce";
}

// PENDIENTE fase 3 (persistencia y orquestacion): el bloque entero guarda src/lib/dgii/ri-generator.ts, que DermaLand aún no tiene.
describe.skip("v500 — paridad entre la decisión vieja y la canónica", () => {
  const TIPOS = ["31", "32", "33", "34", "41", "43", "44", "45", "46", "47"];

  it("coinciden en todo el rango de montos, para todos los tipos", () => {
    // Barrido grueso de RD$0 a RD$500.000, más los bordes exactos donde un `<` mal puesto
    // se esconde: el tope, y un centavo a cada lado.
    const montos = [
      ...Array.from({ length: 101 }, (_, i) => i * 5_000),
      RFCE_MONTO_MAXIMO - 0.01,
      RFCE_MONTO_MAXIMO,
      RFCE_MONTO_MAXIMO + 0.01,
      0,
      0.01,
    ];
    const discrepancias: string[] = [];
    for (const tipo of TIPOS) {
      for (const monto of montos) {
        if (decisionVieja(tipo, monto) !== decisionNueva(tipo, monto)) {
          discrepancias.push(`tipo ${tipo} · RD$${monto}`);
        }
      }
    }
    expect(discrepancias, `la consolidación cambió el comportamiento en: ${discrepancias.join(", ")}`).toEqual([]);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/ri-generator.ts.
  it.skip("ri-generator ya no compara el umbral por su cuenta", () => {
    const src = leerSiExiste("src/lib/dgii/ri-generator.ts");
    const soloCodigo = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(soloCodigo).toMatch(/resolveEcfDelivery\(/);
    expect(soloCodigo, "quedó una comparación suelta del umbral").not.toMatch(/monto\s*<\s*RFCE_MONTO_MAXIMO/);
  });
});
