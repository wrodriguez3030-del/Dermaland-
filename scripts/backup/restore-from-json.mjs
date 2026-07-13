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
 * SEGURIDAD: se niega a correr si el destino == el proyecto de .env.local (evita
 * escribir sobre producción por error).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

const TARGET_URL = process.env.TARGET_SUPABASE_URL;
const TARGET_KEY = process.env.TARGET_SERVICE_ROLE_KEY;
if (!TARGET_URL || !TARGET_KEY) {
  console.error("Faltan TARGET_SUPABASE_URL / TARGET_SERVICE_ROLE_KEY (proyecto DESTINO).");
  process.exit(1);
}

// Guarda: no restaurar sobre el proyecto de producción de .env.local.
try {
  const env = readFileSync(path.join(root, "apps/web/.env.local"), "utf8");
  const prodUrl = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, "");
  if (prodUrl && TARGET_URL.includes(prodUrl.replace(/^https?:\/\//, "").split(".")[0])) {
    console.error("ABORTADO: el destino coincide con el proyecto de producción. Usá un proyecto NUEVO.");
    process.exit(1);
  }
} catch { /* .env.local ausente: seguir */ }

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
