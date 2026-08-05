/**
 * Firmas de tipos para list-target-tables.mjs.
 * Ver scripts/lib/migration-objects.d.mts para el porqué de este archivo.
 *
 * `fetchImpl` se tipa por el subconjunto que el módulo realmente usa
 * (`ok`, `status`, `json()`), no por `typeof fetch` / `Response` completo:
 * las pruebas (tests/unit/list-target-tables.test.ts) pasan objetos literales
 * fake que no implementan la interfaz `Response` del DOM (sin `headers`,
 * `clone`, `body`, etc.). Tipar contra `Response` completo habría hecho que
 * esas pruebas, ya correctas, dejaran de tipar — exactamente el tipo de
 * fricción que el requisito "tipos precisos" busca evitar.
 */

export interface MinimalFetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export type MinimalFetch = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<MinimalFetchResponse>;

export interface ListTargetTablesArgs {
  url: string;
  key: string;
  /** Por defecto, el `fetch` global. Sustituible en pruebas. */
  fetchImpl?: MinimalFetch;
  /** Por defecto, console.error. Sustituible en pruebas para capturar avisos. */
  warn?: (msg: string) => void;
}

/** Nombres de tabla/vista expuestos por PostgREST en el destino. */
export function listTargetTables(args: ListTargetTablesArgs): Promise<string[]>;
