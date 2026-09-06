import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guarda de regresión — Tarea 7 (ver `.superpowers/sdd/2026-09-06-alegra-
 * integrada-al-sistema/task-7-report.md` para el detalle de quién consume
 * cada ruta y por qué se eligió cada tope).
 *
 * Medido el 06/09/2026 contra producción: el panel descargaba ~3 MB en
 * 12 358 filas porque `/api/proformas`, `/api/lots` y `/api/customers` no
 * acotaban nada — el navegador contaba lo que la base podía contar en
 * milisegundos.
 *
 * Esta guarda comprueba DOS cosas, en DOS lugares distintos, porque así
 * quedó repartida la solución:
 *
 *  1. La RUTA (`route.ts`) decide un "pedido" por defecto y lo clampa con
 *     `Math.min(pedido, TOPE)` antes de pasarlo al repositorio — eso vive
 *     en el propio archivo de la ruta.
 *  2. El REPOSITORIO Supabase al que la ruta delega (`customer.ts`,
 *     `sales.ts`, `product.ts`) es quien de verdad acota la consulta con
 *     `.range()`/`.limit()` contra Postgres — las rutas son envoltorios
 *     HTTP delgados que nunca hablan con Supabase directamente, así que
 *     leer solo `route.ts` jamás vería esa llamada.
 *
 * Por lo mismo, el punto 2 no lee el archivo del repositorio COMPLETO:
 * `sales.ts` y `product.ts` ya tenían, antes de este arreglo, otras
 * consultas con `.limit(`/`.range(` (p.ej. `cashRegisterRepository` en
 * sales.ts, o `productRepository.list` en product.ts) — leer el archivo
 * entero habría dado un falso verde sin haber tocado la consulta que
 * realmente usa cada ruta. Por eso se extrae el CUERPO del método `list`
 * exacto (contando llaves) y se revisa solo ese bloque.
 */

const raiz = (relPath: string) => resolve(process.cwd(), relPath);
const lee = (relPath: string) => readFileSync(raiz(relPath), "utf8");

/** Quita comentarios de bloque y de línea — que no cuenten como "código". */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

/**
 * Extrae el cuerpo del método `firma` (p.ej. `"async list("`) que aparece
 * DESPUÉS de `ancla` (p.ej. `"export const proformaRepository"`) en
 * `archivo`, contando llaves para respetar los límites reales del método
 * sin depender de una expresión regular sobre código con anidamiento.
 */
function extraerMetodo(archivo: string, ancla: string, firma: string): string {
  const src = lee(archivo);
  const inicioAncla = src.indexOf(ancla);
  if (inicioAncla === -1) {
    throw new Error(`${archivo}: no se encontró el ancla "${ancla}"`);
  }
  const inicioFirma = src.indexOf(firma, inicioAncla);
  if (inicioFirma === -1) {
    throw new Error(`${archivo}: no se encontró "${firma}" después de "${ancla}"`);
  }
  const desdeLlave = src.indexOf("{", inicioFirma);
  if (desdeLlave === -1) {
    throw new Error(`${archivo}: "${firma}" no abre un bloque con "{"`);
  }
  let profundidad = 0;
  for (let i = desdeLlave; i < src.length; i++) {
    if (src[i] === "{") profundidad++;
    else if (src[i] === "}") {
      profundidad--;
      if (profundidad === 0) return src.slice(inicioFirma, i + 1);
    }
  }
  throw new Error(`${archivo}: llave sin cerrar para "${firma}"`);
}

describe("ninguna ruta de listado devuelve la tabla entera", () => {
  const rutas = [
    { nombre: "proformas/route.ts", archivo: "src/app/api/proformas/route.ts" },
    { nombre: "lots/route.ts", archivo: "src/app/api/lots/route.ts" },
    { nombre: "customers/route.ts", archivo: "src/app/api/customers/route.ts" },
  ];

  it.each(rutas)(
    "$nombre tiene un tope que quien llama no puede superar",
    ({ nombre, archivo }) => {
      const src = sinComentarios(lee(archivo));
      expect(src, `${nombre} deja que el cliente pida lo que quiera`).toMatch(
        /Math\.min|MAX_|TOPE_/,
      );
    },
  );

  const consultas = [
    {
      nombre: "proformas/route.ts → proforma.list",
      archivo: "src/server/repositories/supabase/sales.ts",
      ancla: "export const proformaRepository",
      firma: "async list(",
    },
    {
      nombre: "lots/route.ts → productLot.list",
      archivo: "src/server/repositories/supabase/product.ts",
      ancla: "export const productLotRepository",
      firma: "async list(",
    },
    {
      nombre: "customers/route.ts → customer.list",
      archivo: "src/server/repositories/supabase/customer.ts",
      ancla: "export const customerRepository",
      firma: "async list(",
    },
  ];

  it.each(consultas)(
    "$nombre acota la consulta real contra Supabase",
    ({ nombre, archivo, ancla, firma }) => {
      const bloque = sinComentarios(extraerMetodo(archivo, ancla, firma));
      expect(bloque, `${nombre} no limita nada en la consulta`).toMatch(
        /\.limit\(|\.range\(/,
      );
    },
  );
});
