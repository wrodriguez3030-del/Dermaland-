import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DGII_PERMISSIONS } from "@/features/dgii/permissions";

/**
 * Ninguna ruta fiscal sin portero.
 *
 * Esta prueba no comprueba una función: comprueba una PROPIEDAD del árbol de
 * rutas. Existe porque ocho rutas de `/api/dgii` se quedaron sin control de rol
 * y nadie se enteró — el portero del middleware exige sesión del negocio y eso
 * parecía suficiente, pero **la RLS valida el `business_id`, no el rol**
 * (DL-01).
 *
 * Un archivo nuevo bajo `/api/dgii` sin `authorizeDgii` hace fallar esto. Es el
 * único tipo de prueba que atrapa lo que alguien OLVIDA escribir.
 */

const RAIZ = join(process.cwd(), "src/app/api/dgii");

function rutas(dir: string): string[] {
  const encontradas: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) encontradas.push(...rutas(ruta));
    else if (entrada === "route.ts") encontradas.push(ruta);
  }
  return encontradas;
}

/** Los `export async function GET|POST|...` de un archivo de ruta. */
function handlers(fuente: string): string[] {
  return [...fuente.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\s*\(/g)].map(
    (m) => m[1]!,
  );
}

const ARCHIVOS = rutas(RAIZ);

describe("rutas /api/dgii", () => {
  it("hay rutas que revisar (si esto falla, la ruta base cambió)", () => {
    expect(ARCHIVOS.length).toBeGreaterThan(10);
  });

  it("TODAS piden un permiso fiscal", () => {
    const sinGuardia = ARCHIVOS.filter(
      (f) => !readFileSync(f, "utf8").includes("authorizeDgii("),
    ).map((f) => f.replace(RAIZ, ""));

    expect(sinGuardia, `Rutas fiscales sin authorizeDgii: ${sinGuardia.join(", ")}`)
      .toEqual([]);
  });

  it("cada handler exportado tiene el suyo, no solo el archivo", () => {
    // Un archivo con GET y POST donde solo uno comprueba el rol deja el otro
    // abierto, y a simple vista el archivo "tiene guardia".
    const problemas: string[] = [];
    for (const archivo of ARCHIVOS) {
      const fuente = readFileSync(archivo, "utf8");
      const metodos = handlers(fuente);
      const guardias = (fuente.match(/authorizeDgii\(/g) ?? []).length;
      if (metodos.length > guardias) {
        problemas.push(
          `${archivo.replace(RAIZ, "")}: ${metodos.length} handlers (${metodos.join(",")}) y ${guardias} guardias`,
        );
      }
    }
    expect(problemas, problemas.join(" · ")).toEqual([]);
  });

  it("los permisos usados existen de verdad", () => {
    const validos = new Set<string>(DGII_PERMISSIONS);
    const inventados: string[] = [];
    for (const archivo of ARCHIVOS) {
      for (const m of readFileSync(archivo, "utf8").matchAll(
        /authorizeDgii\("([^"]+)"\)/g,
      )) {
        if (!validos.has(m[1]!)) inventados.push(`${archivo.replace(RAIZ, "")}: ${m[1]}`);
      }
    }
    expect(inventados, inventados.join(" · ")).toEqual([]);
  });

  it("nada bajo /api/dgii puede ser público", () => {
    // Si alguien añadiera una ruta fiscal a PUBLIC_PATHS, quedaría abierta a
    // internet: el portero del middleware ni la miraría.
    const middleware = readFileSync(
      join(process.cwd(), "src/middleware.ts"),
      "utf8",
    );
    const publicas = [...middleware.matchAll(/"(\/api\/dgii[^"]*)"/g)].map((m) => m[1]);
    expect(publicas).toEqual([]);
  });
});
