#!/usr/bin/env node
/**
 * Simulacro de recuperacion ante desastre (B-01).
 *
 * Un respaldo que nunca se ha restaurado es una hipotesis, no un respaldo.
 * Este script convierte la hipotesis en hecho, y falla ruidosamente si no lo es.
 *
 * Corre ENTERO dentro de supabase-01: la imagen del arenero trae pg_dump 17.6,
 * la version exacta de produccion, y el respaldo nunca pasa por el portatil.
 *
 * ATENCION: supabase-01 aloja tambien la PRODUCCION de csl-app (contenedor
 * `supabase-db`) y el stack de PalusaApp (`palusa-*`). Este script no los toca
 * jamas: usa exclusivamente el nombre `dermaland-dr-db` y lo destruye al
 * terminar, pase lo que pase.
 *
 * Uso:
 *   DERMALAND_DR_CONFIRM=si node scripts/backup/dr-drill.mjs
 *
 * Sale con codigo 0 solo si el simulacro PASA.
 *
 * ─── Manejo del secreto ──────────────────────────────────────────────────────
 * La cadena de conexion de produccion NUNCA aparece en argv (ni en la Mac ni en
 * el servidor) ni en un log. Viaja por stdin de `ssh`, se materializa en el
 * servidor en un directorio `mktemp -d` con `umask 077` y muere en un `trap`.
 * Dentro se separan dos archivos:
 *   - `env`    → PGHOST/PGPORT/PGUSER/PGDATABASE/PGSSLMODE/PGPASSFILE. Nada
 *                secreto: son los mismos datos que ya estan en .env.local.
 *   - `pgpass` → SOLO la contrasena, en formato .pgpass, modo 600.
 * El contenedor recibe `--env-file env` y el directorio montado de solo
 * lectura. Verificado: `docker inspect` del contenedor efimero muestra el host
 * y el usuario, pero NO la contrasena — que es la mejora concreta sobre meter
 * PGPASSWORD en el --env-file, donde `docker inspect` si la revelaria.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeTarget } from "./lib/assert-safe-target.mjs";
import { buildDermaLandFootprint } from "./lib/dermaland-footprint.mjs";
import { buildPgDumpArgs } from "./lib/pg-dump-args.mjs";
import { FINGERPRINT_SQL, diffFingerprints } from "./lib/schema-fingerprint.mjs";
import { assertMagnitudCreible, assertOrigenDistinto } from "./lib/dr-guards.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const HOST = process.env.DR_HOST ?? "cibaocloud@supabase-01";
const CONTENEDOR = "dermaland-dr-db";
const VOLUMEN = "dermaland-dr-data";
const DIR_TRABAJO = "/tmp/dermaland-dr-taller";
const IMAGEN = "supabase/postgres:17.6.1.132";
const CONFIRM = process.env.DERMALAND_DR_CONFIRM ?? "";

/**
 * El restore corre como `supabase_admin`, no como `postgres`.
 *
 * No es un capricho: en la imagen `supabase/postgres` el rol `postgres` NO es
 * superusuario (rolsuper=f) y no es dueno de los esquemas `auth`, `storage`,
 * `realtime` ni `vault`. Medido el 2026-08-05: restaurar como `postgres`
 * produce 517 errores ("permission denied for schema auth", "must be owner of
 * table users") y arrastra en cascada los COPY, que psql termina interpretando
 * como SQL suelto. Como `supabase_admin` (rolsuper=t): 0 errores.
 */
const ROL_RESTAURACION = "supabase_admin";

/**
 * Nombres de otros inquilinos que conviven en supabase-01. Si el destino
 * coincidiera con alguno, abortamos antes de mandar un solo byte al servidor.
 */
const NOMBRES_PROHIBIDOS = [/^supabase-/, /^palusa/, /^realtime/];

// ─── Salvaguardas estaticas ──────────────────────────────────────────────────
for (const [etiqueta, nombre] of [
  ["contenedor", CONTENEDOR],
  ["volumen", VOLUMEN],
]) {
  if (NOMBRES_PROHIBIDOS.some((re) => re.test(nombre))) {
    console.error(`ABORTADO: el ${etiqueta} destino "${nombre}" es de otro inquilino.`);
    process.exit(1);
  }
}
if (CONTENEDOR !== "dermaland-dr-db") {
  console.error("ABORTADO: el contenedor destino fue alterado.");
  process.exit(1);
}

// ─── Conexion a produccion ───────────────────────────────────────────────────
function dsnProduccion() {
  const crudo =
    process.env.SUPABASE_DB_URL ??
    (() => {
      const env = readFileSync(path.join(root, "apps/web/.env.local"), "utf8");
      const m = env.match(/^SUPABASE_DB_URL=(.*)$/m);
      if (!m) return null;
      return m[1].trim().replace(/^["']|["']$/g, "");
    })();

  if (!crudo) {
    console.error("ERROR: falta SUPABASE_DB_URL (entorno o apps/web/.env.local).");
    process.exit(1);
  }

  let u;
  try {
    u = new URL(crudo);
  } catch {
    console.error("ERROR: SUPABASE_DB_URL no es una URL valida.");
    process.exit(1);
  }
  return {
    host: u.hostname,
    puerto: u.port || "5432",
    usuario: decodeURIComponent(u.username),
    clave: decodeURIComponent(u.password),
    base: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres",
  };
}

const PROD = dsnProduccion();

/** En .pgpass, `:` y `\` dentro de un campo van escapados con `\`. */
const escaparPgpass = (s) => s.replace(/([\\:])/g, "\\$1");

/**
 * Prefijo bash que materializa el secreto en el servidor. `$SEC` queda
 * disponible para el cuerpo; el `trap` lo borra pase lo que pase.
 */
function conSecretos(cuerpo) {
  return `set -euo pipefail
umask 077
SEC=$(mktemp -d)
trap 'rm -rf "$SEC"' EXIT
cat > "$SEC/env" <<'ENVEOF'
PGHOST=${PROD.host}
PGPORT=${PROD.puerto}
PGUSER=${PROD.usuario}
PGDATABASE=${PROD.base}
PGSSLMODE=require
PGPASSFILE=/secreto/pgpass
ENVEOF
cat > "$SEC/pgpass" <<'PASSEOF'
${PROD.host}:${PROD.puerto}:${PROD.base}:${PROD.usuario}:${escaparPgpass(PROD.clave)}
PASSEOF
chmod 600 "$SEC/pgpass"
${cuerpo}
`;
}

/**
 * Corre un script bash en el servidor. El cuerpo viaja por stdin, no por argv:
 * asi ningun secreto aparece en `ps` del servidor.
 *
 * OJO (encontrado corriendo esto de verdad): `bash -s` lee el guion de su
 * propia stdin, asi que cualquier `docker exec -i` / `docker run -i` DENTRO
 * del guion se traga el resto del guion si no se le redirige la entrada. Todo
 * comando `-i` de aqui en adelante lleva `</dev/null` o un heredoc explicito.
 */
function remoto(script, { permitirFallo = false } = {}) {
  const res = spawnSync("ssh", [HOST, "bash", "-s"], {
    input: script,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (res.error) throw new Error(`No se pudo abrir ssh a ${HOST}: ${res.error.message}`);
  if (res.status !== 0 && !permitirFallo) {
    throw new Error(`Fallo remoto (codigo ${res.status}):\n${(res.stderr ?? "").trim()}`);
  }
  return { salida: res.stdout ?? "", error: res.stderr ?? "", codigo: res.status ?? 0 };
}

/**
 * Extrae el JSON de una salida de psql. No se asume que sea la unica linea:
 * un `SET`, un aviso o una linea en blanco no deben tumbar el simulacro.
 */
function extraerJson(salida, quien) {
  const linea = salida
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{") && l.endsWith("}"))
    .pop();
  if (!linea) {
    throw new Error(`No se encontro JSON en la respuesta de ${quien}. Salida cruda:\n${salida.slice(0, 500)}`);
  }
  try {
    return JSON.parse(linea);
  } catch (e) {
    throw new Error(`JSON invalido desde ${quien}: ${e.message}`);
  }
}

/** psql dentro del arenero (socket local, sin clave, sin puerto expuesto). */
function psqlArenero(sql) {
  const { salida } = remoto(`set -euo pipefail
docker exec -i ${CONTENEDOR} psql -U ${ROL_RESTAURACION} -d postgres -qtA -v ON_ERROR_STOP=1 <<'SQLEOF'
${sql}
SQLEOF`);
  return salida;
}

/** psql contra produccion, desde un contenedor efimero. SOLO LECTURA. */
function psqlProduccion(sql) {
  const { salida } = remoto(
    conSecretos(`docker run --rm -i --env-file "$SEC/env" -v "$SEC:/secreto:ro" ${IMAGEN} \\
  psql -qtA -v ON_ERROR_STOP=1 <<'SQLEOF'
${sql}
SQLEOF`),
  );
  return salida;
}

/** Identidad del cluster: unica por cluster, indiferente al DSN con que se llegue. */
const SQL_IDENTIDAD = `select json_build_object(
  'sysid', (select system_identifier::text from pg_control_system()),
  'base', current_database(),
  'inicio', pg_postmaster_start_time()::text,
  'version', current_setting('server_version')
);`;

const paso = (n, t) => console.log(`\n[${n}/6] ${t}`);
const bitacora = [];
const anotar = (linea) => {
  bitacora.push(linea);
  console.log(`   ${linea}`);
};

let creado = false;
let destruido = false;

/** El paso 6 corre siempre, incluso si algo revento antes. */
function destruir() {
  if (destruido) return;
  destruido = true;
  try {
    remoto(`set -uo pipefail
docker rm -f ${CONTENEDOR} >/dev/null 2>&1 || true
docker volume rm ${VOLUMEN} >/dev/null 2>&1 || true
rm -rf ${DIR_TRABAJO}
echo destruido`);
    console.log("   Arenero destruido y respaldo temporal borrado del servidor.");
  } catch (e) {
    console.error("   AVISO: no se pudo destruir el arenero:", e.message);
    console.error(`   Hazlo a mano: ssh ${HOST} 'docker rm -f ${CONTENEDOR}; docker volume rm ${VOLUMEN}; rm -rf ${DIR_TRABAJO}'`);
  }
}

// Si alguien corta el simulacro a media corrida, el arenero igual se destruye.
for (const senal of ["SIGINT", "SIGTERM"]) {
  process.on(senal, () => {
    console.error(`\n${senal}: destruyendo el arenero antes de salir…`);
    destruir();
    process.exit(130);
  });
}

// ─── 0. Guarda deny-by-default, FUERA del try ────────────────────────────────
// Deliberadamente antes del try y antes de abrir un solo socket. Dos razones,
// las dos encontradas corriendo esto de verdad:
//
//   1. Un fallo aqui NO es un resultado del simulacro, es un simulacro que
//      nunca empezo. Si escribiera reporte, correr el script sin confirmacion
//      (la comprobacion natural de que la guarda funciona) PISARIA el reporte
//      real del dia con un "FALLA" que no midio nada.
//   2. Si estuviera dentro del try, el `finally` correria `destruir()`, que
//      hace `docker rm -f dermaland-dr-db`. Una invocacion despistada sin
//      confirmacion mataria el arenero de un simulacro legitimo corriendo en
//      otra terminal.
//
// Sin confirmacion: no se toca el servidor, no se escribe reporte, se sale 1.
const footprint = buildDermaLandFootprint();
try {
  assertSafeTarget({ tables: [], confirm: CONFIRM, isProduction: false, footprint });
} catch (e) {
  console.error(`\n❌ El simulacro no llego a empezar: ${e.message}`);
  console.error("   No se toco el servidor y no se escribio reporte.");
  process.exit(1);
}

const inicio = Date.now();
let inventarioAntes = "";
let veredicto = false;
let problemas = [];
let erroresRestore = 0;
let detalleErrores = "";
let huellaProd = null;
let magnitudes = { tablas: 0, politicas: 0 };
let identidadProd = null;
let identidadCopia = null;
let dumpBytes = 0;
let dumpLineas = 0;

try {
  // ── 1. Levantar el arenero ────────────────────────────────────────────────
  paso(1, "Levantando el arenero aislado en el servidor…");
  const arranque = remoto(`set -euo pipefail
# Salvaguarda del lado del servidor: jamas tocar contenedores de otros inquilinos.
case "${CONTENEDOR}" in
  supabase-*|palusa*|realtime*) echo "ABORTADO: contenedor prohibido"; exit 1;;
esac
docker ps -a --format '{{.Names}}' | sort > /tmp/dermaland-dr-inventario-antes.txt
docker rm -f ${CONTENEDOR} >/dev/null 2>&1 || true
docker volume rm ${VOLUMEN} >/dev/null 2>&1 || true
rm -rf ${DIR_TRABAJO}
mkdir -p ${DIR_TRABAJO}
chmod 700 ${DIR_TRABAJO}
docker volume create ${VOLUMEN} >/dev/null
# Sin -p: el arenero NO expone puerto. Se opera solo por docker exec.
docker run -d --name ${CONTENEDOR} \\
  -e POSTGRES_PASSWORD=arenero-efimero \\
  -v ${VOLUMEN}:/var/lib/postgresql/data \\
  ${IMAGEN} >/dev/null
# La imagen arranca un postgres TEMPORAL solo por socket para inicializarse y
# luego lo reinicia. Esperar por socket da un falso "listo" y la conexion se
# cae a mitad del restore; por eso se espera por TCP en 127.0.0.1, que solo
# escucha el servidor definitivo.
listo=0
for i in $(seq 1 90); do
  if docker exec ${CONTENEDOR} pg_isready -h 127.0.0.1 -p 5432 -U postgres >/dev/null 2>&1; then listo=1; break; fi
  sleep 2
done
if [ "$listo" != "1" ]; then echo "ABORTADO: el arenero no acepta conexiones"; exit 1; fi
echo "inventario_antes=$(wc -l < /tmp/dermaland-dr-inventario-antes.txt)"
docker inspect -f '{{.Config.Image}}' ${CONTENEDOR}
docker port ${CONTENEDOR} | wc -l`);
  creado = true;
  const [invLinea, imagenUsada, puertosPublicados] = arranque.salida.trim().split("\n");
  inventarioAntes = invLinea;
  anotar(`Arenero listo · imagen ${imagenUsada} · puertos publicados: ${puertosPublicados.trim()}`);

  // ── 2. Comprobar que el destino es seguro ANTES de escribir nada ──────────
  paso(2, "Comprobando que el destino es seguro y NO es produccion…");

  identidadProd = extraerJson(psqlProduccion(SQL_IDENTIDAD), "produccion");
  identidadCopia = extraerJson(psqlArenero(SQL_IDENTIDAD), "el arenero");
  // Sin esto, `diffFingerprints(prod, prod)` daria ok:true: un simulacro
  // apuntado dos veces a produccion se aprobaria a si mismo.
  assertOrigenDistinto({ origen: identidadProd, destino: identidadCopia });
  anotar(`Origen  (produccion): cluster ${identidadProd.sysid} · Postgres ${identidadProd.version}`);
  anotar(`Destino (arenero):    cluster ${identidadCopia.sysid} · Postgres ${identidadCopia.version}`);

  const tablasDestino = psqlArenero(
    `select coalesce(string_agg(tablename, ','), '') from pg_tables where schemaname = 'public';`,
  ).trim();
  assertSafeTarget({
    tables: tablasDestino ? tablasDestino.split(",").filter(Boolean) : [],
    confirm: CONFIRM,
    isProduction: false,
    footprint,
  });
  anotar(`Destino verificado: ${tablasDestino ? tablasDestino.split(",").length : 0} tablas en public, aislado y desechable.`);

  // ── 3. Respaldo fresco de produccion (SOLO LECTURA) ───────────────────────
  paso(3, "Generando respaldo fresco de produccion (solo lectura)…");
  // Los flags salen de lib/pg-dump-args.mjs para que el simulacro y el
  // respaldo nocturno no puedan divergir: se prueba EL MISMO artefacto.
  // `dbUrl: ""` y el filtro posterior son deliberados: la conexion no viaja en
  // argv sino por PG*/PGPASSFILE (ver cabecera), asi que el ultimo argumento
  // que la funcion agrega sobra.
  const argsDump = buildPgDumpArgs({
    outFile: "/salida/dermaland-dr.sql.gz",
    dbUrl: "",
    // withDrop es OBLIGATORIO aqui, no una preferencia. Medido el 2026-08-05:
    // la imagen del arenero ya trae auth.users/auth.instances/... con la forma
    // de una version vieja de GoTrue. Sin --clean --if-exists el CREATE TABLE
    // choca, el COPY se cae detras y auth.users queda con 0 de 3 filas — el
    // simulacro reportaria FALLA por un problema del destino, no del respaldo.
    // Con --clean --if-exists: 0 errores. Es tambien el modo destructivo para
    // el que existe assertSafeTarget, asi que la guarda del paso 2 deja de ser
    // decorativa.
    withDrop: true,
  }).filter((a) => a !== "");
  for (const a of argsDump) {
    if (/[^\w./=-]/.test(a)) throw new Error(`Argumento de pg_dump con caracteres inesperados: ${a}`);
  }

  const dump = remoto(
    conSecretos(`docker run --rm --env-file "$SEC/env" -v "$SEC:/secreto:ro" -v ${DIR_TRABAJO}:/salida ${IMAGEN} \\
  pg_dump ${argsDump.join(" ")} </dev/null
stat -c '%s' ${DIR_TRABAJO}/dermaland-dr.sql.gz
gunzip -c ${DIR_TRABAJO}/dermaland-dr.sql.gz | wc -l`),
  );
  [dumpBytes, dumpLineas] = dump.salida.trim().split("\n").map((n) => Number(n.trim()));
  anotar(
    `Respaldo: ${(dumpBytes / 1024).toFixed(0)} KiB comprimidos · ${dumpLineas.toLocaleString("es-DO")} lineas de SQL.`,
  );

  // ── 4. Restaurar en el arenero ────────────────────────────────────────────
  paso(4, "Restaurando el respaldo en el arenero…");
  const restore = remoto(`set -uo pipefail
gunzip -c ${DIR_TRABAJO}/dermaland-dr.sql.gz \\
  | docker exec -i ${CONTENEDOR} psql -U ${ROL_RESTAURACION} -d postgres -q \\
  > ${DIR_TRABAJO}/restore.out 2> ${DIR_TRABAJO}/restore.err
echo "errores=$(grep -c '^ERROR' ${DIR_TRABAJO}/restore.err || true)"
grep '^ERROR' ${DIR_TRABAJO}/restore.err | sed 's/"[^"]*"/"X"/g' | sort | uniq -c | sort -rn | head -20 || true`);
  const lineasRestore = restore.salida.trim().split("\n");
  erroresRestore = Number((lineasRestore[0] ?? "errores=0").split("=")[1] ?? 0);
  detalleErrores = lineasRestore.slice(1).join("\n").trim();
  if (erroresRestore > 0) {
    console.warn(`   ⚠️  ${erroresRestore} errores durante la restauracion:`);
    console.warn(detalleErrores.replace(/^/gm, "      "));
  } else {
    anotar("Restauracion sin un solo error.");
  }

  // ── 5. Comparar produccion contra la copia ────────────────────────────────
  paso(5, "Comparando produccion contra la copia (7 dimensiones)…");
  huellaProd = extraerJson(psqlProduccion(FINGERPRINT_SQL), "produccion");
  const huellaCopia = extraerJson(psqlArenero(FINGERPRINT_SQL), "el arenero");

  // Piso de MAGNITUD, no solo de presencia: diffFingerprints ya rechaza una
  // huella vacia, pero una simbolica (una tabla, una politica) la pasaria y
  // contra ella "no falta nada" se cumple trivialmente.
  magnitudes = assertMagnitudCreible(huellaProd);
  anotar(
    `Huella de produccion creible: ${magnitudes.tablas} tablas rastreadas · ${magnitudes.politicas} politicas RLS · ` +
      `${huellaProd.funciones.length} funciones · ${huellaProd.indices.length} indices · ${huellaProd.restricciones.length} restricciones.`,
  );

  const diff = diffFingerprints(huellaProd, huellaCopia);
  problemas = diff.problemas;
  // El veredicto exige ADEMAS un restore sin errores: en una restauracion de
  // desastre no existe el error benigno.
  veredicto = diff.ok && erroresRestore === 0;
} catch (e) {
  problemas = [e.message];
  veredicto = false;
  console.error("\n❌ El simulacro se detuvo:", e.message);
} finally {
  paso(6, "Destruyendo el arenero…");
  destruir();

  // Confirmar que el servidor quedo EXACTAMENTE como estaba.
  try {
    const inv = remoto(`set -uo pipefail
docker ps -a --format '{{.Names}}' | sort > /tmp/dermaland-dr-inventario-despues.txt
echo "despues=$(wc -l < /tmp/dermaland-dr-inventario-despues.txt)"
echo "sobrantes=$(docker ps -a --format '{{.Names}}' | grep -c '^dermaland' || true)"
echo "volumenes=$(docker volume ls --format '{{.Name}}' | grep -c '^dermaland' || true)"
if [ -f /tmp/dermaland-dr-inventario-antes.txt ]; then
  echo "diferencias=$(diff /tmp/dermaland-dr-inventario-antes.txt /tmp/dermaland-dr-inventario-despues.txt | grep -c '^[<>]' || true)"
fi
echo "vecinos_corriendo=$(docker ps --format '{{.Names}}' | grep -cE '^(supabase|palusa|realtime)' || true)"
rm -f /tmp/dermaland-dr-inventario-antes.txt /tmp/dermaland-dr-inventario-despues.txt`);
    console.log(`   Inventario del servidor: ${inv.salida.trim().split("\n").join(" · ")}`);
    bitacora.push(`Inventario tras el simulacro: ${inv.salida.trim().split("\n").join(" · ")}`);
  } catch (e) {
    console.error("   AVISO: no se pudo verificar el inventario del servidor:", e.message);
  }
}

// ─── Reporte ─────────────────────────────────────────────────────────────────
// Fecha LOCAL a proposito: en RD (UTC-4) `toISOString()` ya esta en el dia
// siguiente desde las 8 p.m., y el reporte se fecharia manana.
const ahora = new Date();
const pad = (n) => String(n).padStart(2, "0");
const hoy = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;
const salida = path.join(root, "docs", `dr-drill-${hoy.replace(/-/g, "")}.md`);
const duracion = ((Date.now() - inicio) / 1000).toFixed(0);
const filasProd = Object.values(huellaProd?.filas ?? {}).reduce((a, b) => a + Number(b), 0);

const md = [
  `# Simulacro de recuperacion — ${hoy}`,
  "",
  `**Veredicto: ${veredicto ? "PASA" : "FALLA"}**`,
  "",
  `Generado por \`node scripts/backup/dr-drill.mjs\` en ${duracion} s. Este archivo lo escribe`,
  "el script; no se edita a mano.",
  "",
  "## Que se probo",
  "",
  `- **Origen:** produccion (cluster \`${identidadProd?.sysid ?? "?"}\`, PostgreSQL ${identidadProd?.version ?? "?"}), **solo lectura**.`,
  `- **Destino:** contenedor efimero \`${CONTENEDOR}\` (\`${IMAGEN}\`) en \`${HOST}\`, sin puerto expuesto,`,
  `  cluster \`${identidadCopia?.sysid ?? "?"}\` — distinto del de origen, comprobado antes de comparar.`,
  `- **Respaldo:** \`pg_dump --no-owner --no-privileges --clean --if-exists -Z 9\` (los mismos flags que`,
  "  el respaldo nocturno, via `lib/pg-dump-args.mjs`).",
  `- **Restaurado como:** \`${ROL_RESTAURACION}\`.`,
  "",
  "## Numeros",
  "",
  "| Medida | Valor |",
  "|---|---|",
  `| Respaldo | ${(dumpBytes / 1024).toFixed(0)} KiB comprimidos · ${dumpLineas.toLocaleString("es-DO")} lineas |`,
  `| Errores durante la restauracion | ${erroresRestore} |`,
  `| Tablas rastreadas | ${magnitudes.tablas} |`,
  `| Filas en produccion | ${filasProd.toLocaleString("es-DO")} |`,
  `| Politicas RLS | ${magnitudes.politicas} |`,
  `| Funciones | ${huellaProd?.funciones?.length ?? 0} |`,
  `| Indices | ${huellaProd?.indices?.length ?? 0} |`,
  `| Restricciones (FK/CHECK) | ${huellaProd?.restricciones?.length ?? 0} |`,
  `| Diferencias encontradas | ${problemas.length} |`,
  "",
  "## Bitacora",
  "",
  ...bitacora.map((l) => `- ${l}`),
  "",
  veredicto
    ? "## Resultado\n\nLas siete dimensiones (filas, funciones, politicas, definiciones de politica, RLS,\n" +
      "indices y restricciones) cuadran al 100 %, y la restauracion no produjo un solo\n" +
      "error. **El respaldo es restaurable.** B-01 deja de ser una hipotesis."
    : "## Diferencias encontradas\n\n" +
      problemas.slice(0, 100).map((p) => `- ${p}`).join("\n") +
      (problemas.length > 100 ? `\n- …y ${problemas.length - 100} mas.` : "") +
      (erroresRestore > 0
        ? `\n\n### Errores de restauracion (${erroresRestore})\n\n\`\`\`\n${detalleErrores}\n\`\`\``
        : ""),
  "",
  "## Lo que este simulacro NO cubre",
  "",
  "Decirlo importa: un reporte que calla esto miente por omision.",
  "",
  "- **Objetos globales del cluster.** `pg_dump` no exporta roles ni contrasenas de",
  "  rol. Aqui vinieron de la imagen `supabase/postgres`, que ya trae `anon`,",
  "  `authenticated`, `service_role`, `supabase_admin`… En un destino sin esos",
  "  roles el restore fallaria. Un DR completo necesita ademas `pg_dumpall -g`.",
  "- **Archivos de Storage.** Las 642 filas de `storage.objects` son METADATOS; los",
  "  binarios (fotos de producto) viven fuera de la base y necesitan su propio",
  "  respaldo. Restaurar esta base deja el catalogo intacto y las imagenes rotas.",
  "- **Restaurar con el rol `postgres` de un proyecto Supabase Cloud nuevo.** Aqui se",
  "  restauro como `supabase_admin` (superusuario). Medido: como `postgres`, que en",
  "  la imagen NO es superusuario, el mismo respaldo produce 517 errores sobre",
  "  `auth`/`storage`/`realtime`. Es decir: este respaldo se restaura en un cluster",
  "  Postgres con forma de Supabase operado con privilegios plenos (self-hosted, o",
  "  con soporte de Supabase), no en un proyecto Cloud recien creado usando solo el",
  "  rol `postgres`.",
  "- **El tiempo real de un desastre.** Aqui se midio el ciclo dump→restore→comparacion,",
  "  no el RTO extremo a extremo (aprovisionar proyecto, DNS, secretos, redeploy).",
  "- **La autenticidad del servidor de produccion.** La conexion usa `PGSSLMODE=require`:",
  "  cifra, pero NO verifica el certificado del servidor. Es la misma postura de",
  "  cualquier cadena de conexion de Supabase y aqui solo se LEE, pero `verify-full`",
  "  exigiria montar el CA de Supabase en el contenedor y no se hizo.",
  "",
  "## Cuando repetirlo",
  "",
  "Antes de cada cambio grande de esquema y, como minimo, una vez por trimestre.",
  "",
].join("\n");

writeFileSync(salida, md, "utf8");
console.log(`\nReporte → ${salida}`);

if (!veredicto) {
  console.error(`\n❌ SIMULACRO FALLIDO — ${problemas.length} problema(s):`);
  problemas.slice(0, 20).forEach((p) => console.error(`   · ${p}`));
  if (problemas.length > 20) console.error(`   · …y ${problemas.length - 20} mas (ver el reporte).`);
  process.exit(1);
}

console.log("\n✅ SIMULACRO SUPERADO: el respaldo restaura completo.");
process.exit(0);
