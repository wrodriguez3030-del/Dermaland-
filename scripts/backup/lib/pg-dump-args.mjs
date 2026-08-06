/**
 * Argumentos de pg_dump.
 *
 * `--clean --if-exists` hace que el archivo EMPIECE con sentencias DROP.
 * Apuntado a la base equivocada, no la ensucia: la vacia. Por eso deja de ser
 * el comportamiento por defecto y pasa a exigir `--with-drop` explicito, para
 * restaurar sobre una base que YA contiene una version previa de DermaLand.
 */
export function buildPgDumpArgs({ outFile, dbUrl, withDrop }) {
  const args = ["--no-owner", "--no-privileges"];
  if (withDrop) args.push("--clean", "--if-exists");
  args.push("-Z", "9", "-f", outFile, dbUrl);
  return args;
}
