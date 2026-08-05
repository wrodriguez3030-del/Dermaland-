/**
 * Deriva la huella de tablas propias de DermaLand leyendo las migraciones
 * REALES del repo (`supabase/migrations/*.sql`), en vez de mantenerla a mano.
 *
 * Ronda de correccion 1 (2026-08-05) encontro que la version anterior de esta
 * huella, hardcodeada en assert-safe-target.mjs, tenia 16 de las 83 tablas
 * reales de produccion, y 4 de esos 16 nombres NI SIQUIERA EXISTEN
 * (`sales`, `sale_items`, `categories`, `cash_sessions` — los nombres reales
 * son `proformas`/`proforma_items`, `product_categories`, y
 * `cash_register_sessions`/`cash_registers`). Consecuencia: un restore real
 * habria abortado SIEMPRE por "tablas desconocidas", incluso con
 * DERMALAND_DR_CONFIRM puesto — falla del lado seguro, pero deja el flujo de
 * restauracion inservible, y una guarda que estorba siempre termina
 * desactivada por alguien con prisa.
 *
 * Se reutiliza `extractObjects` de scripts/lib/migration-objects.mjs (la
 * misma auditoria por objeto que usa scripts/audit-migrations.mjs) para que
 * la huella se derive del mismo lugar que ya es la fuente de verdad de
 * "que declara el SQL", y quede al dia automaticamente cuando alguien
 * agregue una migracion nueva.
 *
 * Verificado 2026-08-05 contra produccion (sntcvyozbhrgicwmtcoh, via
 * information_schema.tables): las 83 tablas base reales coinciden 1 a 1 con
 * lo que este extractor deriva de supabase/migrations/*.sql — 0 de mas,
 * 0 de menos.
 *
 * Deliberadamente SEPARADO de assert-safe-target.mjs: esa guarda se mantiene
 * pura (sin leer disco) para que sus pruebas unitarias sigan siendo
 * deterministas e independientes del estado del repo. Este modulo es el
 * "constructor" que la persona que llama usa para armar el parametro
 * `footprint` antes de invocar la guarda.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractObjects } from "../../lib/migration-objects.mjs";

const DEFAULT_MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
);

/**
 * @param {{ migrationsDir?: string }} [opts]
 * @returns {Set<string>} nombres de tabla declarados por `create table` en
 *   supabase/migrations/*.sql (sin `public.`; otros esquemas explicitos se
 *   conservan calificados, ver migration-objects.mjs `qualify()`).
 */
export function buildDermaLandFootprint({ migrationsDir = DEFAULT_MIGRATIONS_DIR } = {}) {
  const archivos = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  const tablas = new Set();
  for (const archivo of archivos) {
    const sql = readFileSync(path.join(migrationsDir, archivo), "utf8");
    for (const obj of extractObjects(sql)) {
      if (obj.kind === "table") tablas.add(obj.name);
    }
  }
  return tablas;
}
