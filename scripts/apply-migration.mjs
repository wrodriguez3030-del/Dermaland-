#!/usr/bin/env node
/**
 * Aplica un archivo de migración SQL a Supabase vía SUPABASE_DB_URL (conexión
 * Postgres directa). Para DDL ADITIVO/no destructivo (create table if not
 * exists, etc.). NO usar para drop/truncate sin revisión. NUNCA imprime la URL.
 *
 * Uso:
 *   node scripts/apply-migration.mjs supabase/migrations/0012_purchases.sql
 *
 * Lee apps/web/.env.local: SUPABASE_DB_URL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(REPO_ROOT, "apps", "web", ".env.local");

function die(m) { console.error(`[apply-migration] ${m}`); process.exit(1); }
function ok(m) { console.log(`[apply-migration] ${m}`); }

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

async function main() {
  const file = process.argv[2];
  if (!file) die("falta el archivo de migración como argumento.");
  const sqlPath = path.resolve(REPO_ROOT, file);
  if (!fs.existsSync(sqlPath)) die(`no existe ${sqlPath}`);
  const sql = fs.readFileSync(sqlPath, "utf8");

  const env = loadEnv();
  const url = env.SUPABASE_DB_URL;
  if (!url || !url.startsWith("postgres")) die("SUPABASE_DB_URL ausente o inválida.");

  const require = createRequire(pathToFileURL(path.join(REPO_ROOT, "apps", "web", "package.json")));
  const pg = require("pg");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

  ok(`aplicando ${path.basename(file)} (${sql.split("\n").length} líneas)…`);
  await client.connect();
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    ok("migración aplicada OK (commit).");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    die(`falló (rollback): ${e.message}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => die(e.message));
