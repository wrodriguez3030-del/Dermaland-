/**
 * Firmas de tipos para dermaland-footprint.mjs.
 * Ver scripts/lib/migration-objects.d.mts para el porqué de este archivo.
 */

export interface BuildDermaLandFootprintOptions {
  /** Por defecto, supabase/migrations/ del repo. Parametrizable en pruebas. */
  migrationsDir?: string;
}

/**
 * Nombres de tabla Y VISTA declarados en supabase/migrations/*.sql
 * (sin `public.`; otros esquemas explícitos se conservan calificados).
 */
export function buildDermaLandFootprint(
  opts?: BuildDermaLandFootprintOptions,
): Set<string>;

/** Una clase de relación, en los dos vocabularios que hay que mantener juntos. */
export interface ClaseDeRelacion {
  /** Vocabulario de `extractObjects` (lo que declara el SQL del repo). */
  kind: string;
  /** Vocabulario de `pg_class.relkind` (lo que existe en la base). */
  relkinds: readonly string[];
}

/** Qué cuenta como "una relación del destino", declarado una sola vez. */
export declare const CLASES_DE_RELACION: readonly ClaseDeRelacion[];

/** Kinds de `extractObjects` que entran en la huella. */
export declare const KINDS_DE_LA_HUELLA: readonly string[];

/** `pg_class.relkind` equivalentes, para consultar el destino. */
export declare const RELKINDS_DEL_DESTINO: readonly string[];

/**
 * SQL que lista las relaciones del destino con el MISMO criterio que la
 * huella. Una sola celda, nombres separados por coma.
 */
export function sqlRelacionesDelDestino(esquema?: string): string;
