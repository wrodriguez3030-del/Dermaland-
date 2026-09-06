// apps/web/src/features/dgii/services/server-only-imports.test.ts
//
// Menor (segunda tanda, revisión externa): `settings.ts` era el único de los
// cinco servicios de `features/dgii/services/` que llama a
// `createServiceRoleClient()` (la service-role key de Supabase) SIN
// `import "server-only"` como primera línea -- el resto (certificates.ts,
// enablement.ts, prepare.ts, storage.ts) sí lo tenía. Sin ese import,
// Next.js no impide que un Client Component importe el módulo por error y
// arrastre la clave hacia el bundle del navegador; con él, el build falla en
// el momento exacto en que alguien lo intente, no en producción.
//
// Esta prueba fija el invariante para los CINCO archivos a la vez, no solo
// para el que estaba roto: es la misma clase de hallazgo que el pliego de
// esta tanda pide vigilar en todo el sistema, no arreglar uno y dejar los
// demás a la suerte. Lee el archivo fuente directamente (no importa el
// módulo): a `settings.ts` le faltaba el import, pero el módulo igual se
// podía importar sin reventar bajo vitest -- el paquete `server-only` solo
// lanza cuando un bundler como Next.js lo resuelve para un Client Component,
// no en Node a secas -- así que la única forma fiable de comprobar la
// PRESENCIA del import es leer el texto del archivo.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Los cinco servicios de esta carpeta que llaman a `createServiceRoleClient()`. */
const SERVICIOS_CON_SERVICE_ROLE = [
  "certificates.ts",
  "enablement.ts",
  "prepare.ts",
  "settings.ts",
  "storage.ts",
];

describe("los servicios DGII que usan createServiceRoleClient son server-only", () => {
  it.each(SERVICIOS_CON_SERVICE_ROLE)('%s empieza con import "server-only"', (archivo) => {
    const contenido = readFileSync(join(__dirname, archivo), "utf8");
    const primeraLineaNoVacia = contenido.split("\n").find((linea) => linea.trim() !== "");
    expect(primeraLineaNoVacia?.trim()).toBe('import "server-only";');
  });
});
