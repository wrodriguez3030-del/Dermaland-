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
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
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

/**
 * Todo lo que EXISTE, como claves `${kind}:${name}`.
 *
 * `public` es el esquema principal de la app; `storage` se agrega porque 2
 * migraciones (`product_images_storage_bucket`, `0046_dgii_xml_storage`)
 * declaran policies sobre `storage.objects` para los buckets de Storage —
 * sin esto, `classify()` las marcaba NO_APLICADA/PARCIAL aunque SI estaban
 * aplicadas (falso negativo: peor que un falso positivo, porque invita a
 * reaplicar algo que ya existe). Deliberadamente NO se agregan los esquemas
 * internos de Supabase (`auth`, `realtime`, `vault`, `extensions`,
 * `graphql`, `pgbouncer`, etc.): ninguna migracion de este repo los declara,
 * y agregarlos solo meteria ruido — objetos que Supabase gestiona, no que
 * nosotros migramos. `SCHEMAS_NO_PUBLIC` es la lista explicita de que otros
 * esquemas SI cubrimos; para las claves de ese esquema, el nombre se
 * cualifica con el esquema (`table:storage.objects`,
 * `policy:storage.objects.dgii_xml_select`) — el mismo formato que produce
 * `extractObjects` (ver `qualify()` en migration-objects.mjs) para que las
 * claves coincidan de los dos lados.
 */
const SCHEMAS_NO_PUBLIC = ["storage"];

async function fingerprint(client) {
  const existing = new Set();
  const q = async (sql, fn, params = []) => {
    const { rows } = await client.query(sql, params);
    rows.forEach((r) => existing.add(fn(r)));
  };
  await q(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'`,
    (r) => `table:${r.relname}`,
  );
  // Las vistas ('v') y materializadas ('m') se preguntan aparte de las tablas
  // ('r') porque `extractObjects` las distingue: sin esta consulta, la unica
  // vista del repo (`inventory_stock_by_lot`, 0002) saldria como objeto
  // faltante y la migracion se reportaria a medias aunque este aplicada — el
  // mismo falso negativo que ya obligo a agregar el esquema `storage`.
  await q(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v', 'm')`,
    (r) => `view:${r.relname}`,
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

  for (const schema of SCHEMAS_NO_PUBLIC) {
    await q(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = $1 and c.relkind = 'r'`,
      (r) => `table:${schema}.${r.relname}`,
      [schema],
    );
    await q(
      `select tablename, policyname from pg_policies where schemaname = $1`,
      (r) => `policy:${schema}.${r.tablename}.${r.policyname}`,
      [schema],
    );
  }

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
 * misma tabla (comparten 1-2 objetos pero no la mayoria).
 *
 * REVISION (ronda 3): jaccard por si solo no basta cuando la interseccion es
 * chica. `transfer_stock_atomic` casa con `0032_transfer_atomic` a
 * jaccard=1.00 sobre UN SOLO objeto (la funcion). Eso es evidencia real en
 * este caso, pero el mismo patron matematico tambien lo produciria un
 * hotfix aplicado a produccion sin dejar `.sql` — la forma de drift MAS
 * COMUN de este repositorio — si por casualidad declara el mismo objeto que
 * un archivo local ya existente (ej. un registro hipotetico
 * `hotfix_transfer_atomic_v2` cuyo SQL fuera solo
 * `create or replace function transfer_stock_atomic(...)`; no existe en la
 * base real, es el contraejemplo que se uso para probar este cambio). Un
 * solo objeto en comun, aunque sea jaccard=1.0, no distingue esos dos casos.
 * Por eso ahora se exige tambien `MIN_INTERSECTION` objetos en comun: los
 * candidatos que pasan el umbral de jaccard pero no el minimo de objetos NO
 * se confirman como renombrado — se listan aparte como DUDOSOS para que un
 * humano decida, en vez de esconderse en "agujero real" o en "cosmetico"
 * por igual.
 *
 * Ademas, el emparejamiento es 1:1: un archivo local no puede quedar
 * "reclamado" por dos filas del historial. Si dos compiten por el mismo
 * archivo, gana la de mayor jaccard (empate → mayor interseccion) y la otra
 * vuelve a "sin archivo local" — ya tuvo su oportunidad de justificarse con
 * una coincidencia mejor y perdio, asi que no es un caso dudoso, es un
 * huerfano.
 */
const RENAME_MATCH_THRESHOLD = 0.5;
const MIN_INTERSECTION = 2;

const localSinRegistro = filas.filter((f) => !f.version);
const localObjSets = new Map(
  localSinRegistro.map((f) => [
    f.archivo,
    new Set(
      extractObjects(readFileSync(path.join(dir, `${f.archivo}.sql`), "utf8")).map((o) => `${o.kind}:${o.name}`),
    ),
  ]),
);

// Paso 1: mejor candidato local por registro (el que alcanza el umbral de
// jaccard), confirme o no el minimo de objetos todavia.
const candidatos = [];
const sinEvidencia = [];
for (const h of sinMatchPorNombre) {
  const histObjs = new Set(h.sql_text ? extractObjects(h.sql_text).map((o) => `${o.kind}:${o.name}`) : []);
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
    candidatos.push({ ...h, ...mejor });
  } else {
    sinEvidencia.push(h);
  }
}

// Paso 2: separar confirmados (>= MIN_INTERSECTION) de dudosos (pasan el
// umbral de jaccard pero no el minimo de objetos).
const confirmadosPreConflicto = candidatos.filter((c) => c.interseccion >= MIN_INTERSECTION);
const dudosos = candidatos.filter((c) => c.interseccion < MIN_INTERSECTION);

// Paso 3: 1:1 — un archivo local solo puede ganarlo un registro. Los que
// pierden el conflicto vuelven a huerfano real (no a dudoso).
const porArchivo = new Map();
for (const c of confirmadosPreConflicto) {
  const actual = porArchivo.get(c.archivo);
  if (!actual || c.jaccard > actual.jaccard || (c.jaccard === actual.jaccard && c.interseccion > actual.interseccion)) {
    porArchivo.set(c.archivo, c);
  }
}
const renombrados = [...porArchivo.values()];
const versionesGanadoras = new Set(renombrados.map((r) => r.version));
const perdedoresConflicto = confirmadosPreConflicto.filter((c) => !versionesGanadoras.has(c.version));

const huerfanos = [...sinEvidencia, ...perdedoresConflicto];

// "Archivo sin registro": la otra direccion — archivos locales que NO
// aparecen en el historial bajo ningun nombre (ni el suyo ni el de un
// renombrado CONFIRMADO detectado arriba; un dudoso NO reserva el archivo).
// Es contabilidad, no un agujero: la mayoria son APLICADA de verdad, solo
// que a Supabase nunca se le aviso por `supabase migration repair`.
const nombresRenombrados = new Set(renombrados.map((r) => r.archivo));
const archivoSinRegistro = filas.filter((f) => !f.version && !nombresRenombrados.has(f.archivo));

// No es secreto: es el project ref publico de Supabase (aparece asi en toda
// la documentacion/memoria del proyecto), no la contraseña de Postgres.
const SUPABASE_PROJECT_REF = "sntcvyozbhrgicwmtcoh";
// `supabase link` deja un directorio `.temp` dentro de `supabase/`. Sin eso,
// `migration repair` exige `--db-url`/`-p` en la linea de comandos — que deja
// la contraseña de produccion en el historial del shell.
const linked = existsSync(path.join(root, "supabase/.temp"));
const aplicarSinRegistro = archivoSinRegistro.filter((f) => f.veredicto === "APLICADA");

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
  `archivo. Emparejados por similitud de objetos (Jaccard >= ${RENAME_MATCH_THRESHOLD} Y al`,
  `menos ${MIN_INTERSECTION} objetos en comun — un solo objeto en comun, por mas`,
  "perfecto que sea el jaccard, no es evidencia suficiente por si sola; ver",
  "seccion Dudosos y el comentario en el codigo). No representan un",
  "agujero: NO proponer `repair` para estos, ya estan registrados (solo que",
  "con otro nombre).",
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
  "## Dudosos (evidencia insuficiente — revisar a mano)",
  "",
  `Registros que superan el umbral de similitud (Jaccard >= ${RENAME_MATCH_THRESHOLD}) contra`,
  `algun archivo local sin registro, pero con MENOS de ${MIN_INTERSECTION} objetos en`,
  "comun — muy poca base para confirmar un renombrado. Un jaccard perfecto",
  "sobre un solo objeto tambien lo daria un hotfix aplicado a produccion sin",
  "dejar `.sql` que por casualidad declara el mismo objeto (la forma de",
  "drift MAS COMUN de este repositorio). NO se cuentan como renombrado NI",
  "como huerfano: ni se asumen resueltos ni se pierden de vista. Decide un",
  "humano, no el script.",
  "",
  dudosos.length
    ? dudosos
        .map(
          (d) =>
            `- \`${d.name}\` (version \`${d.version}\`) → ¿\`${d.archivo}\`? (jaccard ${d.jaccard.toFixed(2)}, ${d.interseccion}/${d.total} objetos — insuficiente, minimo ${MIN_INTERSECTION})`,
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
  "## Reparacion del historial — NINGUN COMANDO EJECUTABLE PROPUESTO",
  "",
  `**El proyecto NO esta \`linked\`** (no existe \`supabase/.temp\`). Sin`,
  "eso, `supabase migration repair` exige `--db-url` o `-p/--password` como",
  "argumento en la linea de comandos — y eso deja la contraseña de",
  "produccion en el historial del shell. Forma segura antes de reparar nada:",
  "",
  "```bash",
  `supabase link --project-ref ${SUPABASE_PROJECT_REF}`,
  "# pide un access token interactivo — nunca la contraseña de Postgres.",
  "supabase migration repair --status applied <version> --linked",
  "# NUNCA: supabase migration repair ... --db-url \"postgresql://...\" con",
  "# la cadena pegada literal. Si hiciera falta --db-url, pasarlo como",
  "# variable de entorno ya exportada: --db-url \"$SUPABASE_DB_URL\".",
  "```",
  "",
  "**Las versiones de `supabase_migrations.schema_migrations` son",
  "timestamps de 14 digitos** (ej. `20260805020813`). Los archivos locales",
  "de este repo usan un numero de secuencia de 4 digitos (`0007`, `0008`,",
  "...) que NO es una version valida para `repair` — un comando con ese",
  "numero fallaria o, peor, registraria una version que no significa nada.",
  "Para las migraciones `APLICADA` sin fila en el historial no hay ninguna",
  "fuente confiable de CUANDO se aplicaron realmente (por definicion: si la",
  "hubiera, tendrian fila). Inventar un timestamp seria un `repair` mal",
  "formado contra produccion — peor que no proponer nada. Por eso este",
  "reporte NO emite comandos: falta que un humano decida que version",
  "asignarle a cada una (o acepte una version \"de documentacion\", con el",
  "entendido de que no refleja cuando se aplico de verdad).",
  "",
  aplicarSinRegistro.length
    ? aplicarSinRegistro
        .map(
          (f) =>
            `- \`${f.archivo}\` → APLICADA, sin fila en el historial. Falta decidir su version de 14 digitos antes de poder correr \`repair\`.`,
        )
        .join("\n")
    : "- Ninguna.",
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
renombrados.forEach((r) => console.log(`  - ${r.name} -> ${r.archivo} (jaccard ${r.jaccard.toFixed(2)}, ${r.interseccion} objetos)`));
console.log(`Dudosos (evidencia insuficiente): ${dudosos.length}`);
dudosos.forEach((d) => console.log(`  - ${d.name} -> ?${d.archivo} (jaccard ${d.jaccard.toFixed(2)}, ${d.interseccion} objeto(s), min ${MIN_INTERSECTION})`));
console.log(`Archivo sin registro (contabilidad): ${archivoSinRegistro.length}`);
console.log(`Proyecto linked: ${linked}. Ningun comando de repair propuesto/emitido (ver reporte).`);
console.log(`Reporte → ${salida}`);
console.log("Ningun `repair` fue ejecutado. Revisa el reporte y autoriza.");
