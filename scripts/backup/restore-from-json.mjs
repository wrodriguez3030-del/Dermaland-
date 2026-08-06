#!/usr/bin/env node
/**
 * Restaura un backup JSON (de rest-json-backup.mjs) a un proyecto Supabase DESTINO
 * (nuevo/aislado) vía service_role. Idempotente (upsert por id) y auto-ordenante:
 * hace pasadas sobre todas las tablas reintentando las que fallan por FKs hasta que
 * una pasada no progrese. Así no depende de acertar el orden exacto de dependencias.
 *
 * REQUISITOS (del proyecto DESTINO, NO el de producción):
 *   TARGET_SUPABASE_URL, TARGET_SERVICE_ROLE_KEY  (env vars)
 * y que el esquema YA esté aplicado en el destino (correr antes las migraciones:
 * supabase/migrations/00*.sql).
 *
 * Uso:
 *   export TARGET_SUPABASE_URL="https://<nuevo-ref>.supabase.co"
 *   export TARGET_SERVICE_ROLE_KEY="<service_role del destino>"
 *   node scripts/backup/restore-from-json.mjs [carpeta_backup]
 *
 * SEGURIDAD: se niega a correr si el destino == el proyecto de producción (y
 * también si NO se puede saber cuál es producción: falla cerrado, ver
 * `urlDeProduccion()` abajo) y, ademas, exige la guarda compartida
 * lib/assert-safe-target.mjs: el destino no puede contener tablas de otro
 * inquilino (csl-app, PalusaApp) ni relaciones fuera de la huella real de
 * DermaLand (tablas Y vistas, derivadas de supabase/migrations/*.sql, ver
 * lib/dermaland-footprint.mjs), y requiere DERMALAND_DR_CONFIRM explicito.
 * Deny-by-default. Si el chequeo de contenido del destino no puede correr
 * (red, permisos, formato inesperado), se avisa por stderr — ver
 * lib/list-target-tables.mjs — y se sigue exigiendo la confirmacion manual.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { assertSafeTarget } from "./lib/assert-safe-target.mjs";
import { buildDermaLandFootprint } from "./lib/dermaland-footprint.mjs";
import { listTargetTables } from "./lib/list-target-tables.mjs";
import { esDestinoProduccion } from "./lib/dr-guards.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

const TARGET_URL = process.env.TARGET_SUPABASE_URL;
const TARGET_KEY = process.env.TARGET_SERVICE_ROLE_KEY;
if (!TARGET_URL || !TARGET_KEY) {
  console.error("Faltan TARGET_SUPABASE_URL / TARGET_SERVICE_ROLE_KEY (proyecto DESTINO).");
  process.exit(1);
}

/**
 * Cual es el proyecto de PRODUCCION, y que pasa si no se puede saber.
 *
 * Antes esto era un `try { …leer .env.local… } catch { /* seguir *\/ }`: en una
 * maquina sin `.env.local` —un equipo de recuperacion, un clon recien hecho,
 * justo las circunstancias en que se restaura de verdad— la comprobacion se
 * saltaba EN SILENCIO y el script quedaba dispuesto a escribir donde le
 * dijeran. Ahora falla cerrado: si no hay forma de saber cual es produccion,
 * no se restaura. `DERMALAND_PROD_SUPABASE_URL` es la salida para esa maquina
 * sin `.env.local`, y exige nombrar produccion explicitamente en vez de
 * suponerla ausente.
 */
function urlDeProduccion() {
  const delEntorno = process.env.DERMALAND_PROD_SUPABASE_URL?.trim();
  if (delEntorno) return delEntorno;
  try {
    const env = readFileSync(path.join(root, "apps/web/.env.local"), "utf8");
    return env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, "")?.trim() ?? null;
  } catch {
    return null;
  }
}

const PROD_URL = urlDeProduccion();
const esProduccion = PROD_URL ? esDestinoProduccion({ destino: TARGET_URL, produccion: PROD_URL }) : null;
if (esProduccion === null) {
  console.error(
    "ABORTADO: no se pudo establecer cual es el proyecto de PRODUCCION, asi que no hay forma\n" +
      "de probar que el destino NO lo es. Falta apps/web/.env.local (o su NEXT_PUBLIC_SUPABASE_URL),\n" +
      "o el destino no es una URL valida.\n" +
      '  Solucion en una maquina sin .env.local: export DERMALAND_PROD_SUPABASE_URL="https://<ref-de-produccion>.supabase.co"',
  );
  process.exit(1);
}

// Guarda compartida: ademas de no ser produccion, el destino no puede contener
// datos de otro inquilino (csl-app, PalusaApp conviven en el mismo servidor
// self-hosted) ni relaciones fuera de la huella real de DermaLand. Ver
// lib/assert-safe-target.mjs, lib/dermaland-footprint.mjs y
// lib/list-target-tables.mjs (ahi esta el detalle de por que NO se usa una
// RPC `pg_tables_public` — no existe — y por que un fallo al listar las
// tablas del destino se avisa por stderr en vez de fallar en silencio).
try {
  assertSafeTarget({
    tables: await listTargetTables({ url: TARGET_URL, key: TARGET_KEY }),
    confirm: process.env.DERMALAND_DR_CONFIRM ?? "",
    // Calculado, no `false` a mano: es la guarda de "no escribas en produccion"
    // y hasta esta correccion nadie se la preguntaba de verdad.
    isProduction: esProduccion,
    footprint: buildDermaLandFootprint(),
  });
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const backupsDir = path.join(root, "backups");
const dirArg = process.argv[2];
const dir = dirArg
  ? path.resolve(dirArg)
  : (() => {
      const ds = readdirSync(backupsDir).filter((d) => d.startsWith("rest-")).sort();
      return ds.length ? path.join(backupsDir, ds[ds.length - 1]) : null;
    })();
if (!dir || !existsSync(dir)) { console.error("No hay backup para restaurar."); process.exit(1); }

const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
const tables = Object.keys(manifest.tables).filter((t) => typeof manifest.tables[t] === "number");
const target = createClient(TARGET_URL, TARGET_KEY, { auth: { persistSession: false } });

console.log(`Restaurando ${dir} → ${TARGET_URL}\n`);

async function upsertTable(t) {
  const rows = JSON.parse(readFileSync(path.join(dir, `${t}.json`), "utf8"));
  if (rows.length === 0) return { done: true, loaded: 0 };
  // Upsert en lotes de 500 (idempotente por PK id).
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await target.from(t).upsert(chunk, { onConflict: "id" });
    if (error) return { done: false, error: error.message, loaded: i };
  }
  return { done: true, loaded: rows.length };
}

async function run() {
  const pending = new Set(tables);
  let pass = 0;
  while (pending.size > 0 && pass < 8) {
    pass++;
    let progressed = false;
    for (const t of [...pending]) {
      const r = await upsertTable(t);
      if (r.done) {
        pending.delete(t);
        progressed = true;
        console.log(`  ✅ [p${pass}] ${t}: ${r.loaded}`);
      }
    }
    if (!progressed) break; // ninguna tabla avanzó → quedan FKs irresolubles
  }
  if (pending.size === 0) {
    console.log(`\n✅ Restauración completa (${tables.length} tablas).`);
    console.log("Verificá conteos: comparalos contra manifest.json en el destino.");
    process.exit(0);
  } else {
    console.log(`\n❌ Quedaron ${pending.size} tablas sin restaurar: ${[...pending].join(", ")}`);
    console.log("Revisá que las migraciones estén aplicadas en el destino y las FKs.");
    process.exit(1);
  }
}
run().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
