/**
 * Deriva la huella de RELACIONES propias de DermaLand leyendo las migraciones
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
 *
 * ─── Ronda de correccion 2 (2026-08-06): las VISTAS tambien son el destino ───
 * La huella se quedaba solo con `kind === "table"`, pero los dos llamadores de
 * la guarda listaban el destino de formas DISTINTAS, y por eso ninguna revision
 * por tarea lo vio:
 *
 *   - `dr-drill.mjs` listaba con `pg_tables`, que NO devuelve vistas.
 *   - `restore-from-json.mjs` lista con `listTargetTables()`, o sea el spec
 *     OpenAPI de PostgREST, que SI expone vistas junto a las tablas.
 *
 * Medido contra produccion el 2026-08-06: PostgREST expone 84 objetos y la
 * huella tenia 83 — sobraba `inventory_stock_by_lot`, la vista de
 * `0002_phase2_inventory.sql`. Resultado: quien siguiera el procedimiento
 * documentado (proyecto nuevo → migraciones → restore) recibia
 * "ABORTADO: el destino contiene tablas desconocidas (inventory_stock_by_lot)"
 * el 100 % de las veces, con un mensaje que ACUSA al destino de estar
 * contaminado cuando esta perfecto. A las 3 AM eso no se investiga: se apaga
 * la guarda.
 *
 * La correccion no es "filtrar vistas al listar" (desde el spec OpenAPI no se
 * pueden distinguir de forma fiable: `inventory_stock_by_lot` es una vista
 * auto-actualizable, asi que PostgREST le publica POST/PATCH/DELETE igual que
 * a una tabla). Es al reves: la huella RECONOCE vistas, y el criterio de que
 * cuenta como "relacion del destino" vive UNA sola vez, aqui abajo, y lo
 * importan los dos llamadores. `sqlRelacionesDelDestino()` genera su SQL a
 * partir de la misma lista, asi que no hay dos sitios que puedan divergir.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractObjects } from "../../lib/migration-objects.mjs";

/**
 * Que cuenta como "una relacion del destino", en un solo lugar.
 *
 * `kind` es el vocabulario de `extractObjects` (lo que DECLARA el SQL del
 * repo) y `relkinds` el de `pg_class.relkind` (lo que EXISTE en la base). Los
 * dos lados salen de esta lista para que agregar una clase futura —una vista
 * materializada, una tabla particionada— no pueda quedar cubierta de un lado
 * y no del otro.
 */
export const CLASES_DE_RELACION = Object.freeze([
  Object.freeze({ kind: "table", relkinds: Object.freeze(["r", "p"]) }),
  Object.freeze({ kind: "view", relkinds: Object.freeze(["v", "m"]) }),
]);

/** Kinds de `extractObjects` que entran en la huella. */
export const KINDS_DE_LA_HUELLA = Object.freeze(CLASES_DE_RELACION.map((c) => c.kind));

/** `pg_class.relkind` equivalentes, para consultar el destino. */
export const RELKINDS_DEL_DESTINO = Object.freeze(CLASES_DE_RELACION.flatMap((c) => [...c.relkinds]));

/**
 * SQL que lista las relaciones del destino con EL MISMO criterio que la huella.
 *
 * Devuelve una sola celda con los nombres separados por coma (mismo formato
 * que consumia el `pg_tables` anterior de dr-drill.mjs). `pg_tables` se
 * descarto justamente por ser el origen de la divergencia: omite vistas.
 *
 * @param {string} [esquema] solo se aceptan identificadores simples; el valor
 *   se valida en vez de escaparse porque aqui nunca viene de un usuario.
 */
export function sqlRelacionesDelDestino(esquema = "public") {
  if (!/^[a-z_][a-z0-9_]*$/.test(esquema)) {
    throw new Error(`Esquema invalido para la consulta de destino: ${esquema}`);
  }
  const relkinds = RELKINDS_DEL_DESTINO.map((k) => `'${k}'`).join(", ");
  return (
    `select coalesce(string_agg(c.relname, ',' order by c.relname), '') ` +
    `from pg_class c join pg_namespace n on n.oid = c.relnamespace ` +
    `where n.nspname = '${esquema}' and c.relkind in (${relkinds});`
  );
}

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
 * @returns {Set<string>} nombres de tabla Y VISTA declarados en
 *   supabase/migrations/*.sql (sin `public.`; otros esquemas explicitos se
 *   conservan calificados, ver migration-objects.mjs `qualify()`).
 */
export function buildDermaLandFootprint({ migrationsDir = DEFAULT_MIGRATIONS_DIR } = {}) {
  const archivos = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  const relaciones = new Set();
  for (const archivo of archivos) {
    const sql = readFileSync(path.join(migrationsDir, archivo), "utf8");
    for (const obj of extractObjects(sql)) {
      if (KINDS_DE_LA_HUELLA.includes(obj.kind)) relaciones.add(obj.name);
    }
  }
  return relaciones;
}
