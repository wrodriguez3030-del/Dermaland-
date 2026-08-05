/**
 * Firmas de tipos para pg-dump-args.mjs.
 * Ver scripts/lib/migration-objects.d.mts para el porqué de este archivo.
 */

export interface BuildPgDumpArgsOptions {
  outFile: string;
  dbUrl: string;
  /** true agrega --clean --if-exists: el dump EMPIEZA con sentencias DROP. */
  withDrop: boolean;
}

export function buildPgDumpArgs(opts: BuildPgDumpArgsOptions): string[];
