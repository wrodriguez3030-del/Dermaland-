import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * La migración `20260906140000_desglose_ventas_unificadas.sql` no se puede
 * aplicar desde aquí —la aplica el dueño— así que se prueba como se prueban
 * las migraciones en esta casa: leyendo el SQL y atándolo a lo que el resto
 * del código ya afirma (mismo patrón que
 * `features/dgii/db/migracion-fase2.test.ts`).
 *
 * 🔴 Lo que de verdad protege este archivo:
 *
 * Los desgloses tienen que SUMAR EL MISMO TOTAL que el KPI de arriba, que sale
 * de la función hermana `resumen_ventas_unificadas`. Si un día alguien toca
 * los estados excluidos o el rango de fechas de UNA de las dos funciones, la
 * pantalla enseñaría un total de RD$48 millones y un desglose que suma otra
 * cosa, sin un solo error: exactamente el descuadre mudo que este plan vino a
 * cerrar. No hay forma de compartir código entre dos funciones SQL, así que el
 * criterio está duplicado a propósito — y esta prueba es lo único que impide
 * que las dos copias se separen.
 *
 * Igual con las etiquetas: «Sin vendedor» y «Sin forma de pago» son las que ya
 * usa `agregados.ts` para lo mismo. Si allí se renombran y aquí no, la misma
 * fila se llamaría de dos maneras según qué pantalla la pinte.
 */

const MIGRACIONES = resolve(process.cwd(), "..", "..", "supabase", "migrations");
const leer = (f: string) => readFileSync(resolve(MIGRACIONES, f), "utf8");

const DESGLOSE = "20260906140000_desglose_ventas_unificadas.sql";
const RESUMEN = "20260906130000_resumen_ventas_unificadas.sql";

/** Sin comentarios de línea: lo que se comprueba es CÓDIGO, no documentación. */
const sinComentarios = (sql: string) => sql.replace(/--.*$/gm, "");

const sqlDesglose = leer(DESGLOSE);
const codigoDesglose = sinComentarios(sqlDesglose);
const codigoResumen = sinComentarios(leer(RESUMEN));

/** Espacios colapsados: el formateo no puede hacer fallar (ni pasar) una comparación. */
const normalizar = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * 🔴 Por qué esto NO usa `new Set`.
 *
 * La versión anterior recogía los `status not in (…)` de todo el fichero, los
 * metía en un conjunto y comparaba conjuntos. Un conjunto no sabe CUÁNTAS veces
 * aparece cada criterio: como el de Alegra se repite en tres ramas, BORRARLO
 * ENTERO de una de ellas dejaba el conjunto idéntico y la prueba en verde.
 * Comprobado: quitar `and ai.status not in ('void','draft')` de la rama de
 * `forma_pago` daba `12 passed`. La tarjeta «Medios de pago» habría empezado a
 * contar facturas anuladas, dejando de cuadrar con el KPI, sin un solo error.
 *
 * Así que se comprueba RAMA POR RAMA, y el mensaje de fallo dice cuál falta.
 */
interface Rama {
  /** `vendedor`, `forma_pago`, `producto`… la dimensión que activa la rama. */
  dimension: string;
  /** Primera tabla de la rama: decide qué criterios le tocan. */
  tabla: string;
  sql: string;
}

/** Las ramas del `union all` del desglose, una por dimensión y fuente. */
function ramasDelDesglose(): Rama[] {
  const desde = codigoDesglose.indexOf("from (");
  const hasta = codigoDesglose.indexOf(") as d");
  expect(desde, "no se encontró el `from (` del union").toBeGreaterThan(-1);
  expect(hasta, "no se encontró el `) as d` que cierra el union").toBeGreaterThan(desde);
  const cuerpo = codigoDesglose.slice(desde, hasta);

  return cuerpo.split(/\bunion all\b/i).map((sql, i) => {
    const dim = /p_dimension\s*=\s*'([a-z_]+)'/i.exec(sql);
    const tabla = /\bfrom\s+public\.([a-z_]+)/i.exec(sql);
    expect(dim, `la rama ${i + 1} no dice a qué dimensión pertenece`).toBeTruthy();
    expect(tabla, `la rama ${i + 1} no dice de qué tabla lee`).toBeTruthy();
    return { dimension: dim![1]!, tabla: tabla![1]!, sql };
  });
}

const RAMAS = ramasDelDesglose();

/** Nombre legible de una rama, para que el fallo diga CUÁL es. */
const nombre = (r: Rama) => `${r.dimension} · ${r.tabla}`;

/** El `status not in (...)` de una rama, normalizado. `null` si NO tiene ninguno. */
function estadoExcluidoDe(r: Rama): string | null {
  const m = /status\s+not\s+in\s*\(([^)]*)\)/i.exec(r.sql);
  return m ? normalizar(m[1]!) : null;
}

/** Los dos `status not in (...)` de la función hermana, en el orden en que salen. */
function estadosDeLaHermana(): { proformas: string; alegra: string } {
  const todos = [...codigoResumen.matchAll(/status\s+not\s+in\s*\(([^)]*)\)/gi)].map((m) =>
    normalizar(m[1]!),
  );
  expect(todos.length, "la hermana ya no declara exactamente dos listas de estados").toBe(2);
  return { proformas: todos[0]!, alegra: todos[1]! };
}

describe("desglose de ventas unificadas — la migración", () => {
  it("hay una rama por dimensión y fuente, y todas se declaran", () => {
    // Si se añade una quinta, las comprobaciones de abajo la cubren sola: van
    // rama por rama, no por lista escrita a mano.
    expect(RAMAS.length).toBeGreaterThanOrEqual(4);
    expect([...new Set(RAMAS.map((r) => r.dimension))].sort()).toEqual([
      "forma_pago",
      "producto",
      "vendedor",
    ]);
  });

  it.each(RAMAS.map((r) => ({ nombre: nombre(r), rama: r })))(
    "🔴 la rama $nombre excluye los estados que manda la función hermana",
    ({ rama }) => {
      // Si esto se pone rojo, esa rama del desglose y el KPI han dejado de
      // contar lo mismo: hay que arreglar las DOS migraciones, no relajar la
      // prueba. Se comprueba UNA A UNA porque borrar el criterio de una sola
      // rama no cambia la lista global de criterios del fichero.
      const hermana = estadosDeLaHermana();
      const esperado = rama.tabla === "proformas" ? hermana.proformas : hermana.alegra;
      expect(
        estadoExcluidoDe(rama),
        `la rama «${nombre(rama)}» no excluye ningún estado: las anuladas contarían`,
      ).toBe(esperado);
    },
  );

  it("las dos listas de estados son las de la casa, no unas cualesquiera", () => {
    const hermana = estadosDeLaHermana();
    expect(hermana.proformas).toBe("'cancelled', 'draft', 'expired', 'voided'");
    expect(hermana.alegra).toBe("'void', 'draft'");
  });

  it.each(RAMAS.map((r) => ({ nombre: nombre(r), rama: r })))(
    "🔴 la rama $nombre recorta las fechas EXACTAMENTE igual que la función hermana",
    ({ rama }) => {
      // `proformas` va por `created_at` con el límite superior EXCLUSIVO
      // (`< hasta + 1 día`, porque es timestamptz) y `alegra_invoices` por
      // `date` con el límite INCLUSIVO. Perder UNO de los dos extremos en UNA
      // rama mete en el desglose facturas fuera del rango del reporte.
      const esperados =
        rama.tabla === "proformas"
          ? [/pf\.created_at\s*>=\s*p_desde::timestamptz/i, /pf\.created_at\s*<\s*\(p_hasta \+ 1\)::timestamptz/i]
          : [/ai\.date\s*>=\s*p_desde/i, /ai\.date\s*<=\s*p_hasta/i];
      for (const esperado of esperados) {
        expect(
          rama.sql,
          `la rama «${nombre(rama)}» perdió el predicado ${esperado}`,
        ).toMatch(esperado);
      }
      // Y los dos extremos van guardados por el `is null` de siempre, para que
      // un filtro vacío no recorte nada.
      expect(rama.sql).toMatch(/p_desde is null or/i);
      expect(rama.sql).toMatch(/p_hasta is null or/i);
    },
  );

  it.each(RAMAS.map((r) => ({ nombre: nombre(r), rama: r })))(
    "🔴 la rama $nombre filtra por cliente y sucursal como la hermana",
    ({ rama }) => {
      expect(rama.sql, `la rama «${nombre(rama)}» ignora el filtro de cliente`).toMatch(
        /p_cliente_id is null or/i,
      );
      expect(rama.sql, `la rama «${nombre(rama)}» ignora el filtro de sucursal`).toMatch(
        /p_sucursal_id is null or/i,
      );
    },
  );

  it.each(RAMAS.map((r) => ({ nombre: nombre(r), rama: r })))(
    "🔴 la rama $nombre filtra por business_id: un desglose no puede mezclar empresas",
    ({ rama }) => {
      expect(rama.sql, `la rama «${nombre(rama)}» no filtra por empresa`).toMatch(
        /business_id\s*=\s*p_business_id/i,
      );
    },
  );

  it("🔴 en el join de producto se filtran LAS DOS tablas, no solo la cabecera", () => {
    // Los renglones traen su propio `business_id`: filtrar solo el de la
    // factura dejaría la puerta abierta a una fila de renglón de otra empresa
    // colada bajo una cabecera propia.
    const rama = RAMAS.find((r) => r.tabla === "alegra_invoice_items");
    expect(rama, "ya no hay rama de renglones").toBeTruthy();
    expect(rama!.sql).toMatch(/ii\.business_id\s*=\s*p_business_id/i);
    expect(rama!.sql).toMatch(/ai\.business_id\s*=\s*p_business_id/i);
  });

  it("es de la misma familia que la hermana: sql, stable, security invoker, search_path", () => {
    for (const rasgo of [/language sql/i, /\bstable\b/i, /security invoker/i, /set search_path = public/i]) {
      expect(codigoDesglose, `falta ${rasgo}`).toMatch(rasgo);
      expect(codigoResumen, `la hermana ya no lo tiene: ${rasgo}`).toMatch(rasgo);
    }
    // `security definer` saltaría la RLS: sería la diferencia entre "defensa en
    // profundidad" y "la única barrera es el parámetro que manda quien llama".
    expect(codigoDesglose).not.toMatch(/security definer/i);
  });

  it("no la puede llamar `anon`, sí `authenticated`, y PostgREST se entera", () => {
    const firma = /public\.desglose_ventas_unificadas\(uuid, date, date, uuid, uuid, text\)/;
    expect(codigoDesglose).toMatch(
      new RegExp(`revoke execute on function ${firma.source} from public, anon;`, "i"),
    );
    expect(codigoDesglose).toMatch(
      new RegExp(`grant execute on function ${firma.source} to authenticated;`, "i"),
    );
    // El revoke va ANTES del grant: al revés dejaría la función abierta.
    expect(codigoDesglose.search(/revoke execute on function public\.desglose/i))
      .toBeLessThan(codigoDesglose.search(/grant execute on function public\.desglose/i));
    expect(codigoDesglose).toMatch(/notify pgrst, 'reload schema'/i);
  });

  it("🔴 NO escribe nada: Alegra manda y DermaLand solo lee", () => {
    for (const escritura of [/\binsert\s+into\b/i, /\bupdate\s+public\./i, /\bdelete\s+from\b/i, /\btruncate\b/i, /\bdrop\s+table\b/i]) {
      expect(codigoDesglose, `la migración escribe: ${escritura}`).not.toMatch(escritura);
    }
    // Ni siquiera toca `proformas` para escribir: el punto de venta no entra
    // en este plan.
    expect(codigoDesglose).not.toMatch(/alter table public\.proformas/i);
  });

  it("devuelve las cinco columnas del contrato, con `origen` entre ellas", () => {
    const returns = codigoDesglose.slice(
      codigoDesglose.indexOf("returns table"),
      codigoDesglose.indexOf("language sql"),
    );
    for (const col of ["clave text", "etiqueta text", "origen text", "cantidad integer", "total numeric"]) {
      expect(returns, `falta la columna ${col}`).toMatch(new RegExp(col, "i"));
    }
  });

  it("cada fila dice de dónde sale: 'sistema' o 'alegra', nunca a adivinar", () => {
    expect(codigoDesglose).toMatch(/'sistema'::text\s+as origen/i);
    expect(codigoDesglose).toMatch(/'alegra'::text\s+as origen/i);
  });

  it("las tres dimensiones están, y una desconocida no devuelve filas de otra", () => {
    for (const dim of ["vendedor", "forma_pago", "producto"]) {
      expect(codigoDesglose, `falta la dimensión ${dim}`).toMatch(
        new RegExp(`p_dimension = '${dim}'`, "i"),
      );
    }
    // Cada rama del `union all` va condicionada por su dimensión: sin eso, una
    // llamada devolvería las tres mezcladas y el desglose sumaría tres veces.
    const ramas = codigoDesglose.match(/\bfrom public\.(proformas|alegra_invoices|alegra_invoice_items)\b/gi) ?? [];
    const condiciones = codigoDesglose.match(/p_dimension = '/g) ?? [];
    expect(condiciones.length).toBe(ramas.length);
  });

  it("🔴 usa las MISMAS etiquetas de «sin dato» que agregados.ts", () => {
    // Si allí se renombran, la misma fila se llamaría de dos maneras según qué
    // pantalla la pinte.
    const agregados = readFileSync(
      resolve(process.cwd(), "src", "features", "ventas", "agregados.ts"),
      "utf8",
    );
    for (const etiqueta of ["Sin vendedor", "Sin forma de pago"]) {
      expect(agregados, `agregados.ts ya no dice «${etiqueta}»`).toContain(`"${etiqueta}"`);
      expect(codigoDesglose, `la migración ya no dice «${etiqueta}»`).toContain(`'${etiqueta}'`);
    }
    // «Oficina» no sale de agregados.ts sino del guion que creó ese vendedor:
    // son las 8 197 facturas que Alegra dejó sin vendedor.
    const guion = readFileSync(
      resolve(process.cwd(), "..", "..", "scripts", "alegra", "vincular-vendedores.mjs"),
      "utf8",
    );
    expect(guion).toContain('"Oficina"');
    expect(codigoDesglose).toContain("'Oficina'");
  });

  it("el desglose por producto une los renglones con SU factura y hereda sus filtros", () => {
    // La rama entera, desde su primera columna hasta el cierre del `union all`:
    // empezar en el `from` dejaría fuera los agregados, que van arriba.
    const rama = codigoDesglose.slice(codigoDesglose.indexOf("coalesce(ii.product_id::text"));
    expect(rama).toMatch(/join public\.alegra_invoices ai on ai\.id = ii\.invoice_id/i);
    // El estado y la fecha se piden a la FACTURA (`ai`), no al renglón: un
    // renglón de una factura anulada no es una venta.
    expect(rama).toMatch(/ai\.status not in \('void', 'draft'\)/i);
    expect(rama).toMatch(/ai\.date >= p_desde/i);
    expect(rama).toMatch(/group by 1/i);
    expect(rama).toMatch(/sum\(ii\.total\)/i);
  });

  it("🔴 tiene tope de filas: ninguna consulta de este plan devuelve la tabla entera", () => {
    // 'producto' podría traer una fila por cada uno de los 1 487 productos
    // migrados.
    expect(codigoDesglose).toMatch(/\blimit\s+200\b/i);
    // Y el tope se aplica sobre un orden ESTABLE: sin desempate, dos llamadas
    // seguidas podrían quedarse con filas distintas.
    expect(codigoDesglose).toMatch(/order by d\.total desc, d\.etiqueta, d\.origen/i);
  });
});
