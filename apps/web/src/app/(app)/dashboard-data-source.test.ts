import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Regresión: las pantallas que muestran datos TRANSACCIONALES deben leerlos
 * de los hooks reactivos (Supabase o local según DATA_SOURCE), NO de los
 * seeds estáticos `mock*`. Este es el bug que dejó Laboratorios en 0 (v0.18),
 * el perfil de cliente en RD$0.00 (v0.38.1) y los KPIs/listados del dashboard
 * con cifras fijas (auditoría v0.38.2).
 *
 * Guardia: falla si una de estas páginas vuelve a importar un mock
 * transaccional en vez del hook.
 */

const APP = path.resolve(__dirname);

/** Fuente del archivo SIN comentarios (los comentarios explican el fix y
 * mencionan los mocks a propósito). */
function read(rel: string): string {
  const raw = fs.readFileSync(path.join(APP, rel), "utf8");
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "") // bloque
    .replace(/\/\/[^\n]*/g, ""); // línea
}

// Mocks TRANSACCIONALES prohibidos (tienen hook reactivo equivalente).
const FORBIDDEN = [
  "mockProformas",
  "mockProductLots",
  "totalStockForProduct",
  "mockCustomers",
];

const GUARDED_PAGES = [
  "page.tsx", // dashboard raíz
  "pagos/page.tsx",
  "inventario/bajo-stock/page.tsx",
  "inventario/recall/page.tsx",
  "clientes/[id]/page.tsx",
];

describe("pantallas usan hooks reactivos, no seeds transaccionales", () => {
  for (const page of GUARDED_PAGES) {
    it(`${page} no importa mocks transaccionales`, () => {
      const src = read(page);
      for (const symbol of FORBIDDEN) {
        expect(
          src.includes(symbol),
          `${page} no debe usar ${symbol} (usa el hook: useProformas/useAllLots/useProducts/useCustomers)`,
        ).toBe(false);
      }
    });
  }

  it("las páginas de datos vivos usan al menos un hook reactivo", () => {
    const hooks = ["useProformas", "useAllLots", "useProducts", "useCustomers"];
    for (const page of GUARDED_PAGES) {
      const src = read(page);
      expect(
        hooks.some((h) => src.includes(h)),
        `${page} debe leer datos con un hook reactivo`,
      ).toBe(true);
    }
  });
});
