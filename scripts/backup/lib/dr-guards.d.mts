/**
 * Firmas de tipos para dr-guards.mjs.
 * Ver scripts/lib/migration-objects.d.mts para el porqué de este archivo.
 */

/** Identidad de un cluster Postgres: `system_identifier` de pg_control_system(). */
export interface ClusterIdentity {
  /** system_identifier; llega como texto porque es un int8 fuera del rango seguro de JS. */
  sysid?: string | number | null;
  /** Datos de contexto, solo para el reporte. */
  base?: string | null;
  inicio?: string | null;
  version?: string | null;
}

/** Piso de magnitud por defecto (ver dr-guards.mjs). */
export declare const MIN_TABLAS: number;
export declare const MIN_POLITICAS: number;

/** Límites del contrato de vida del arenero, en segundos (ver dr-guards.mjs). */
export declare const LEASE_MAXIMO: number;
export declare const LEASE_MINIMO: number;

/**
 * Resuelve el contrato del vigilante desde el entorno, acotado a
 * [LEASE_MINIMO, LEASE_MAXIMO]. El entorno solo puede hacerlo más estricto.
 */
export function calcularLease(crudo: unknown): number;

/** Lanza si origen y destino son el mismo cluster, o si falta la identidad de alguno. */
export function assertOrigenDistinto(args: {
  origen: ClusterIdentity | null | undefined;
  destino: ClusterIdentity | null | undefined;
}): void;

/**
 * Misma comparación que `assertOrigenDistinto`, como predicado, para alimentar
 * `assertSafeTarget({ isProduction })` con un hecho medido. `false` también
 * cuando falta alguna identidad (ahí la que lanza es `assertOrigenDistinto`).
 */
export function esElMismoCluster(args: {
  origen: ClusterIdentity | null | undefined;
  destino: ClusterIdentity | null | undefined;
}): boolean;

/** Host de un destino escrito como URL, DSN, `usuario@host` o host suelto. */
export function hostDeDestino(valor: unknown): string | null;

/**
 * ¿El destino es el mismo sistema que producción? `null` = no se pudo
 * determinar; quien llama debe fallar cerrado, nunca leerlo como `false`.
 */
export function esDestinoProduccion(args: {
  destino: unknown;
  produccion: unknown;
}): boolean | null;

/**
 * Lanza si la huella de producción es demasiado pequeña para ser real.
 * Devuelve las magnitudes medidas cuando pasa.
 */
export function assertMagnitudCreible(
  prod: unknown,
  opts?: { minTablas?: number; minPoliticas?: number },
): { tablas: number; politicas: number };
