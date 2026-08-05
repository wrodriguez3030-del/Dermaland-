/**
 * Firmas de tipos para assert-safe-target.mjs.
 * Ver scripts/lib/migration-objects.d.mts para el porqué de este archivo.
 */

export interface AssertSafeTargetArgs {
  /** Tablas presentes en el destino. Ausente/vacío == destino sin tablas. */
  tables?: readonly string[];
  /** Confirmación explícita (env var DERMALAND_DR_CONFIRM); "" == ausente. */
  confirm: string;
  isProduction: boolean;
  /**
   * Huella de tablas propias de DermaLand contra la que se comparan `tables`.
   * Deny-by-default: sin footprint, ninguna tabla se reconoce. Construida
   * por quien llama — ver dermaland-footprint.d.mts.
   */
  footprint?: ReadonlySet<string> | readonly string[];
}

/** Lanza Error si el destino no es seguro; no retorna nada si lo es. */
export function assertSafeTarget(args: AssertSafeTargetArgs): void;
