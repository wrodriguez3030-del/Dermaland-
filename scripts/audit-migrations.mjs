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
  `select version, name, array_to_string(statements, E'\\n') as sql_text
   from supabase_migrations.schema_migrations order by version`,
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
const sinMatchPorNombre = historial.filter((h) => !nombresLocales.has(h.name));

/**
 * Emparejado por nombre no es suficiente: 3 de los 9 "huerfanos" originales
 * de esta auditoria (create_inventory_transfers_tables, transfer_stock_atomic,
 * purchases_module) SI tienen archivo local — solo que Supabase registro la
 * migracion con un nombre de funcion/tabla en vez del nombre del archivo
 * (0010_inventory_transfers.sql, 0032_transfer_atomic.sql, 0012_purchases.sql).
 * Confundirlos con huerfanos reales es enganoso: un humano leyendo el reporte
 * creeria que faltan 3 archivos que en realidad SI estan, y podria
 * reconstruirlos por duplicado.
 *
 * Para no perder esos casos, comparamos los OBJETOS que declaro el SQL
 * realmente aplicado (columna `statements` de `schema_migrations`, el mismo
 * `.sql` que Supabase corrio) contra los objetos que declara cada archivo
 * local sin registro propio, con similitud de Jaccard
 * (interseccion / union de las claves `kind:name`).
 *
 * Umbral = 0.5 (la mitad o mas de los objetos en comun), documentado aqui
 * a proposito: `extractObjects` es un extractor por regex, no un parser SQL,
 * asi que exigir coincidencia exacta (1.0) seria fragil ante diferencias
 * cosmeticas minimas entre lo aplicado y el archivo local (comentarios,
 * orden, un IF NOT EXISTS de mas). 0.5 alcanza para no confundir un
 * renombrado real con dos migraciones distintas que por casualidad tocan la
 * misma tabla (comparten 1-2 objetos pero no la mayoria). En esta corrida
 * los 3 renombrados reales dieron jaccard=1.0 y los 4 huerfanos genuinos
 * dieron 0 objetos en comun con cualquier archivo local — la separacion fue
 * limpia, sin casos ambiguos cerca del umbral.
 */
const RENAME_MATCH_THRESHOLD = 0.5;

const localSinRegistro = filas.filter((f) => !f.version);
const localObjSets = new Map(
  localSinRegistro.map((f) => [
    f.archivo,
    new Set(
      extractObjects(readFileSync(path.join(dir, `${f.archivo}.sql`), "utf8")).map((o) => `${o.kind}:${o.name}`),
    ),
  ]),
);

const renombrados = [];
const huerfanos = [];
for (const h of sinMatchPorNombre) {
  const histObjs = new Set(
    h.sql_text ? extractObjects(h.sql_text).map((o) => `${o.kind}:${o.name}`) : [],
  );
  let mejor = null;
  if (histObjs.size > 0) {
    for (const [archivo, objs] of localObjSets) {
      if (objs.size === 0) continue;
      const interseccion = [...histObjs].filter((k) => objs.has(k)).length;
      const union = new Set([...histObjs, ...objs]).size;
      const jaccard = union === 0 ? 0 : interseccion / union;
      if (jaccard >= RENAME_MATCH_THRESHOLD && (!mejor || jaccard > mejor.jaccard)) {
        mejor = { archivo, jaccard, interseccion, total: histObjs.size };
      }
    }
  }
  if (mejor) {
    renombrados.push({ ...h, ...mejor });
  } else {
    huerfanos.push(h);
  }
}

// "Archivo sin registro": la otra direccion — archivos locales que NO
// aparecen en el historial bajo ningun nombre (ni el suyo ni el de un
// renombrado detectado arriba). Es contabilidad, no un agujero: la mayoria
// son APLICADA de verdad, solo que a Supabase nunca se le aviso por
// `supabase migration repair`.
const nombresRenombrados = new Set(renombrados.map((r) => r.archivo));
const archivoSinRegistro = filas.filter((f) => !f.version && !nombresRenombrados.has(f.archivo));

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
  "## Sin archivo local (agujero real)",
  "",
  "Registros del historial que no corresponden a NINGUN `.sql` del repositorio",
  "— ni por nombre ni por los objetos que declaran. Estos son la evidencia de",
  "que se aplico algo a produccion sin dejar rastro reconstruible.",
  "",
  huerfanos.length
    ? huerfanos.map((h) => `- \`${h.name}\` (version \`${h.version}\`)`).join("\n")
    : "- Ninguno.",
  "",
  "## Registrado bajo otro nombre (cosmetico)",
  "",
  `Registros del historial que SI tienen un \`.sql\` local — Supabase los`,
  "registro con el nombre de una tabla o funcion en vez del nombre del",
  `archivo. Emparejados por similitud de objetos (Jaccard >= ${RENAME_MATCH_THRESHOLD},`,
  "ver comentario en el codigo). No representan un agujero: NO proponer",
  "`repair` para estos, ya estan registrados (solo que con otro nombre).",
  "",
  renombrados.length
    ? renombrados
        .map(
          (r) =>
            `- \`${r.name}\` (version \`${r.version}\`) → \`${r.archivo}\` (jaccard ${r.jaccard.toFixed(2)}, ${r.interseccion}/${r.total} objetos)`,
        )
        .join("\n")
    : "- Ninguno.",
  "",
  "## Archivo sin registro (contabilidad)",
  "",
  "Archivos locales que no aparecen en el historial bajo ningun nombre (ni el",
  "suyo ni un renombrado detectado arriba). No es un agujero: casi todos ya",
  "estan `APLICADA` de verdad, solo falta que el historial lo sepa.",
  "",
  archivoSinRegistro.length
    ? archivoSinRegistro.map((f) => `- \`${f.archivo}\` → ${f.veredicto}`).join("\n")
    : "- Ninguno.",
  "",
  "## Comandos de reparacion propuestos — NO EJECUTADOS",
  "",
  "```bash",
  ...archivoSinRegistro
    .filter((f) => f.veredicto === "APLICADA")
    .map((f) => `supabase migration repair --status applied ${f.archivo.match(/^\d+/)?.[0] ?? f.archivo}`),
  "```",
  "",
  "**Requieren decision humana** (no se propone comando):",
  "",
  // PARCIAL es drift real independientemente de si esta registrado o no (por
  // eso NO sale de `archivoSinRegistro`, que solo mira registro). INDETERMINADA
  // sin registro y sin ser un renombrado tambien queda para revision manual.
  ...filas
    .filter(
      (f) =>
        f.veredicto === "PARCIAL" ||
        (f.veredicto === "INDETERMINADA" && !f.version && !nombresRenombrados.has(f.archivo)),
    )
    .map((f) => `- \`${f.archivo}\` → ${f.veredicto}. Revisar a mano antes de tocar el historial.`),
  "",
];

writeFileSync(salida, lineas.join("\n"), "utf8");

const resumen = filas.reduce((acc, f) => ({ ...acc, [f.veredicto]: (acc[f.veredicto] ?? 0) + 1 }), {});
console.log("Auditoria de migraciones:", resumen);
console.log(`Archivos locales auditados: ${archivos.length}`);
console.log(`Sin archivo local (agujero real): ${huerfanos.length}`);
huerfanos.forEach((h) => console.log(`  - ${h.name} (${h.version})`));
console.log(`Registrado bajo otro nombre (cosmetico): ${renombrados.length}`);
renombrados.forEach((r) => console.log(`  - ${r.name} -> ${r.archivo} (jaccard ${r.jaccard.toFixed(2)})`));
console.log(`Archivo sin registro (contabilidad): ${archivoSinRegistro.length}`);
console.log(`Reporte → ${salida}`);
console.log("Ningun `repair` fue ejecutado. Revisa el reporte y autoriza.");
