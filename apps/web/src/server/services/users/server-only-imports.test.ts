import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * 🔴 Todo módulo que toque la service_role o la bóveda de claves lleva
 * `import "server-only"`.
 *
 * Sin ese import, nada impide que un componente de cliente lo importe por error
 * y arrastre al navegador la llave que abre TODAS las claves del sistema, o la
 * clave de servicio de Supabase. El paquete `server-only` hace que el build
 * falle en el momento exacto en que alguien lo intente, en vez de descubrirlo
 * en producción.
 *
 * El guardián DESCUBRE los archivos recorriendo las carpetas: una lista escrita
 * a mano protege lo que había el día que se escribió y deja sin vigilar todo lo
 * que venga después, que es justo cuando se cuela el error.
 */

const RAIZ = resolve(process.cwd(), "src");

/** Carpetas cuyos módulos son de servidor por definición. */
const CARPETAS = [
  join(RAIZ, "server", "services", "users"),
  join(RAIZ, "server", "crypto"),
  join(RAIZ, "server", "auth"),
];

/** Señales de que un módulo NO puede acabar en el navegador. */
const SENALES = [
  "createServiceRoleClient",
  "SUPABASE_SERVICE_ROLE_KEY",
  "USER_PASSWORD_VAULT_KEY",
  "auth.admin",
];

function fuentes(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const salida: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) salida.push(...fuentes(ruta));
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) salida.push(ruta);
  }
  return salida;
}

describe("los módulos de servidor no pueden acabar en el navegador", () => {
  it("🔴 todo módulo que toca la service_role o la bóveda importa `server-only`", () => {
    const archivos = CARPETAS.flatMap(fuentes);
    // Suelo contra el recorrido roto: si no encontrara archivos, el bucle
    // pasaría sin haber mirado nada.
    expect(archivos.length, "el recorrido no encontró módulos de servidor").toBeGreaterThan(3);

    const culpables: string[] = [];
    for (const archivo of archivos) {
      const texto = readFileSync(archivo, "utf8");
      const sensible = SENALES.some((s) => texto.includes(s));
      if (!sensible) continue;
      if (!/^import ["']server-only["'];/m.test(texto)) {
        culpables.push(archivo.slice(RAIZ.length));
      }
    }
    expect(
      culpables,
      `estos módulos tocan material de servidor sin \`import "server-only"\`:\n${culpables.join("\n")}`,
    ).toEqual([]);
  });
});
