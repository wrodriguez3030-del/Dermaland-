/**
 * Huella del esquema: lo que hay que comparar para que un simulacro sea una
 * PRUEBA y no un teatro. Un dump puede restaurar sin un solo error y aun asi
 * llegar incompleto.
 *
 * Cuatro dimensiones:
 *   filas     — conteo EXACTO por tabla (no la estimacion de pg_stat_user_tables)
 *   funciones — nombre + firma
 *   politicas — conteo de RLS por tabla; una copia sin RLS es una fuga
 *   indices   — presencia por nombre
 *
 * Verificado 2026-08-05 contra produccion (sntcvyozbhrgicwmtcoh, via conexion
 * Postgres directa con SUPABASE_DB_URL): 83 tablas base, 106 tablas con al
 * menos una politica RLS. Los conteos de `filas` y `politicas` llegan del
 * driver `pg` ya como Number de JS (json_build_object serializa bigint como
 * numero JSON, no como cadena, y el parser de tipos de `pg` hace JSON.parse
 * sobre columnas `json`) — pero `diffFingerprints` igual pasa todo por
 * `Number(...)` antes de comparar, para no depender de ese detalle de
 * serializacion si algun dia la huella se arma a mano en una prueba o llega
 * de otra fuente que sí entregue cadenas.
 */

/** Devuelve la huella completa como un unico valor JSON en la columna `huella`. */
export const FINGERPRINT_SQL = `
select json_build_object(
  'filas', (
    select coalesce(json_object_agg(relname, filas), '{}'::json) from (
      select c.relname,
             (xpath('/row/cnt/text()', query_to_xml(
                format('select count(*) as cnt from public.%I', c.relname),
                false, true, '')))[1]::text::bigint as filas
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
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
    select coalesce(json_object_agg(tablename, n), '{}'::json)
    from (select tablename, count(*) as n from pg_policies
          where schemaname = 'public' group by tablename) p
  ),
  'indices', (
    select coalesce(json_agg(indexname order by indexname), '[]'::json)
    from pg_indexes where schemaname = 'public'
  )
) as huella;
`;

/**
 * Compara la copia contra produccion. Solo importa lo que FALTA: el destino
 * puede traer objetos propios de la imagen base sin que eso invalide nada.
 */
export function diffFingerprints(prod, copia) {
  const problemas = [];

  for (const [tabla, esperadas] of Object.entries(prod.filas ?? {})) {
    const hay = copia.filas?.[tabla];
    if (hay === undefined) {
      problemas.push(`Tabla ausente en la copia: ${tabla} (produccion tiene ${esperadas} filas)`);
    } else if (Number(hay) !== Number(esperadas)) {
      problemas.push(`Filas distintas en ${tabla}: produccion ${esperadas}, copia ${hay}`);
    }
  }

  const enCopia = new Set(copia.funciones ?? []);
  for (const f of prod.funciones ?? []) {
    if (!enCopia.has(f)) problemas.push(`Funcion ausente en la copia: ${f}`);
  }

  for (const [tabla, esperadas] of Object.entries(prod.politicas ?? {})) {
    const hay = copia.politicas?.[tabla] ?? 0;
    if (Number(hay) < Number(esperadas)) {
      problemas.push(
        `Politicas RLS incompletas en ${tabla}: produccion ${esperadas}, copia ${hay}`,
      );
    }
  }

  const indicesCopia = new Set(copia.indices ?? []);
  for (const i of prod.indices ?? []) {
    if (!indicesCopia.has(i)) problemas.push(`Indice ausente en la copia: ${i}`);
  }

  return { ok: problemas.length === 0, problemas };
}
