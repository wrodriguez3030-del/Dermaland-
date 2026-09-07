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
    // Anclado en la función GRANDE: el fichero declara antes el ayudante
    // `nombre_vendedor_normalizado`, que también dice `language sql`.
    const desdeLaFuncion = codigoDesglose.indexOf(
      "create or replace function public.desglose_ventas_unificadas(",
    );
    expect(desdeLaFuncion, "no se encontró la función del desglose").toBeGreaterThan(-1);
    const returns = codigoDesglose.slice(
      codigoDesglose.indexOf("returns table", desdeLaFuncion),
      codigoDesglose.indexOf("language sql", desdeLaFuncion),
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

  it("🔴 la etiqueta de «sin vendedor» es la que se VE en la pantalla, no la de otro módulo", () => {
    // La mitad del sistema de esa misma tabla la pone `bySeller`
    // (features/sales/sales-report.ts), que para lo mismo dice «No asignado».
    // Antes esto se comparaba con `agregados.ts` («Sin vendedor»), un módulo
    // que esta pantalla no usa: la fila del SQL y la de al lado se habrían
    // llamado distinto si alguna vez se enseñaran juntas.
    const salesReport = readFileSync(
      resolve(process.cwd(), "src", "features", "sales", "sales-report.ts"),
      "utf8",
    );
    expect(salesReport, "bySeller ya no dice «No asignado»").toContain('"No asignado"');
    expect(codigoDesglose, "la migración ya no dice «No asignado»").toContain("'No asignado'");
    expect(codigoDesglose, "la migración volvió a la etiqueta que no se ve")
      .not.toContain("'Sin vendedor'");
  });

  it("🔴 la etiqueta de «sin forma de pago» sigue siendo la de agregados.ts", () => {
    const agregados = readFileSync(
      resolve(process.cwd(), "src", "features", "ventas", "agregados.ts"),
      "utf8",
    );
    expect(agregados).toContain('"Sin forma de pago"');
    expect(codigoDesglose).toContain("'Sin forma de pago'");
  });

  it("«Oficina» sale del guion que creó ese vendedor, no de la nada", () => {
    // Son las 8 197 facturas que Alegra dejó sin vendedor.
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
 * posible no desaparezcan. La comprobación contra la base real vive en
 * `scripts/db/verificar-desglose-ventas.mjs`.
 */
describe("desglose por vendedor — los cuatro estados de seller_id", () => {
  /** La rama de Alegra de la dimensión `vendedor`. */
  const rama = RAMAS.find((r) => r.dimension === "vendedor" && r.tabla === "alegra_invoices");

  it("hay rama de vendedor sobre alegra_invoices", () => {
    expect(rama, "desapareció la rama de vendedor de Alegra").toBeTruthy();
  });

  it("🔴 estado 1 — sin la columna, se NIEGA a correr y dice qué aplicar", () => {
    // Postgres valida el cuerpo de una función `language sql` al crearla, así
    // que sin la columna el error es «column ai.seller_id does not exist», que
    // no dice qué hacer. Esta guarda sí, y va ANTES de crear nada.
    expect(codigoDesglose).toMatch(
      /table_name = 'alegra_invoices'\s+and column_name = 'seller_id'/i,
    );
    expect(codigoDesglose).toMatch(
      /raise exception 'Falta aplicar antes 20260906120000_alegra_vendedor\.sql/i,
    );
    // Sobre el SQL CON comentarios: el `--apply` del comando lo confundiría
    // `sinComentarios` con un comentario de línea y se comería media frase.
    expect(sqlDesglose).toContain(
      "node scripts/db/apply-migration.mjs supabase/migrations/20260906120000_alegra_vendedor.sql --apply",
    );
    expect(
      codigoDesglose.search(/raise exception 'Falta aplicar antes 20260906120000/i),
      "la guarda va DESPUÉS de crear la función: no serviría de nada",
    ).toBeLessThan(
      codigoDesglose.indexOf("create or replace function public.desglose_ventas_unificadas("),
    );
  });

  it("🔴 estado 3 — agrupa por el enlace real (`seller_id` → `users.id`), no por el texto", () => {
    // Es la columna que 20260906120000 creó «para que los reportes por vendedor
    // y los incentivos funcionen […] no una comparación de cadenas en cada
    // consulta».
    expect(rama!.sql, "el lateral ya no busca por seller_id").toMatch(/u\.id\s*=\s*ai\.seller_id/);
    expect(rama!.sql, "la clave dejó de ser el usuario").toMatch(/coalesce\(\s*v\.id::text/);
    // Y la etiqueta es el nombre REAL de la persona, no el grito de Alegra.
    expect(rama!.sql, "la etiqueta ya no prefiere el nombre del usuario").toMatch(
      /coalesce\(\s*v\.full_name/,
    );
  });

  it("🔴 estados 2 y 4 — cae al nombre NORMALIZADO cuando no hay enlace", () => {
    // Sin esto, el día que el sync traiga «Desteny Reynoso» sin enlazar se
    // abriría una segunda fila para la misma persona, en la tarjeta que este
    // plan llama «base de incentivos».
    expect(rama!.sql).toMatch(/ai\.seller_id is null/i);
    expect(rama!.sql).toMatch(/nombre_vendedor_normalizado\(u\.full_name\)/);
    expect(rama!.sql).toMatch(/nombre_vendedor_normalizado\(ai\.seller_name\)/);
  });

  it("🔴 una factura sin vendedor busca al usuario «Oficina», no una fila suelta", () => {
    // Las 8 197 sin vendedor las ató el guion al usuario «Oficina». Una factura
    // nueva sin vendedor tiene que caer en ESE grupo.
    expect(rama!.sql).toMatch(
      /coalesce\(nullif\(public\.nombre_vendedor_normalizado\(ai\.seller_name\), ''\), 'OFICINA'\)/,
    );
  });

  it("🔴 el lateral trae UN vendedor como mucho: sin `limit 1` se duplicaría la factura", () => {
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

  it("🔴 el lateral no se sale de la empresa", () => {
    const lateral = rama!.sql.slice(rama!.sql.search(/left join lateral/i));
    expect(lateral).toMatch(/u\.business_id\s*=\s*ai\.business_id/);
  });
});

describe("nombre_vendedor_normalizado", () => {
  // Solo la función, hasta su `$$;`: el `comment on function` de más abajo
  // también lleva un literal largo y confundiría la cuenta de listas.
  const desde = codigoDesglose.indexOf(
    "create or replace function public.nombre_vendedor_normalizado(",
  );
  const fn = codigoDesglose.slice(desde, codigoDesglose.indexOf("$$;", desde) + 3);

  it("existe, es inmutable y no la puede llamar `anon`", () => {
    expect(fn).toMatch(/\bimmutable\b/i);
    expect(fn).toMatch(/set search_path = public/i);
    expect(codigoDesglose).toMatch(
      /revoke execute on function public\.nombre_vendedor_normalizado\(text\) from public, anon;/i,
    );
    expect(codigoDesglose).toMatch(
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
