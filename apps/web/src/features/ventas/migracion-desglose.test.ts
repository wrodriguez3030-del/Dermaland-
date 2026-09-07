import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DIMENSIONES_DESGLOSE, ETIQUETA_SIN_FORMA_PAGO } from "./venta-unificada";
import { ETIQUETA_SIN_SUCURSAL, MONTHS_ES } from "@/features/dashboard/dashboard-metrics";

/**
 * Las migraciones que traen `desglose_ventas_unificadas` no se pueden aplicar
 * desde aquí —las aplica el dueño— así que se prueban como se prueban las
 * migraciones en esta casa: leyendo el SQL y atándolo a lo que el resto del
 * código ya afirma (mismo patrón que `features/dgii/db/migracion-fase2.test.ts`).
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
 * Igual con las etiquetas: si el SQL y el TypeScript se renombran por separado,
 * la misma fila se llamaría de dos maneras según qué pantalla la pinte.
 *
 * 🔴 Y por qué el guardián DESCUBRE los ficheros en vez de nombrar uno:
 *
 * La función se reemplaza con `create or replace` desde una migración NUEVA
 * cada vez que hay que añadirle una dimensión (la primera ya está aplicada en
 * producción y no se puede editar). Si esta prueba mirara sólo el fichero que
 * conocía el día que se escribió, la versión que de verdad corre en la base se
 * quedaría SIN guardián: se podría perder el `status not in (...)` de una rama
 * nueva con la suite entera en verde. Así que se comprueban TODAS las
 * versiones, rama por rama, y la última —la que manda— además tiene que cubrir
 * todas las dimensiones que el TypeScript ofrece.
 */

const MIGRACIONES = resolve(process.cwd(), "..", "..", "supabase", "migrations");
const leer = (f: string) => readFileSync(resolve(MIGRACIONES, f), "utf8");

const RESUMEN = "20260906130000_resumen_ventas_unificadas.sql";
const CREA_LA_FUNCION = "create or replace function public.desglose_ventas_unificadas(";

/** Sin comentarios de línea: lo que se comprueba es CÓDIGO, no documentación. */
const sinComentarios = (sql: string) => sql.replace(/--.*$/gm, "");

/** Espacios colapsados: el formateo no puede hacer fallar (ni pasar) una comparación. */
const normalizar = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Toda migración que declare la función, ordenada por su fecha (el nombre del
 * fichero empieza por la marca de tiempo, así que ordenar por nombre ES
 * ordenar por fecha). La ÚLTIMA es la que deja la función viva en la base.
 */
function ficherosDelDesglose(): string[] {
  const encontrados = readdirSync(MIGRACIONES)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => leer(f).includes(CREA_LA_FUNCION))
    .sort();
  expect(encontrados.length, "ninguna migración declara desglose_ventas_unificadas").toBeGreaterThan(0);
  return encontrados;
}

const FICHEROS = ficherosDelDesglose();
/** La versión VIGENTE: la que gana en una base recién construida y en producción. */
const VIGENTE = FICHEROS[FICHEROS.length - 1]!;

const codigoResumen = sinComentarios(leer(RESUMEN));

/**
 * 🔴 Por qué esto NO usa `new Set`.
 *
 * La versión anterior recogía los `status not in (…)` de todo el fichero, los
 * metía en un conjunto y comparaba conjuntos. Un conjunto no sabe CUÁNTAS veces
 * aparece cada criterio: como el de Alegra se repite en varias ramas, BORRARLO
 * ENTERO de una de ellas dejaba el conjunto idéntico y la prueba en verde.
 * Comprobado: quitar `and ai.status not in ('void','draft')` de la rama de
 * `forma_pago` daba `12 passed`. La tarjeta «Medios de pago» habría empezado a
 * contar facturas anuladas, dejando de cuadrar con el KPI, sin un solo error.
 *
 * Así que se comprueba RAMA POR RAMA, y el mensaje de fallo dice cuál falta.
 */
interface Rama {
  /** Fichero de migración del que sale. */
  fichero: string;
  /** `vendedor`, `forma_pago`, `producto`, `sucursal`, `mes`… */
  dimension: string;
  /** Primera tabla de la rama: decide qué criterios le tocan. */
  tabla: string;
  sql: string;
}

/** Las ramas del `union all` de un fichero, una por dimensión y fuente. */
function ramasDe(fichero: string): Rama[] {
  const codigo = sinComentarios(leer(fichero));
  const desde = codigo.indexOf("from (");
  const hasta = codigo.indexOf(") as d");
  expect(desde, `${fichero}: no se encontró el \`from (\` del union`).toBeGreaterThan(-1);
  expect(hasta, `${fichero}: no se encontró el \`) as d\` que cierra el union`).toBeGreaterThan(desde);
  const cuerpo = codigo.slice(desde, hasta);

  return cuerpo.split(/\bunion all\b/i).map((sql, i) => {
    const dim = /p_dimension\s*=\s*'([a-z_]+)'/i.exec(sql);
    const tabla = /\bfrom\s+public\.([a-z_]+)/i.exec(sql);
    expect(dim, `${fichero}: la rama ${i + 1} no dice a qué dimensión pertenece`).toBeTruthy();
    expect(tabla, `${fichero}: la rama ${i + 1} no dice de qué tabla lee`).toBeTruthy();
    return { fichero, dimension: dim![1]!, tabla: tabla![1]!, sql };
  });
}

/** Código (sin comentarios) de cada versión, por fichero. */
const CODIGO = new Map(FICHEROS.map((f) => [f, sinComentarios(leer(f))]));
const codigoDe = (f: string) => CODIGO.get(f)!;

/** TODAS las ramas de TODAS las versiones, aplanadas: una entrada = un caso de prueba. */
const RAMAS: Rama[] = FICHEROS.flatMap(ramasDe);

/** Nombre legible de una rama, para que el fallo diga CUÁL es y de qué fichero. */
const nombre = (r: Rama) => `${r.fichero} · ${r.dimension} · ${r.tabla}`;

/** Cada rama como caso de `it.each`. */
const CASOS = RAMAS.map((r) => ({ nombre: nombre(r), rama: r }));
/** Cada versión del fichero como caso de `it.each`. */
const VERSIONES = FICHEROS.map((f) => ({ fichero: f }));

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

describe("desglose de ventas unificadas — las migraciones", () => {
  it("se descubre al menos una versión, y la vigente es la más reciente", () => {
    expect(FICHEROS).toContain("20260906140000_desglose_ventas_unificadas.sql");
    expect(VIGENTE).toBe(FICHEROS.slice().sort().at(-1));
  });

  it.each(CASOS)(
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

  it.each(CASOS)(
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

  it.each(CASOS)(
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

  it.each(CASOS)(
    "🔴 la rama $nombre filtra por business_id: un desglose no puede mezclar empresas",
    ({ rama }) => {
      expect(rama.sql, `la rama «${nombre(rama)}» no filtra por empresa`).toMatch(
        /business_id\s*=\s*p_business_id/i,
      );
    },
  );

  it.each(CASOS)("la rama $nombre dice de dónde sale cada fila, nunca a adivinar", ({ rama }) => {
    // Sin `origen`, una fila migrada se pintaría sin etiqueta —que es como se
    // pintan las del sistema— y el dinero de Alegra pasaría por propio.
    expect(rama.sql, `la rama «${nombre(rama)}» no declara su origen`).toMatch(
      /'(sistema|alegra)'::text\s+as origen/i,
    );
  });

  it.each(VERSIONES)("$fichero: en el join de producto se filtran LAS DOS tablas", ({ fichero }) => {
    // Los renglones traen su propio `business_id`: filtrar solo el de la
    // factura dejaría la puerta abierta a una fila de renglón de otra empresa
    // colada bajo una cabecera propia.
    const rama = RAMAS.find((r) => r.fichero === fichero && r.tabla === "alegra_invoice_items");
    expect(rama, `${fichero}: ya no hay rama de renglones`).toBeTruthy();
    expect(rama!.sql).toMatch(/ii\.business_id\s*=\s*p_business_id/i);
    expect(rama!.sql).toMatch(/ai\.business_id\s*=\s*p_business_id/i);
  });

  it.each(VERSIONES)(
    "$fichero es de la misma familia que la hermana: sql, stable, security invoker, search_path",
    ({ fichero }) => {
      const codigo = codigoDe(fichero);
      for (const rasgo of [/language sql/i, /\bstable\b/i, /security invoker/i, /set search_path = public/i]) {
        expect(codigo, `${fichero}: falta ${rasgo}`).toMatch(rasgo);
        expect(codigoResumen, `la hermana ya no lo tiene: ${rasgo}`).toMatch(rasgo);
      }
      // `security definer` saltaría la RLS: sería la diferencia entre "defensa en
      // profundidad" y "la única barrera es el parámetro que manda quien llama".
      expect(codigo).not.toMatch(/security definer/i);
    },
  );

  it.each(VERSIONES)("$fichero: no la puede llamar `anon`, sí `authenticated`", ({ fichero }) => {
    // 🔴 `create or replace` NO conserva los permisos: cada versión tiene que
    // volver a revocar y conceder, o la nueva quedaría abierta a `anon`.
    const codigo = codigoDe(fichero);
    const firma = /public\.desglose_ventas_unificadas\(uuid, date, date, uuid, uuid, text\)/;
    expect(codigo).toMatch(
      new RegExp(`revoke execute on function ${firma.source} from public, anon;`, "i"),
    );
    expect(codigo).toMatch(
      new RegExp(`grant execute on function ${firma.source} to authenticated;`, "i"),
    );
    // El revoke va ANTES del grant: al revés dejaría la función abierta.
    expect(codigo.search(/revoke execute on function public\.desglose/i))
      .toBeLessThan(codigo.search(/grant execute on function public\.desglose/i));
    // Y PostgREST tiene que enterarse, o la RPC seguiría dando 404.
    expect(codigo).toMatch(/notify pgrst, 'reload schema'/i);
  });

  it.each(VERSIONES)("$fichero 🔴 NO escribe nada: Alegra manda y DermaLand solo lee", ({ fichero }) => {
    const codigo = codigoDe(fichero);
    for (const escritura of [/\binsert\s+into\b/i, /\bupdate\s+public\./i, /\bdelete\s+from\b/i, /\btruncate\b/i, /\bdrop\s+table\b/i]) {
      expect(codigo, `${fichero}: la migración escribe: ${escritura}`).not.toMatch(escritura);
    }
    // Ni siquiera toca `proformas` para escribir: el punto de venta no entra
    // en este plan.
    expect(codigo).not.toMatch(/alter table public\.proformas/i);
  });

  it.each(VERSIONES)("$fichero devuelve las cinco columnas del contrato", ({ fichero }) => {
    // Anclado en la función GRANDE: un fichero puede declarar antes ayudantes
    // que también dicen `language sql`.
    const codigo = codigoDe(fichero);
    const desdeLaFuncion = codigo.indexOf(CREA_LA_FUNCION);
    expect(desdeLaFuncion, `${fichero}: no se encontró la función del desglose`).toBeGreaterThan(-1);
    const returns = codigo.slice(
      codigo.indexOf("returns table", desdeLaFuncion),
      codigo.indexOf("language sql", desdeLaFuncion),
    );
    for (const col of ["clave text", "etiqueta text", "origen text", "cantidad integer", "total numeric"]) {
      expect(returns, `${fichero}: falta la columna ${col}`).toMatch(new RegExp(col, "i"));
    }
  });

  it.each(VERSIONES)("$fichero: cada rama va condicionada por SU dimensión", ({ fichero }) => {
    // Sin eso, una llamada devolvería todas las dimensiones mezcladas y el
    // desglose sumaría varias veces el mismo dinero.
    const codigo = codigoDe(fichero);
    const tablas = codigo.match(/\bfrom public\.(proformas|alegra_invoices|alegra_invoice_items)\b/gi) ?? [];
    const condiciones = codigo.match(/p_dimension = '/g) ?? [];
    expect(condiciones.length).toBe(tablas.length);
  });

  it.each(VERSIONES)(
    "$fichero 🔴 la etiqueta de «sin vendedor» es la que se VE en la pantalla",
    ({ fichero }) => {
      // La mitad del sistema de esa misma tabla la pone `bySeller`
      // (features/sales/sales-report.ts), que para lo mismo dice «No asignado».
      // Antes esto se comparaba con `agregados.ts` («Sin vendedor»), un módulo
      // que esa pantalla no usa: la fila del SQL y la de al lado se habrían
      // llamado distinto si alguna vez se enseñaran juntas.
      const salesReport = readFileSync(
        resolve(process.cwd(), "src", "features", "sales", "sales-report.ts"),
        "utf8",
      );
      expect(salesReport, "bySeller ya no dice «No asignado»").toContain('"No asignado"');
      expect(codigoDe(fichero), `${fichero}: ya no dice «No asignado»`).toContain("'No asignado'");
      expect(codigoDe(fichero), `${fichero}: volvió a la etiqueta que no se ve`)
        .not.toContain("'Sin vendedor'");
    },
  );

  it.each(VERSIONES)(
    "$fichero 🔴 la etiqueta de «sin forma de pago» es la MISMA en el SQL y en el modelo",
    ({ fichero }) => {
      // Antes esto se comparaba contra `agregados.ts`, un módulo que no usaba
      // NADIE: la etiqueta que ve el usuario quedaba anclada a código muerto. La
      // constante vive ahora en el modelo compartido, que sí está vivo.
      expect(ETIQUETA_SIN_FORMA_PAGO).toBe("Sin forma de pago");
      expect(codigoDe(fichero)).toContain(`'${ETIQUETA_SIN_FORMA_PAGO}'`);
    },
  );

  it.each(VERSIONES)("$fichero: «Oficina» sale del guion que creó ese vendedor", ({ fichero }) => {
    // Son las 8 197 facturas que Alegra dejó sin vendedor.
    const guion = readFileSync(
      resolve(process.cwd(), "..", "..", "scripts", "alegra", "vincular-vendedores.mjs"),
      "utf8",
    );
    expect(guion).toContain('"Oficina"');
    expect(codigoDe(fichero)).toContain("'Oficina'");
  });

  it.each(VERSIONES)("$fichero une los renglones con SU factura y hereda sus filtros", ({ fichero }) => {
    const codigo = codigoDe(fichero);
    // La rama entera, desde su primera columna hasta el final: empezar en el
    // `from` dejaría fuera los agregados, que van arriba.
    const rama = codigo.slice(codigo.indexOf("coalesce(ii.product_id::text"));
    expect(rama).toMatch(/join public\.alegra_invoices ai on ai\.id = ii\.invoice_id/i);
    // El estado y la fecha se piden a la FACTURA (`ai`), no al renglón: un
    // renglón de una factura anulada no es una venta.
    expect(rama).toMatch(/ai\.status not in \('void', 'draft'\)/i);
    expect(rama).toMatch(/ai\.date >= p_desde/i);
    expect(rama).toMatch(/group by 1/i);
    expect(rama).toMatch(/sum\(ii\.total\)/i);
  });

  it.each(VERSIONES)("$fichero 🔴 tiene tope de filas y un orden estable", ({ fichero }) => {
    // 'producto' podría traer una fila por cada uno de los 1 487 productos
    // migrados.
    const codigo = codigoDe(fichero);
    expect(codigo).toMatch(/\blimit\s+200\b/i);
    // Y el tope se aplica sobre un orden ESTABLE: sin desempate, dos llamadas
    // seguidas podrían quedarse con filas distintas.
    expect(codigo).toMatch(/order by d\.total desc, d\.etiqueta, d\.origen/i);
  });
});

/**
 * 🔴 La versión VIGENTE es la que corre en la base. Estas comprobaciones son
 * las que atan lo que el TypeScript ofrece con lo que el SQL sabe hacer: una
 * dimensión declarada en `DIMENSIONES_DESGLOSE` sin su rama aquí no daría un
 * error, daría un desglose VACÍO — y en una tarjeta eso es indistinguible de
 * «no hubo ventas», que es el fallo entero de este trabajo.
 */
describe(`la migración vigente (${VIGENTE})`, () => {
  const codigo = codigoDe(VIGENTE);
  const ramas = RAMAS.filter((r) => r.fichero === VIGENTE);

  it("🔴 cubre EXACTAMENTE las dimensiones que ofrece el TypeScript", () => {
    const enElSql = [...new Set(ramas.map((r) => r.dimension))].sort();
    expect(enElSql).toEqual([...DIMENSIONES_DESGLOSE].sort());
  });

  it("cada dimensión tiene al menos una rama, y ninguna se queda sin tabla", () => {
    for (const dim of DIMENSIONES_DESGLOSE) {
      const suyas = ramas.filter((r) => r.dimension === dim);
      expect(suyas.length, `la dimensión ${dim} no tiene ninguna rama`).toBeGreaterThan(0);
      for (const r of suyas) expect(r.tabla).toBeTruthy();
    }
  });

  // ── sucursal ──────────────────────────────────────────────────────────────
  describe("dimensión `sucursal`", () => {
    const rama = ramas.find((r) => r.dimension === "sucursal");

    it("existe y lee de las facturas migradas", () => {
      expect(rama, "no hay rama de sucursal").toBeTruthy();
      expect(rama!.tabla).toBe("alegra_invoices");
    });

    it("agrupa por `branch_id`, no por el texto del nombre", () => {
      // Agrupar por nombre partiría una sucursal renombrada en dos filas.
      expect(rama!.sql).toMatch(/coalesce\(ai\.branch_id::text, ''\)\s+as clave/i);
    });

    it("🔴 la etiqueta es el NOMBRE REAL de la sucursal", () => {
      // Sin el join, la tarjeta enseñaría un UUID donde el dueño espera
      // «Dermaland Villa Olga».
      expect(rama!.sql).toMatch(/left join public\.branches b/i);
      expect(rama!.sql).toMatch(/on b\.id = ai\.branch_id/i);
      expect(rama!.sql).toMatch(/b\.name/);
    });

    it("🔴 el join de sucursales no se sale de la empresa", () => {
      expect(rama!.sql).toMatch(/b\.business_id = ai\.business_id/i);
    });

    it("🔴 sin sucursal dice lo MISMO que la mitad del sistema de esa tarjeta", () => {
      // `salesByBranch` (features/dashboard/dashboard-metrics.ts) pone
      // «Sin sucursal» en la misma tarjeta. Dos nombres para lo mismo serían
      // dos filas donde hay una.
      expect(ETIQUETA_SIN_SUCURSAL).toBe("Sin sucursal");
      expect(rama!.sql).toContain(`'${ETIQUETA_SIN_SUCURSAL}'`);
    });
  });

  // ── mes ───────────────────────────────────────────────────────────────────
  describe("dimensión `mes`", () => {
    const rama = ramas.find((r) => r.dimension === "mes");

    it("existe y lee de las facturas migradas", () => {
      expect(rama, "no hay rama de mes").toBeTruthy();
      expect(rama!.tabla).toBe("alegra_invoices");
    });

    it("🔴 agrupa por mes con `date_trunc`, y la clave es `YYYY-MM`", () => {
      // La clave la casa el navegador con los cubos de `mesesDeLaTendencia`.
      // Si aquí saliera «Sep 2026», el histórico no encontraría su punto y la
      // línea seguiría plana en cero.
      expect(rama!.sql).toMatch(/date_trunc\('month', ai\.date\)/i);
      expect(rama!.sql).toMatch(/to_char\(date_trunc\('month', ai\.date\), 'YYYY-MM'\)\s+as clave/i);
    });

    it("🔴 la etiqueta lleva los meses ESCRITOS, no el idioma del servidor", () => {
      // `to_char(..., 'Mon YYYY')` depende de `lc_time`: la misma consulta
      // devolvería «Sep», «sept.» o «Sep» en inglés según cómo esté
      // configurada la base, y el mes del sistema y el migrado dejarían de
      // caer en el mismo cubo.
      //
      // Se miran TODOS los literales de la rama: el único patrón de mes que se
      // admite es el `'month'` de `date_trunc`, que no imprime nada.
      const literales = [...rama!.sql.matchAll(/'([^']*)'/g)].map((m) => m[1]!);
      expect(literales.length, "la rama de mes se quedó sin literales que revisar").toBeGreaterThan(5);
      for (const lit of literales) {
        if (lit === "month") continue; // date_trunc('month', …): no imprime texto
        expect(
          lit,
          `«${lit}» parece un formato de to_char que escribe el mes en el idioma del servidor`,
        ).not.toMatch(/mon(th)?/i);
      }
      for (const mes of MONTHS_ES) {
        expect(rama!.sql, `al array de meses del SQL le falta «${mes}»`).toContain(`'${mes}'`);
      }
    });

    it("🔴 los doce meses del SQL están en el MISMO orden que `MONTHS_ES`", () => {
      // Un orden distinto no rompe nada visible: simplemente etiquetaría
      // septiembre como «Ago» y nadie lo notaría hasta cuadrar a mano.
      const array = /array\[([^\]]*)\]/i.exec(rama!.sql);
      expect(array, "la rama de mes ya no lleva su array de nombres").toBeTruthy();
      const nombres = [...array![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
      expect(nombres).toEqual([...MONTHS_ES]);
    });

    it("el año sale de la fecha, no de un literal", () => {
      expect(rama!.sql).toMatch(/to_char\(ai\.date, 'YYYY'\)/i);
    });
  });
});

/**
 * 🔴 El desglose por vendedor tiene que funcionar en los TRES estados de
 * `alegra_invoices.seller_id`, y en el cuarto que nadie nombra: el MIXTO.
 *
 * La columna la crea `20260906120000_alegra_vendedor.sql` y la rellena
 * `scripts/alegra/vincular-vendedores.mjs`. Entre una cosa y la otra hay
 * horas o días, y después el sincronizador diario trae facturas NUEVAS con la
 * columna vacía —su upsert no manda esa columna, lo dice la propia migración
 * que la creó—. O sea: el estado mixto no es una hipótesis, es el día 2.
 *
 *   1. Sin columna     → la migración se NIEGA a correr, y dice qué aplicar.
 *   2. Columna vacía   → cae al nombre normalizado. El reparto de hoy.
 *   3. Columna rellena → agrupa por `users.id` y etiqueta con el nombre real.
 *   4. Mixto           → una factura sin enlazar cae en el MISMO grupo que las
 *                        enlazadas de esa persona, no en una fila aparte.
 *
 * Comportamiento comprobado contra un Postgres 16 efímero (ver el informe de
 * la ronda de arreglos); lo que se guarda aquí es que las PIEZAS que lo hacen
 * posible no desaparezcan, en TODAS las versiones del fichero. La comprobación
 * contra la base real vive en `scripts/db/verificar-desglose-ventas.mjs`.
 */
describe("desglose por vendedor — los cuatro estados de seller_id", () => {
  /** La rama de Alegra de la dimensión `vendedor`, en cada versión del fichero. */
  const casos = FICHEROS.map((f) => ({
    fichero: f,
    rama: RAMAS.find((r) => r.fichero === f && r.dimension === "vendedor" && r.tabla === "alegra_invoices"),
  }));

  it.each(casos)("$fichero tiene rama de vendedor sobre alegra_invoices", ({ fichero, rama }) => {
    expect(rama, `${fichero}: desapareció la rama de vendedor de Alegra`).toBeTruthy();
  });

  it.each(casos)("$fichero 🔴 estado 1 — sin la columna, se NIEGA a correr", ({ fichero }) => {
    // Postgres valida el cuerpo de una función `language sql` al crearla, así
    // que sin la columna el error es «column ai.seller_id does not exist», que
    // no dice qué hacer. Esta guarda sí, y va ANTES de crear nada.
    const codigo = codigoDe(fichero);
    expect(codigo).toMatch(/table_name = 'alegra_invoices'\s+and column_name = 'seller_id'/i);
    expect(codigo).toMatch(/raise exception 'Falta aplicar antes 20260906120000_alegra_vendedor\.sql/i);
    // Sobre el SQL CON comentarios: el `--apply` del comando lo confundiría
    // `sinComentarios` con un comentario de línea y se comería media frase.
    expect(leer(fichero)).toContain(
      "node scripts/db/apply-migration.mjs supabase/migrations/20260906120000_alegra_vendedor.sql --apply",
    );
    expect(
      codigo.search(/raise exception 'Falta aplicar antes 20260906120000/i),
      `${fichero}: la guarda va DESPUÉS de crear la función: no serviría de nada`,
    ).toBeLessThan(codigo.indexOf(CREA_LA_FUNCION));
  });

  it.each(casos)(
    "$fichero 🔴 estado 3 — agrupa por el enlace real (`seller_id` → `users.id`)",
    ({ rama }) => {
      // Es la columna que 20260906120000 creó «para que los reportes por vendedor
      // y los incentivos funcionen […] no una comparación de cadenas en cada
      // consulta».
      expect(rama!.sql, "el lateral ya no busca por seller_id").toMatch(/u\.id\s*=\s*ai\.seller_id/);
      expect(rama!.sql, "la clave dejó de ser el usuario").toMatch(/coalesce\(\s*v\.id::text/);
      // Y la etiqueta es el nombre REAL de la persona, no el grito de Alegra.
      expect(rama!.sql, "la etiqueta ya no prefiere el nombre del usuario").toMatch(
        /coalesce\(\s*v\.full_name/,
      );
    },
  );

  it.each(casos)("$fichero 🔴 estados 2 y 4 — cae al nombre NORMALIZADO sin enlace", ({ rama }) => {
    // Sin esto, el día que el sync traiga «Desteny Reynoso» sin enlazar se
    // abriría una segunda fila para la misma persona, en la tarjeta que este
    // plan llama «base de incentivos».
    expect(rama!.sql).toMatch(/ai\.seller_id is null/i);
    expect(rama!.sql).toMatch(/nombre_vendedor_normalizado\(u\.full_name\)/);
    expect(rama!.sql).toMatch(/nombre_vendedor_normalizado\(ai\.seller_name\)/);
  });

  it.each(casos)("$fichero 🔴 una factura sin vendedor busca al usuario «Oficina»", ({ rama }) => {
    // Las 8 197 sin vendedor las ató el guion al usuario «Oficina». Una factura
    // nueva sin vendedor tiene que caer en ESE grupo.
    expect(rama!.sql).toMatch(
      /coalesce\(nullif\(public\.nombre_vendedor_normalizado\(ai\.seller_name\), ''\), 'OFICINA'\)/,
    );
  });

  it.each(casos)("$fichero 🔴 el lateral trae UN vendedor como mucho", ({ rama }) => {
    // Dos usuarios cuyo nombre normalice igual harían que el LEFT JOIN
    // devolviera dos filas por factura y el desglose contara el dinero dos
    // veces. Comprobado contra un Postgres 16 efímero: con `limit 1`, el
    // desglose sigue dando 7 facturas y RD$2 188,00 exactos.
    expect(rama!.sql).toMatch(/left join lateral/i);
    const lateral = rama!.sql.slice(rama!.sql.search(/left join lateral/i));
    expect(lateral, "el lateral perdió su `limit 1`").toMatch(/limit 1/i);
    // Y el enlace real manda sobre el emparejamiento por nombre.
    expect(lateral).toMatch(/order by \(u\.id = ai\.seller_id\) desc/);
  });

  it.each(casos)("$fichero 🔴 el lateral no se sale de la empresa", ({ rama }) => {
    const lateral = rama!.sql.slice(rama!.sql.search(/left join lateral/i));
    expect(lateral).toMatch(/u\.business_id\s*=\s*ai\.business_id/);
  });
});

describe("nombre_vendedor_normalizado", () => {
  /**
   * Se declara UNA vez, en la migración que lo estrenó. Las versiones
   * posteriores de la función lo LLAMAN pero no lo redeclaran: dos copias del
   * normalizador se separarían y «Laura Mejía» volvería a partirse en dos
   * filas. Aquí se descubre quién lo declara y quién lo usa.
   */
  const DECLARA = "create or replace function public.nombre_vendedor_normalizado(";
  const declarantes = FICHEROS.filter((f) => codigoDe(f).includes(DECLARA));

  it("🔴 lo declara UNA sola migración: dos copias se separarían", () => {
    expect(declarantes, "nadie declara el normalizador").toHaveLength(1);
  });

  it("🔴 toda versión que lo llame exige que exista antes de crear la función", () => {
    // La que lo declara se basta sola; las demás tienen que negarse a correr
    // si falta, o el error sería «function ... does not exist» y nadie sabría
    // qué aplicar.
    for (const f of FICHEROS) {
      if (declarantes.includes(f)) continue;
      const codigo = codigoDe(f);
      expect(codigo, `${f}: llama al normalizador`).toContain("public.nombre_vendedor_normalizado(");
      expect(codigo, `${f}: no comprueba que el normalizador exista`).toMatch(
        /to_regprocedure\('public\.nombre_vendedor_normalizado\(text\)'\) is null/i,
      );
      expect(
        codigo.search(/to_regprocedure\('public\.nombre_vendedor_normalizado/i),
        `${f}: la guarda va DESPUÉS de crear la función`,
      ).toBeLessThan(codigo.indexOf(CREA_LA_FUNCION));
    }
  });

  const fichero = declarantes[0]!;
  const codigo = codigoDe(fichero);
  // Solo la función, hasta su `$$;`: el `comment on function` de más abajo
  // también lleva un literal largo y confundiría la cuenta de listas.
  const desde = codigo.indexOf(DECLARA);
  const fn = codigo.slice(desde, codigo.indexOf("$$;", desde) + 3);

  it("existe, es inmutable y no la puede llamar `anon`", () => {
    expect(fn).toMatch(/\bimmutable\b/i);
    expect(fn).toMatch(/set search_path = public/i);
    expect(codigo).toMatch(
      /revoke execute on function public\.nombre_vendedor_normalizado\(text\) from public, anon;/i,
    );
    expect(codigo).toMatch(
      /grant execute on function public\.nombre_vendedor_normalizado\(text\) to authenticated;/i,
    );
  });

  it("🔴 quita mayúsculas, tildes Y los espacios de DENTRO", () => {
    // Los tres, y cada uno por su cuenta: comprobado contra un Postgres 16
    // efímero, sin el `regexp_replace` la variante «desteny  reynoso» (dos
    // espacios) abría una fila aparte para la misma persona.
    expect(fn, "ya no pasa a mayúsculas").toMatch(/\bupper\(/i);
    expect(fn, "ya no quita tildes").toMatch(/\btranslate\(/i);
    expect(fn, "ya no colapsa los espacios de dentro").toMatch(
      /regexp_replace\(btrim\(coalesce\(p_nombre, ''\)\), '\\s\+', ' ', 'g'\)/,
    );
  });

  it("🔴 las dos cadenas de `translate` tienen el MISMO largo", () => {
    // `translate` no avisa si la segunda es más corta: se limita a BORRAR los
    // caracteres que le sobran a la primera. Una tilde de más en la lista y
    // «Mejía» pasaría a «MEJA», partiendo a la persona en dos filas.
    // Las dos listas son los únicos literales largos de la función: el resto
    // ('\\s+', ' ', 'g') son de una letra o dos.
    const listas = [...fn.matchAll(/'([^']{10,})'/g)].map((x) => x[1]!);
    expect(listas.length, `se esperaban las dos listas de translate, hay ${listas.length}`).toBe(2);
    const [origen, destino] = listas as [string, string];
    expect([...origen].length, "sobran o faltan caracteres en la lista de reemplazo").toBe(
      [...destino].length,
    );
    // Y cubre de verdad las vocales acentuadas del español.
    for (const c of ["Á", "É", "Í", "Ó", "Ú", "Ñ", "á", "é", "í", "ó", "ú", "ñ"]) {
      expect([...origen], `el normalizador no conoce «${c}»`).toContain(c);
    }
  });
});
