#!/usr/bin/env node
/**
 * Aplica UNA migración a la base de apps/web/.env.local (SUPABASE_DB_URL) y la
 * registra en supabase_migrations.schema_migrations (igual que el CLI).
 * DRY-RUN por defecto: imprime el archivo y NO ejecuta. Con --apply ejecuta
 * todo dentro de una transacción.
 *
 *   node scripts/db/apply-migration.mjs supabase/migrations/20260905200000_alegra_sync.sql
 *   node scripts/db/apply-migration.mjs <archivo> --apply
 *
 * TLS SIEMPRE verificado contra el CA raíz de Supabase que vive en
 * supabase/certs/supabase-root-2021-ca.crt (o SUPABASE_DB_SSL_CA). Nunca se
 * desactiva la verificación.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const require = createRequire(path.join(ROOT, "apps/web/package.json"));
const { Client } = require("pg");

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error("Uso: node scripts/db/apply-migration.mjs <archivo.sql> [--apply]");
  process.exit(1);
}
const APPLY = flags.includes("--apply");
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, "apps/web/.env.local"), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
const url = env.SUPABASE_DB_URL;
if (!url || /YOUR-PROJECT-REF/.test(url)) {
  throw new Error("SUPABASE_DB_URL no está configurada en apps/web/.env.local");
}
const sqlPath = path.isAbsolute(file) ? file : path.join(ROOT, file);
const sql = readFileSync(sqlPath, "utf8");
const base = path.basename(sqlPath, ".sql");
const version = base.split("_")[0];
const name = base.slice(version.length + 1);
console.log(`${APPLY ? "▶ APLICANDO" : "🔍 dry-run"} ${path.relative(ROOT, sqlPath)} (versión ${version}, ${sql.length} bytes)`);
if (!APPLY) {
  console.log(sql);
  process.exit(0);
}

// CA raíz público de Supabase (supabase/certs/README.md); se puede sobreescribir con SUPABASE_DB_SSL_CA.
const caPath = process.env.SUPABASE_DB_SSL_CA ?? path.join(ROOT, "supabase/certs/supabase-root-2021-ca.crt");
const ca = existsSync(caPath) ? readFileSync(caPath, "utf8") : undefined;
const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
});
await client.connect();
try {
  await client.query("begin");
  await client.query(sql);
  await client.query(
    "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3) on conflict (version) do nothing",
    [version, name, [sql]],
  );
  await client.query("commit");
  console.log("✓ aplicada y registrada");
} catch (e) {
  await client.query("rollback");
  console.error("✗ rollback:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
