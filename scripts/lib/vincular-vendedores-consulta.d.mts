/**
 * Firmas de tipos para vincular-vendedores-consulta.mjs.
 *
 * Se declaran a mano, como en `migration-objects.d.mts`: `apps/web/tsconfig.json`
 * tiene `allowJs: false`, así que una prueba TypeScript que importe el .mjs sin
 * declaración muere en `pnpm --filter web typecheck` con TS7016.
 */

export interface OpcionesVinculacion {
  businessId: string;
  /** Nombre tal como lo guarda Alegra; `null` = las facturas sin vendedor. */
  nombreAlegra: string | null;
  /** Id del usuario de DermaLand; `null` mientras no exista (ensayo). */
  sellerId: string | null;
}

export interface ConsultaVinculacion {
  /** Predicado completo, sin la palabra `where`. */
  where: string;
  /** Parámetros posicionales, en el orden en que los numera `where`. */
  args: (string | null)[];
  /** Placeholder del `seller_id` (`"$2"`), o `null` si el vendedor aún no existe. */
  paramSeller: string | null;
}

/** Predicado y parámetros de las consultas de conteo y de escritura. */
export function consultaVinculacion(opciones: OpcionesVinculacion): ConsultaVinculacion;
