#!/usr/bin/env node
/**
 * Audita `supabase/migrations/*.sql` contra la base REAL, objeto por objeto.
 *
 * NO ejecuta ningun `supabase migration repair`: los redacta para que un humano
 * los autorice. Un repair sobre una migracion PARCIAL esconde el problema en vez
 * de resolverlo.
 *
 * Uso:  node scripts/audit-migrations.mjs
 * Requiere SUPABASE_DB_URL (se lee de apps/web/.env.local si no esta en el entorno).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { extractObjects, classify } from "./lib/migration-objects.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { Client } = require("pg");

function dbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const env = readFileSync(path.join(root, "apps/web/.env.local"), "utf8");
  const m = env.match(/^SUPABASE_DB_URL=(.*)$/m);
  if (!m) {
    console.error("ERROR: falta SUPABASE_DB_URL (entorno o apps/web/.env.local).");
    process.exit(1);
  }
  return m[1].trim().replace(/^["']|["']$/g, "");
}

/** Todo lo que EXISTE en public, como claves `${kind}:${name}`. */
async function fingerprint(client) {
  const existing = new Set();
  const q = async (sql, fn) => {
    const { rows } = await client.query(sql);
    rows.forEach((r) => existing.add(fn(r)));
  };
  await q(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'`,
    (r) => `table:${r.relname}`,
  );
  await q(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'public'`,
    (r) => `column:${r.table_name}.${r.column_name}`,
  );
  await q(
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'`,
    (r) => `function:${r.proname}`,
  );
  await q(
    `select tablename, policyname from pg_policies where schemaname = 'public'`,
    (r) => `policy:${r.tablename}.${r.policyname}`,
  );
  await q(
    `select indexname from pg_indexes where schemaname = 'public'`,
    (r) => `index:${r.indexname}`,
  );
  return existing;
}

const client = new Client({ connectionString: dbUrl() });
await client.connect();

const existing = await fingerprint(client);
const { rows: historial } = await client.query(
  `select version, name from supabase_migrations.schema_migrations order by version`,
);
await client.end();

const registrados = new Map(historial.map((r) => [r.name, r.version]));
const dir = path.join(root, "supabase/migrations");
const archivos = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const filas = [];
for (const archivo of archivos) {
  const base = archivo.replace(/\.sql$/, "");
  const objetos = extractObjects(readFileSync(path.join(dir, archivo), "utf8"));
  const veredicto = classify(objetos, existing);
  // El registro puede llamarse igual que el archivo o sin el prefijo numerico:
  // ambas convenciones conviven en el historial.
  const sinPrefijo = base.replace(/^\d+[a-z]?_/, "");
  const version = registrados.get(base) ?? registrados.get(sinPrefijo) ?? null;
  const faltantes = objetos.filter((o) => !existing.has(`${o.kind}:${o.name}`));
  filas.push({ archivo: base, veredicto, version, objetos: objetos.length, faltantes });
}

const nombresLocales = new Set(
  archivos.flatMap((f) => {
    const b = f.replace(/\.sql$/, "");
    return [b, b.replace(/^\d+[a-z]?_/, "")];
  }),
);
const huerfanos = historial.filter((h) => !nombresLocales.has(h.name));

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const salida = path.join(root, "docs", `migration-audit-${stamp}.md`);

const lineas = [
  `# Auditoria de migraciones — ${new Date().toISOString().slice(0, 10)}`,
  "",
  "> Generado por `scripts/audit-migrations.mjs`. Clasifica **por objeto**, no",
  "> por nombre: el historial no es fuente de verdad.",
  "",
  "| Archivo | Veredicto | Objetos | En historial | Faltantes |",
  "|---|---|---|---|---|",
  ...filas.map(
    (f) =>
      `| \`${f.archivo}\` | ${f.veredicto} | ${f.objetos} | ${f.version ? "si" : "**NO**"} | ${
        f.faltantes.length ? f.faltantes.map((o) => `${o.kind}:${o.name}`).join(", ") : "—"
      } |`,
  ),
  "",
  "## Registros en la base sin archivo local",
  "",
  huerfanos.length
    ? huerfanos.map((h) => `- \`${h.name}\` (version \`${h.version}\`)`).join("\n")
    : "- Ninguno.",
  "",
  "> Estos son el agujero real: se aplicaron sin dejar `.sql` en el repositorio,",
  "> asi que `supabase/migrations/` ya no reconstruye el esquema desde cero.",
  "",
  "## Comandos de reparacion propuestos — NO EJECUTADOS",
  "",
  "```bash",
  ...filas
    .filter((f) => f.veredicto === "APLICADA" && !f.version)
    .map((f) => `supabase migration repair --status applied ${f.archivo.match(/^\d+/)?.[0] ?? f.archivo}`),
  "```",
  "",
  "**Requieren decision humana** (no se propone comando):",
  "",
  ...filas
    .filter((f) => f.veredicto === "PARCIAL" || (f.veredicto === "INDETERMINADA" && !f.version))
    .map((f) => `- \`${f.archivo}\` → ${f.veredicto}. Revisar a mano antes de tocar el historial.`),
  "",
];

writeFileSync(salida, lineas.join("\n"), "utf8");

const resumen = filas.reduce((acc, f) => ({ ...acc, [f.veredicto]: (acc[f.veredicto] ?? 0) + 1 }), {});
console.log("Auditoria de migraciones:", resumen);
console.log(`Registros sin archivo local: ${huerfanos.length}`);
console.log(`Reporte → ${salida}`);
console.log("Ningun `repair` fue ejecutado. Revisa el reporte y autoriza.");
