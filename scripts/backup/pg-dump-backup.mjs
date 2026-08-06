#!/usr/bin/env node
/**
 * Backup lógico de la BD de DermaLand con pg_dump (SOLO LECTURA).
 *
 * Genera un dump comprimido en ./backups/. NO modifica la base de datos.
 * Requiere la connection string en la env var SUPABASE_DB_URL (nunca en el repo):
 *   Dashboard Supabase → Settings → Database → Connection string → URI.
 *
 * Uso:
 *   node scripts/backup/pg-dump-backup.mjs
 *   node scripts/backup/pg-dump-backup.mjs --label premig-0028
 *   node scripts/backup/pg-dump-backup.mjs --with-drop   # dump DESTRUCTIVO al restaurar
 *
 * Por defecto el dump NO lleva --clean/--if-exists: restaurarlo con `psql`
 * inserta sobre una base vacia, pero NO borra nada si la base ya tenia datos.
 * Con --with-drop, el archivo EMPIEZA con sentencias DROP — solo para
 * restaurar sobre una base que ya contiene una version previa de DermaLand.
 * Ver lib/pg-dump-args.mjs.
 *
 * Requiere `pg_dump` (PostgreSQL client tools v15+) en el PATH.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPgDumpArgs } from "./lib/pg-dump-args.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DB_URL = process.env.SUPABASE_DB_URL;

if (!DB_URL) {
  console.error(
    "ERROR: falta SUPABASE_DB_URL.\n" +
      "  Obtenla en Dashboard Supabase → Settings → Database → Connection string (URI)\n" +
      "  y expórtala en tu shell/servidor de backup (NUNCA la pongas en el repo):\n" +
      '    export SUPABASE_DB_URL="postgresql://postgres.[ref]:[pwd]@...pooler.supabase.com:5432/postgres"',
  );
  process.exit(1);
}

// Etiqueta opcional (--label X); si no, timestamp. Date.now es válido aquí (script de shell).
const labelIdx = process.argv.indexOf("--label");
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const label = labelIdx > -1 && process.argv[labelIdx + 1] ? process.argv[labelIdx + 1] : stamp;

const outDir = path.join(root, "backups");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `dermaland-${label}.sql.gz`);

console.log(`Backup → ${outFile}`);
console.log("Ejecutando pg_dump (solo lectura)…");

// Destructivo solo si se pide explicitamente. Ver lib/pg-dump-args.mjs.
const withDrop = process.argv.includes("--with-drop");
if (withDrop) {
  console.warn(
    "⚠️  --with-drop: el dump EMPEZARA con sentencias DROP. Solo para restaurar\n" +
      "    sobre una base que ya contiene una version previa de DermaLand.",
  );
}

// --no-owner/--no-privileges: portable a un proyecto restaurado distinto.
// Comprimimos con gzip nativo de pg_dump (-Z 9) escribiendo a archivo.
const res = spawnSync("pg_dump", buildPgDumpArgs({ outFile, dbUrl: DB_URL, withDrop }), {
  stdio: ["ignore", "inherit", "inherit"],
});

if (res.error) {
  console.error("ERROR ejecutando pg_dump:", res.error.message);
  console.error("¿Está instalado pg_dump (PostgreSQL client tools v15+) y en el PATH?");
  process.exit(1);
}
if (res.status !== 0) {
  console.error(`pg_dump terminó con código ${res.status}`);
  process.exit(res.status ?? 1);
}

const sizeMb = (statSync(outFile).size / 1024 / 1024).toFixed(2);
console.log(`✅ Backup completo: ${outFile} (${sizeMb} MB)`);
console.log("Recuerda copiarlo a un almacenamiento EXTERNO (S3/Backblaze/NAS), cifrado.");
