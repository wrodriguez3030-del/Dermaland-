/**
 * Huella del esquema: lo que hay que comparar para que un simulacro sea una
 * PRUEBA y no un teatro. Un dump puede restaurar sin un solo error y aun asi
 * llegar incompleto.
 *
 * Siete dimensiones (revision 2, 2026-08-05 — la revision 1 solo tenia
 * cuatro y una revision de codigo encontro que eran insuficientes):
 *   filas         — conteo EXACTO por tabla (no la estimacion de
 *                    pg_stat_user_tables). Cubre TODA `public` mas las
 *                    tablas DURABLES de `auth` y `storage` (ver
 *                    TABLAS_EXTRA_FILAS abajo, donde esta la lista
 *                    completa con el porque de cada inclusion y de cada
 *                    exclusion). Sigue sin barrerse el estado efimero
 *                    (auth.sessions, auth.refresh_tokens,
 *                    storage.s3_multipart_uploads...): eso NUNCA va a
 *                    coincidir entre produccion "ahora mismo" y una copia
 *                    restaurada despues, haria fallar el comparador
 *                    SIEMPRE incluso con una restauracion perfecta, y un
 *                    comparador que siempre grita se termina ignorando.
 *   funciones     — nombre + firma (solo public: son las funciones propias
 *                    de la aplicacion, no las internas de las extensiones).
 *   politicas     — conteo de RLS por tabla; cubre public + storage.objects
 *                    (produccion tiene 101 politicas en public y 5 en
 *                    storage.objects — perderlas en silencio es exactamente
 *                    el caso que motivo este campo).
 *   rls           — relrowsecurity (encendido/apagado) por tabla. NO es lo
 *                    mismo que `politicas`: una tabla puede seguir listando
 *                    sus politicas en pg_policies despues de un
 *                    `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` — las
 *                    politicas quedan definidas pero dejan de aplicarse.
 *                    Sin este campo esa desactivacion pasa invisible.
 *   definiciones  — hash (cmd + roles + USING + WITH CHECK) por politica,
 *                    con clave "tabla:policyname" (o "schema.tabla:policyname"
 *                    fuera de public). Un conteo de politicas puede
 *                    coincidir (4 y 4) con una condicion completamente
 *                    distinta por debajo — por ejemplo `USING (true)` en
 *                    vez de `USING (business_id = auth_business_id())`,
 *                    que es fuga total entre inquilinos con la MISMA
 *                    cantidad de politicas. Este campo es lo unico que lo
 *                    detecta.
 *   indices       — presencia por nombre (solo public).
 *   restricciones — nombres de constraints FOREIGN KEY y CHECK (solo
 *                    public). Un restore puede completarse "sin un solo
 *                    error" y aun asi perder las ~325 FK/CHECK reales de
 *                    produccion (por ejemplo con --data-only, o con un
 *                    orden de carga que las omite): eso no rompe ninguna
 *                    fila existente, pero deja la integridad referencial
 *                    sin aplicar hacia adelante — exactamente el modo de
 *                    falla que describe el parrafo de arriba, y ninguna de
 *                    las otras seis dimensiones lo detecta. Deliberadamente
 *                    NO se agregan vistas/secuencias/triggers como
 *                    dimensiones propias: produccion solo tiene 1 de cada
 *                    una (bajisimo impacto comparado con 325 constraints) y
 *                    pg_dump las arrastra junto con la tabla que las posee,
 *                    a diferencia de las FK que se pueden omitir
 *                    deliberadamente en un restore parcial.
 *
 * IMPORTANTE — huella de PRODUCCION degenerada (revision 2): antes de
 * comparar, diffFingerprints EXIGE que `prod` tenga contenido creible en
 * cada dimension (produccion no puede tener cero tablas, cero politicas,
 * cero funciones...). Sin esa guarda, un `prod` vacio, mal parseado (por
 * ejemplo la cadena JSON cruda en vez del objeto) o apuntado a un DSN
 * equivocado se compara como "no falta nada" — cero elementos esperados,
 * cero problemas encontrados. Eso convierte el simulacro en un comparador
 * que siempre aprueba, que es peor que no tener comparador.
 *
 * Verificado 2026-08-05 contra produccion real (sntcvyozbhrgicwmtcoh, via
 * conexion Postgres directa con SUPABASE_DB_URL): 83 tablas base en public
 * (coincide con dermaland-footprint.mjs), 101 politicas RLS en public + 5
 * en storage.objects = 106 en total, las 83 tablas de public con
 * relrowsecurity=true, 219 indices, 219 FK + 106 CHECK = 325 restricciones,
 * 642 filas en storage.objects, 3 en storage.buckets, 3 en auth.users, 3 en
 * auth.identities y 0 en auth.mfa_factors (que se rastrea vacia a proposito:
 * ver TABLAS_EXTRA_FILAS). Con la revision 4 la dimension `filas` pasa de 86
 * a 98 tablas rastreadas: 83 de public + 10 de auth + 5 de storage.
 */

/**
 * Tablas fuera de `public` cuyo conteo de filas SI se rastrea.
 *
 * REVISION 4 (2026-08-05) — una revision de codigo encontro que la revision
 * anterior solo rastreaba `auth.users` y por tanto **ignoraba 22 de las 23
 * tablas de `auth`**. El agujero era concreto y grave: si el respaldo perdiera
 * entera `auth.mfa_factors`, el simulacro seguiria imprimiendo PASA y "las
 * siete dimensiones cuadran al 100 %" — y esa tabla es justo de la que depende
 * el 2FA obligatorio (B-04). Los datos SI estaban en el dump (es un `pg_dump`
 * completo): era un hueco de VERIFICACION, no de respaldo. Peor por eso: el
 * simulacro habria certificado como intacto un respaldo mutilado.
 *
 * El criterio para entrar aqui, aplicado a las 23 de `auth` y las 8 de
 * `storage`, es uno solo:
 *
 *   Se rastrea lo DURABLE — identidad, credenciales enroladas y configuracion
 *   de tenant, o sea lo que un desastre perderia de forma irrecuperable.
 *   Se deja fuera el estado EN VUELO (sesiones, retos, codigos de un solo uso,
 *   subidas a medias) y los libros internos del propio servicio.
 *
 * Una tabla durable con CERO filas se rastrea igual, y no es un descuido: si
 * desaparece entera de la copia, `diffFingerprints` la reporta como "Tabla
 * ausente". Para `auth.mfa_factors` —hoy vacia, mañana con los factores de los
 * dos admins— esa es exactamente la garantia que hacia falta.
 *
 * Contado en produccion el 2026-08-05: auth 23 tablas (10 durables, 13
 * efimeras), storage 8 (5 durables, 3 efimeras).
 *
 * ── auth: por que se DEJAN FUERA 13 ──────────────────────────────────────────
 *   sessions, refresh_tokens, mfa_amr_claims  estado de sesion; cambia cada vez
 *                                             que alguien entra o refresca. Con
 *                                             8 y 4 filas vivas, incluirlas
 *                                             haria fallar el simulacro siempre.
 *   mfa_challenges, webauthn_challenges       retos EN VUELO, viven segundos.
 *   flow_state, one_time_tokens               PKCE y enlaces de un solo uso.
 *   saml_relay_states, oauth_authorizations,  intercambios a medio completar.
 *   oauth_client_states
 *   audit_log_entries                         bitacora que crece con cada evento
 *                                             de auth y que GoTrue va podando.
 *   schema_migrations                         libro interno de GoTrue: describe
 *                                             la VERSION del servicio, no
 *                                             nuestros datos.
 *   instances                                 registro multi-instancia heredado,
 *                                             sin uso en Supabase Cloud.
 *
 * ── storage: por que se DEJAN FUERA 3 ────────────────────────────────────────
 *   s3_multipart_uploads, ..._parts           subidas a medias; puro estado en
 *                                             vuelo.
 *   migrations                                libro interno del servicio Storage.
 *
 * Todas las excluidas SIGUEN viniendo dentro del respaldo (`pg_dump` es
 * completo); lo que no se hace es exigir que su conteo de filas coincida.
 */
const TABLAS_EXTRA_FILAS = [
  // auth — identidad y credenciales enroladas (10 de 23).
  { schema: "auth", tabla: "users" }, // la base de usuarios entera
  { schema: "auth", tabla: "identities" }, // sin esto nadie puede volver a entrar con su proveedor
  { schema: "auth", tabla: "mfa_factors" }, // los factores 2FA enrolados — de esto depende B-04
  { schema: "auth", tabla: "webauthn_credentials" }, // llaves de acceso enroladas; misma clase que mfa_factors
  { schema: "auth", tabla: "sso_providers" },
  { schema: "auth", tabla: "sso_domains" },
  { schema: "auth", tabla: "saml_providers" },
  { schema: "auth", tabla: "oauth_clients" },
  { schema: "auth", tabla: "oauth_consents" }, // consentimientos concedidos; sobreviven a la sesion
  { schema: "auth", tabla: "custom_oauth_providers" },
  // storage — que buckets existen y que hay dentro (5 de 8).
  { schema: "storage", tabla: "buckets" },
  { schema: "storage", tabla: "objects" }, // los METADATOS de las fotos; los binarios viven fuera
  { schema: "storage", tabla: "buckets_analytics" },
  { schema: "storage", tabla: "buckets_vectors" },
  { schema: "storage", tabla: "vector_indexes" },
];

/** Tablas fuera de `public` cuyas politicas/RLS SI se rastrean (ver docstring). */
const TABLAS_EXTRA_RLS = [{ schema: "storage", tabla: "objects" }];

const FILTRO_TABLAS_EXTRA_FILAS = TABLAS_EXTRA_FILAS.map(
  ({ schema, tabla }) => `(n.nspname = '${schema}' and c.relname = '${tabla}')`,
).join("\n         or ");

const FILTRO_TABLAS_EXTRA_RLS = TABLAS_EXTRA_RLS.map(
  ({ schema, tabla }) => `(n.nspname = '${schema}' and c.relname = '${tabla}')`,
).join("\n         or ");

/**
 * Devuelve la huella completa como un unico valor JSON en la columna `huella`.
 *
 * El `set search_path = pg_catalog` NO es decorativo (revision 3, 2026-08-05,
 * encontrado corriendo el simulacro de verdad): `pg_policies.qual` y
 * `with_check` no guardan texto, se DEPARSAN en cada consulta, y el deparser
 * omite el esquema de todo lo que ya este en el search_path de QUIEN
 * PREGUNTA. La misma politica se lee `auth.uid()` conectado como el rol
 * `postgres` de Supabase Cloud y `uid()` conectado como `supabase_admin` en
 * un contenedor (cuyo search_path incluye `auth`). Resultado: 12 de 106
 * politicas IDENTICAS aparecian como "definicion distinta" — un falso
 * positivo que hace ruido justo en la dimension mas grave, la que detecta
 * fugas entre inquilinos. Fijar el search_path a `pg_catalog` en ambos lados
 * fuerza la calificacion completa (`auth.uid()`, `public.auth_business_id()`)
 * y vuelve el hash comparable entre clusters. Va DENTRO del SQL, no en quien
 * llama, para que sea imposible olvidarlo en un lado.
 *
 * Correr con `psql -q`: sin `-q` el `SET` imprime la linea `SET` antes del
 * JSON. Aun asi, conviene que el consumidor extraiga el JSON de la salida en
 * vez de asumir que es la unica linea.
 */
export const FINGERPRINT_SQL = `
set search_path = pg_catalog;
select json_build_object(
  'filas', (
    select coalesce(json_object_agg(clave, filas), '{}'::json) from (
      select case when n.nspname = 'public' then c.relname
                  else n.nspname || '.' || c.relname end as clave,
             (xpath('/row/cnt/text()', query_to_xml(
                format('select count(*) as cnt from %I.%I', n.nspname, c.relname),
                false, true, '')))[1]::text::bigint as filas
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where (n.nspname = 'public' and c.relkind = 'r')
         or ${FILTRO_TABLAS_EXTRA_FILAS}
    ) t
  ),
  'funciones', (
    select coalesce(json_agg(f order by f), '[]'::json) from (
      select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
    ) x
  ),
  'politicas', (
    select coalesce(json_object_agg(clave, n), '{}'::json) from (
      select case when schemaname = 'public' then tablename
                  else schemaname || '.' || tablename end as clave,
             count(*) as n
      from pg_policies
      where schemaname in ('public', 'storage')
      group by clave
    ) p
  ),
  'rls', (
    select coalesce(json_object_agg(clave, relrowsecurity), '{}'::json) from (
      select case when n.nspname = 'public' then c.relname
                  else n.nspname || '.' || c.relname end as clave,
             c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where (n.nspname = 'public' and c.relkind = 'r')
         or ${FILTRO_TABLAS_EXTRA_RLS}
    ) r
  ),
  'definiciones', (
    select coalesce(json_object_agg(clave, hash), '{}'::json) from (
      select
        (case when schemaname = 'public' then tablename else schemaname || '.' || tablename end)
          || ':' || policyname as clave,
        md5(coalesce(cmd, '') || '|' || coalesce(array_to_string(roles, ','), '') || '|' ||
            coalesce(qual, '') || '|' || coalesce(with_check, '')) as hash
      from pg_policies
      where schemaname in ('public', 'storage')
    ) d
  ),
  'indices', (
    select coalesce(json_agg(indexname order by indexname), '[]'::json)
    from pg_indexes where schemaname = 'public'
  ),
  'restricciones', (
    select coalesce(json_agg(conname order by conname), '[]'::json) from (
      select c.conname
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      where n.nspname = 'public' and c.contype in ('f', 'c')
    ) k
  )
) as huella;
`;

/** Dimensiones que deben venir como objeto NO VACIO en una huella de produccion creible. */
const DIMENSIONES_OBJETO = ["filas", "politicas", "rls", "definiciones"];
/** Dimensiones que deben venir como arreglo NO VACIO en una huella de produccion creible. */
const DIMENSIONES_LISTA = ["funciones", "indices", "restricciones"];

/**
 * Produccion nunca puede tener cero tablas, cero politicas, cero funciones,
 * cero indices ni cero restricciones. Si `prod` llega asi (objeto vacio,
 * dimension ausente, todo en null, o ni siquiera un objeto — por ejemplo la
 * cadena JSON cruda porque alguien olvido parsear la respuesta), lo mas
 * probable es que la consulta jamas se corrio contra el `public` real (DSN
 * equivocado, conexion a una base vacia, un error que el `coalesce` del SQL
 * se tragó en silencio). Devuelve la lista de problemas; vacia si `prod` es
 * creible.
 */
function problemasDeHuellaDegenerada(prod) {
  if (prod === null || typeof prod !== "object" || Array.isArray(prod)) {
    return [
      `La huella de produccion no es un objeto (llego ${prod === null ? "null" : typeof prod}). ` +
        "Verifica que la consulta se haya ejecutado y el resultado JSON se haya parseado antes de comparar.",
    ];
  }

  const problemas = [];
  for (const dim of DIMENSIONES_OBJETO) {
    const v = prod[dim];
    const vacia =
      v === null || v === undefined || typeof v !== "object" || Array.isArray(v) || Object.keys(v).length === 0;
    if (vacia) {
      problemas.push(
        `Huella de produccion sospechosa: la dimension '${dim}' llego vacia o ausente. ` +
          "Produccion no puede tener cero elementos ahi — probable DSN equivocado o consulta fallida en silencio.",
      );
    }
  }
  for (const dim of DIMENSIONES_LISTA) {
    const v = prod[dim];
    if (!Array.isArray(v) || v.length === 0) {
      problemas.push(
        `Huella de produccion sospechosa: la dimension '${dim}' llego vacia o ausente. ` +
          "Produccion no puede tener cero elementos ahi — probable DSN equivocado o consulta fallida en silencio.",
      );
    }
  }
  return problemas;
}

/**
 * Compara la copia contra produccion. Solo importa lo que FALTA: el destino
 * puede traer objetos propios de la imagen base sin que eso invalide nada.
 *
 * `prod` degenerada (vacia, mal formada, sin parsear) se rechaza ANTES de
 * comparar — ver problemasDeHuellaDegenerada. Es imposible obtener
 * `ok: true` sin haber comparado de verdad contra una huella de produccion
 * creible.
 */
export function diffFingerprints(prod, copia) {
  const problemasProd = problemasDeHuellaDegenerada(prod);
  if (problemasProd.length > 0) {
    return { ok: false, problemas: problemasProd };
  }

  // `copia` puede legitimamente venir incompleta (es justo lo que se esta
  // probando) pero no debe poder tumbar la funcion si llega mal formada
  // (null, un string, etc.): eso se reporta como "falta todo", no como una
  // excepcion sin capturar a mitad de un simulacro.
  const copiaSegura = copia !== null && typeof copia === "object" && !Array.isArray(copia) ? copia : {};

  const problemas = [];

  for (const [tabla, esperadas] of Object.entries(prod.filas)) {
    const hay = copiaSegura.filas?.[tabla];
    if (hay === undefined) {
      problemas.push(`Tabla ausente en la copia: ${tabla} (produccion tiene ${esperadas} filas)`);
    } else if (Number(hay) !== Number(esperadas)) {
      problemas.push(`Filas distintas en ${tabla}: produccion ${esperadas}, copia ${hay}`);
    }
  }

  const funcionesCopia = new Set(copiaSegura.funciones ?? []);
  for (const f of prod.funciones) {
    if (!funcionesCopia.has(f)) problemas.push(`Funcion ausente en la copia: ${f}`);
  }

  for (const [tabla, esperadas] of Object.entries(prod.politicas)) {
    const hay = copiaSegura.politicas?.[tabla] ?? 0;
    if (Number(hay) < Number(esperadas)) {
      problemas.push(
        `Politicas RLS incompletas en ${tabla}: produccion ${esperadas}, copia ${hay}`,
      );
    }
  }

  for (const [tabla, encendido] of Object.entries(prod.rls)) {
    if (encendido && copiaSegura.rls?.[tabla] !== true) {
      problemas.push(
        `RLS deshabilitado en la copia para ${tabla} (produccion lo tiene ENCENDIDO). ` +
          "Una tabla sin RLS es una fuga de datos entre inquilinos.",
      );
    }
  }

  for (const [clave, hash] of Object.entries(prod.definiciones)) {
    const hayHash = copiaSegura.definiciones?.[clave];
    if (hayHash === undefined) {
      problemas.push(`Politica ausente en la copia: ${clave}`);
    } else if (hayHash !== hash) {
      problemas.push(
        `Definicion de politica distinta en ${clave}: el USING/WITH CHECK de la copia no coincide con produccion.`,
      );
    }
  }

  const indicesCopia = new Set(copiaSegura.indices ?? []);
  for (const i of prod.indices) {
    if (!indicesCopia.has(i)) problemas.push(`Indice ausente en la copia: ${i}`);
  }

  const restriccionesCopia = new Set(copiaSegura.restricciones ?? []);
  for (const r of prod.restricciones) {
    if (!restriccionesCopia.has(r)) problemas.push(`Restriccion (FK/CHECK) ausente en la copia: ${r}`);
  }

  return { ok: problemas.length === 0, problemas };
}
