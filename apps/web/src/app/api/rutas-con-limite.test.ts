import { describe, expect, it, vi } from "vitest";
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
 *
 * CORRECCIÓN post-revisión (Importantes 1 y 2 de
 * `review-tarea7-informe.md`): "lots/route.ts → productLot.list" salió de
 * la lista de comprobaciones de TEXTO de más abajo. Ese método ya traía,
 * antes de la tarea 7, un `.range()` ajeno al tope (paginaba el corte de
 * 1000 filas de PostgREST) — cualquier grep de ".range(" en el cuerpo del
 * método pasaba en verde aunque se revirtiera TODO el arreglo del tope. Ese
 * caso tiene ahora su propia guarda, más abajo en este archivo, que EJECUTA
 * `productLotRepository.list()` de verdad y mide el techo efectivo de
 * filas — y de paso comprueba que el repositorio distingue "un producto"
 * de "todos", que es lo que la ruta ya hacía y el repositorio no.
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
      nombre: "customers/route.ts → customer.list",
      archivo: "src/server/repositories/supabase/customer.ts",
      ancla: "export const customerRepository",
      firma: "async list(",
    },
    // "lots/route.ts → productLot.list" NO va en esta lista de texto: ver
    // la nota al principio del archivo y la guarda dedicada más abajo.
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

// ─── lots/route.ts → productLot.list: el TECHO EFECTIVO, no el texto ───────
//
// Por qué esta guarda no puede ser un grep de texto como las de arriba:
// `productLotRepository.list` ya tenía, ANTES de la tarea 7, un `.range()`
// para esquivar el corte de 1000 filas de PostgREST al traer TODO el
// inventario — una línea que no depende en nada de `opts.limit`,
// `TOPE_LOTES_*` ni de ningún `.slice()` final. Revertir SOLO el arreglo del
// tope (borrar las constantes, `limiteEfectivo`/`tamañoPagina`/`maxPaginas` y
// el recorte final, dejando `fetchAllPages(callback)` de un solo argumento
// como antes) deja ese `.range()` intacto: cualquier prueba que solo busque
// ".range(" o ".limit(" en el cuerpo del método sigue en verde con el
// arreglo completamente roto (Hallazgo Importante 1 de la revisión).
//
// Por eso esta guarda EJECUTA `productLotRepository.list()` de verdad,
// contra un Supabase falso que puede "servir" muchísimas más filas que
// cualquier tope, pidiendo un `limit` absurdamente alto, y mide el TAMAÑO
// REAL del array que vuelve. Eso es el techo efectivo — no lo que dice el
// texto del archivo. De paso cierra el Hallazgo Importante 2: comprueba que
// el repositorio aplica el techo BAJO cuando se pide un solo producto, no
// el alto de "todos" (antes, `TOPE_LOTES` único no distinguía los casos).
const estadoSupabaseFalso = vi.hoisted(() => ({ filasDisponibles: 0 }));

vi.mock("@/lib/supabase/server", () => ({
  createServer: async () => {
    const builder: Record<string, unknown> = {
      from() {
        return builder;
      },
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      gte() {
        return builder;
      },
      lte() {
        return builder;
      },
      lt() {
        return builder;
      },
      order() {
        return builder;
      },
      // El único método "terminal": simula una tabla con
      // `estadoSupabaseFalso.filasDisponibles` filas disponibles y devuelve
      // el tramo `[from, to]` pedido, tal como haría PostgREST.
      range(from: number, to: number) {
        const hasta = Math.min(to + 1, estadoSupabaseFalso.filasDisponibles);
        const cantidad = Math.max(0, hasta - from);
        const data = Array.from({ length: cantidad }, (_, i) => filaDeLoteFalsa(from + i));
        return Promise.resolve({ data, error: null });
      },
    };
    return builder;
  },
}));

import { productLotRepository } from "@/server/repositories/supabase/product";
import { TOPE_LOTES_PRODUCTO, TOPE_LOTES_TODOS } from "@/server/repositories/types";

/** Fila mínima de `product_lots`, completa para que `productLotRowToTs` no truene. */
function filaDeLoteFalsa(i: number) {
  return {
    id: `lot-${i}`,
    business_id: "biz-tope-test",
    branch_id: "branch-tope-test",
    product_id: "prod-tope-test",
    warehouse_id: "wh-tope-test",
    warehouse_location_id: null,
    lot_number: `L${i}`,
    manufactured_at: null,
    expires_at: "2027-01-01",
    received_at: "2026-01-01T00:00:00.000Z",
    initial_quantity: 10,
    current_quantity: 10,
    unit_cost: 1,
    unit_price: null,
    supplier_id: null,
    purchase_invoice: null,
    status: "available",
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("lots/route.ts → productLot.list: el techo efectivo de filas por escenario", () => {
  const ctx = { businessId: "biz-tope-test" };
  // Muy por encima de TOPE_LOTES_TODOS (20 000) y de TOPE_LOTES_PRODUCTO
  // (500): si el tope estuviera roto (o cayera al tope de seguridad de
  // 50 000 de `fetchAllPages`), hay filas de sobra para que se note.
  const FILAS_DISPONIBLES = 25_000;
  const PEDIDO_ENORME = 999_999;

  it("sin productId: nunca devuelve más filas que TOPE_LOTES_TODOS, aunque se pida mucho más", async () => {
    estadoSupabaseFalso.filasDisponibles = FILAS_DISPONIBLES;
    const filas = await productLotRepository.list(ctx, { limit: PEDIDO_ENORME });
    expect(filas).toHaveLength(TOPE_LOTES_TODOS);
  });

  it("con productId: el techo es el de UN producto (500) — no el de todos (20 000)", async () => {
    estadoSupabaseFalso.filasDisponibles = FILAS_DISPONIBLES;
    const filas = await productLotRepository.list(ctx, {
      productId: "prod-tope-test",
      limit: PEDIDO_ENORME,
    });
    expect(filas).toHaveLength(TOPE_LOTES_PRODUCTO);
  });

  it("respeta un pedido menor al tope (no siempre devuelve el tope completo)", async () => {
    estadoSupabaseFalso.filasDisponibles = FILAS_DISPONIBLES;
    const filas = await productLotRepository.list(ctx, {
      productId: "prod-tope-test",
      limit: 7,
    });
    expect(filas).toHaveLength(7);
  });
});
