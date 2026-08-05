/**
 * Firmas de tipos para dermaland-footprint.mjs.
 * Ver scripts/lib/migration-objects.d.mts para el porqué de este archivo.
 */

export interface BuildDermaLandFootprintOptions {
  /** Por defecto, supabase/migrations/ del repo. Parametrizable en pruebas. */
  migrationsDir?: string;
}

/**
 * Nombres de tabla declarados por `create table` en supabase/migrations/*.sql
 * (sin `public.`; otros esquemas explícitos se conservan calificados).
 */
export function buildDermaLandFootprint(
  opts?: BuildDermaLandFootprintOptions,
): Set<string>;
