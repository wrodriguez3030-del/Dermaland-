# Cierre de pendientes de producción (B-01, B-07, B-04) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los tres pendientes que separan "apto piloto" de "apto producción": probar que el respaldo restaura (B-01), devolver a `supabase/migrations/` la capacidad de reconstruir el esquema (B-07) y hacer que el 2FA obligue de verdad a los admin (B-04).

**Architecture:** Toda la lógica pura (extraer objetos de un `.sql`, clasificar, comparar huellas de esquema, decidir la puerta de 2FA) vive en módulos pequeños con pruebas unitarias. Los scripts son envolturas delgadas de entrada/salida sobre esos módulos. El simulacro de recuperación corre **entero dentro de `supabase-01`** por SSH: la Mac no necesita `psql` ni `pg_dump` (no los tiene) y el respaldo nunca toca el portátil.

**Tech Stack:** Node.js ESM (`.mjs`) para scripts de operación · TypeScript + Vitest para lógica probada · Next.js middleware · PostgreSQL 17.6 · Docker sobre SSH/Tailscale.

**Spec:** [`../specs/2026-08-05-cierre-pendientes-produccion-design.md`](../specs/2026-08-05-cierre-pendientes-produccion-design.md)

## Global Constraints

- **Nada de este trabajo toca DGII, testecf, XML ni certificados.** Si un cambio los roza, detente y pregunta.
- **Ningún script ejecuta `supabase migration repair`.** Los redacta para autorización humana.
- **Ningún script escribe en producción, con una sola excepción nombrada:** `scripts/mfa-break-glass.mjs` (Task 9), que retira un factor y registra la operación en auditoría. Es su razón de existir. Todo lo demás toca producción **solo de lectura** (`pg_dump`, `SELECT`).
- **Secretos:** `SUPABASE_DB_URL` sale de `apps/web/.env.local`. Nunca en argv, nunca en el repositorio, nunca en un log. En el servidor remoto viaja por archivo temporal con modo `600` y se borra con `trap`.
- **Pruebas unitarias:** las de los `.mjs` de `scripts/` van en `apps/web/tests/unit/*.test.ts` (ya incluido en `apps/web/vitest.config.ts`, hoy vacío) e importan por ruta relativa. Las de código de la app se co-ubican con su fuente (`src/**/*.test.ts`), como ya hace el repo.
- **Rama:** `feat/cierre-pendientes-produccion`, partida de `main`. **No** de `feat/dgii-reformulacion`: llevar esto a producción no puede arrastrar la reformulación fiscal, que tiene su propia política de autorización.
- **Comandos de prueba:** `cd apps/web && pnpm vitest run <ruta>`. Línea base actual: **446 pruebas en verde**.
- **Servidor DR:** `cibaocloud@supabase-01` (Tailscale). Imagen `supabase/postgres:17.6.1.132`. Contenedor `dermaland-dr-db`. **Sin puerto expuesto.**
- **Prohibido absolutamente:** tocar el contenedor `supabase-db` (producción de csl-app) o `palusa-*` (PalusaApp) en ese servidor.
- Mensajes de commit en español, cuerpo explicando el *por qué*, y terminados en `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

# FASE A — B-07: devolver al repositorio la capacidad de reconstruir

Se hace primero porque es de solo lectura, es barata y su resultado informa lo demás.

---

### Task 1: Extractor de objetos y clasificador de migraciones

Lógica pura, sin base de datos. Lee el texto de un `.sql` y dice qué objetos declara; dado el conjunto de objetos que existen, clasifica la migración.

**Files:**
- Create: `scripts/lib/migration-objects.mjs`
- Test: `apps/web/tests/unit/migration-objects.test.ts`

**Interfaces:**
- Produces:
  - `stripSqlComments(sql: string): string`
  - `extractObjects(sql: string): Array<{ kind: 'table'|'column'|'function'|'policy'|'index', name: string }>` — `name` es `tabla` para tablas, `tabla.columna` para columnas, `tabla.politica` para políticas, y el identificador simple para funciones e índices.
  - `classify(objects, existing: Set<string>): 'APLICADA'|'NO_APLICADA'|'PARCIAL'|'INDETERMINADA'` — las claves de `existing` son `${kind}:${name}`.

- [ ] **Step 1: Escribir la prueba que falla**

Crea `apps/web/tests/unit/migration-objects.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  stripSqlComments,
  extractObjects,
  classify,
} from "../../../../scripts/lib/migration-objects.mjs";

describe("stripSqlComments", () => {
  it("quita comentarios de línea y de bloque", () => {
    const sql = `
      -- create table fantasma (id uuid);
      create table real (id uuid);
      /* create table otro_fantasma (id uuid); */
    `;
    const limpio = stripSqlComments(sql);
    expect(limpio).not.toContain("fantasma");
    expect(limpio).toContain("real");
  });
});

describe("extractObjects", () => {
  it("reconoce tablas, columnas, funciones, políticas e índices", () => {
    const sql = `
      create table if not exists public.products (id uuid primary key);
      alter table public.products add column if not exists barcode text;
      create or replace function public.emit_sale_atomic() returns void as $$ begin end; $$ language plpgsql;
      create policy "p_select" on public.products for select using (true);
      create unique index idx_products_barcode on public.products (barcode);
    `;
    expect(extractObjects(sql)).toEqual([
      { kind: "table", name: "products" },
      { kind: "column", name: "products.barcode" },
      { kind: "function", name: "emit_sale_atomic" },
      { kind: "policy", name: "products.p_select" },
      { kind: "index", name: "idx_products_barcode" },
    ]);
  });

  it("ignora DDL comentado", () => {
    expect(extractObjects("-- create table fantasma (id uuid);")).toEqual([]);
  });

  it("devuelve vacío para una migración que solo inserta datos", () => {
    const seed = `insert into public.laboratories (name) values ('ISDIN');`;
    expect(extractObjects(seed)).toEqual([]);
  });
});

describe("classify", () => {
  const objs = [
    { kind: "table", name: "products" },
    { kind: "column", name: "products.barcode" },
  ];

  it("APLICADA cuando todos sus objetos existen", () => {
    const existing = new Set(["table:products", "column:products.barcode"]);
    expect(classify(objs, existing)).toBe("APLICADA");
  });

  it("NO_APLICADA cuando no existe ninguno", () => {
    expect(classify(objs, new Set())).toBe("NO_APLICADA");
  });

  it("PARCIAL cuando existen unos sí y otros no", () => {
    expect(classify(objs, new Set(["table:products"]))).toBe("PARCIAL");
  });

  it("INDETERMINADA cuando la migración no declara objetos", () => {
    // Una migración de solo datos (ej. 0016_laboratories_seed) no declara
    // objetos. Sin este caso, "cero de cero existen" se clasificaría como
    // APLICADA y un `repair` la marcaría aplicada sin haberlo comprobado.
    expect(classify([], new Set(["table:products"]))).toBe("INDETERMINADA");
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `cd apps/web && pnpm vitest run tests/unit/migration-objects.test.ts`
Expected: FAIL — no existe `scripts/lib/migration-objects.mjs`.

- [ ] **Step 3: Implementar el módulo**

Crea `scripts/lib/migration-objects.mjs`:

```js
/**
 * Extrae de un archivo .sql los objetos que DECLARA, para poder preguntarle a
 * la base si existen. El historial de migraciones de DermaLand no es fiable
 * (ver docs/superpowers/specs/2026-08-05-cierre-pendientes-produccion-design.md
 * §5), así que la fuente de verdad es la base, no el registro.
 *
 * Es un extractor por expresiones regulares, no un parser de SQL: suficiente
 * para una lista de comprobación, insuficiente para ejecutar nada. Por eso el
 * resultado se PRESENTA para autorización humana y nunca se aplica solo.
 */

/** Quita comentarios `--` de línea y `/* *\/` de bloque. */
export function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

const PATTERNS = [
  {
    kind: "table",
    re: /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
    name: (m) => m[1],
  },
  {
    kind: "column",
    re: /\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/gi,
    name: (m) => `${m[1]}.${m[2]}`,
  },
  {
    kind: "function",
    re: /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?/gi,
    name: (m) => m[1],
  },
  {
    kind: "policy",
    re: /\bcreate\s+policy\s+"?([^"\n]+?)"?\s+on\s+(?:public\.)?"?([a-z0-9_]+)"?/gi,
    name: (m) => `${m[2]}.${m[1]}`,
  },
  {
    kind: "index",
    re: /\bcreate\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?\s+on\b/gi,
    name: (m) => m[1],
  },
];

/** Objetos declarados por el SQL, en orden de aparición y sin repetidos. */
export function extractObjects(sql) {
  const limpio = stripSqlComments(sql);
  const hallazgos = [];
  for (const { kind, re, name } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(limpio)) !== null) {
      hallazgos.push({ kind, name: name(m), at: m.index });
    }
  }
  hallazgos.sort((a, b) => a.at - b.at);
  const vistos = new Set();
  const salida = [];
  for (const { kind, name } of hallazgos) {
    const clave = `${kind}:${name}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push({ kind, name });
  }
  return salida;
}

/**
 * PARCIAL es el veredicto que justifica todo este ejercicio: marcar como
 * "aplicada" una migración a medias convierte un problema visible en invisible.
 */
export function classify(objects, existing) {
  if (objects.length === 0) return "INDETERMINADA";
  const presentes = objects.filter((o) => existing.has(`${o.kind}:${o.name}`)).length;
  if (presentes === objects.length) return "APLICADA";
  if (presentes === 0) return "NO_APLICADA";
  return "PARCIAL";
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `cd apps/web && pnpm vitest run tests/unit/migration-objects.test.ts`
Expected: PASS (8 pruebas).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/migration-objects.mjs apps/web/tests/unit/migration-objects.test.ts
git commit -m "feat(migraciones): extraer objetos de un .sql y clasificar contra la base

El historial de migraciones no es fiable, asi que la fuente de verdad pasa
a ser la base. INDETERMINADA existe porque una migracion de solo datos no
declara objetos: sin ese caso, 'cero de cero existen' daria APLICADA.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Script de auditoría de migraciones

Consulta la base real, clasifica los 47 archivos y redacta los comandos de reparación **sin ejecutarlos**.

**Files:**
- Create: `scripts/audit-migrations.mjs`
- Uses: `scripts/lib/migration-objects.mjs` (Task 1)

**Interfaces:**
- Consumes: `extractObjects`, `classify` de Task 1.
- Produces: ejecutable por `node scripts/audit-migrations.mjs`. Escribe `docs/migration-audit-<AAAAMMDD>.md`.

- [ ] **Step 1: Implementar el script**

Crea `scripts/audit-migrations.mjs`:

```js
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
```

- [ ] **Step 2: Verificar que `pg` está disponible**

Run: `cd apps/web && node -e "require('pg'); console.log('pg ok')"`
Expected: `pg ok`. Si falla: `cd apps/web && pnpm add -D pg` y volver a intentar.

- [ ] **Step 3: Correr la auditoría**

Run: `node scripts/audit-migrations.mjs`
Expected: imprime el resumen y escribe `docs/migration-audit-<fecha>.md`. **Ningún `repair` ejecutado.**

- [ ] **Step 4: Leer el reporte y verificar que cuadra con lo esperado**

Abre `docs/migration-audit-<fecha>.md` y confirma que la sección "Registros en la base sin archivo local" lista exactamente estos cuatro: `ai_providers_module`, `product_images_storage_bucket`, `ecf_events_fk_restrict`, `0042_payments_azul`.

Si aparecen otros, **detente y repórtalo** — significa que el drift creció desde el diseño.

- [ ] **Step 5: Commit**

```bash
git add scripts/audit-migrations.mjs docs/migration-audit-*.md apps/web/package.json
git commit -m "feat(migraciones): auditoria por objeto contra la base real

Clasifica los 47 archivos en APLICADA/NO_APLICADA/PARCIAL/INDETERMINADA
preguntandole a la base, no al historial, y redacta los comandos de repair
sin ejecutarlos.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Recuperar las cuatro migraciones sin archivo

Sin estos archivos, `supabase/migrations/` no reconstruye producción desde cero. Este es el criterio de cierre real de B-07.

**Files:**
- Create: `supabase/migrations/ai_providers_module.sql`
- Create: `supabase/migrations/product_images_storage_bucket.sql`
- Create: `supabase/migrations/ecf_events_fk_restrict.sql`
- Create: `supabase/migrations/0042_payments_azul.sql`
- Modify: `docs/estado-actual.md`

**Interfaces:**
- Consumes: la lista de huérfanos del reporte de Task 2.
- Produces: nada que otro task consuma. Cierra B-07.

- [ ] **Step 1: Averiguar qué objetos introdujo cada migración huérfana**

Para cada uno de los cuatro nombres, identifica sus objetos consultando la base. Ejemplo para `ai_providers_module`:

```sql
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name like 'ai_%'
order by table_name, ordinal_position;
```

Usa la herramienta MCP `mcp__supabase-dermaland__execute_sql` (solo lectura). Repite acotando por el prefijo que corresponda: `ai_*` para proveedores de IA, el bucket de Storage para imágenes de producto, la clave foránea de `ecf_events` para `ecf_events_fk_restrict`, y las columnas/tablas de pagos Azul para `0042_payments_azul`.

**No inventes DDL.** Todo lo que escribas debe corresponder a un objeto que exista hoy en la base.

- [ ] **Step 2: Escribir los cuatro archivos**

Cada archivo debe:
1. Llevar una cabecera explicando que fue **reconstruido** desde la base viva el 2026-08-05, y por qué (se aplicó por MCP sin dejar `.sql`).
2. Ser **idempotente** (`if not exists`, `create or replace`), porque el registro ya existe en el historial y el archivo no debe volver a aplicarse en producción.
3. Conservar **el nombre exacto con que la base lo conoce**. No renumerar: reescribir números ya registrados es lo que creó este desorden.

Plantilla de cabecera:

```sql
-- ai_providers_module
--
-- RECONSTRUIDO 2026-08-05 desde la definicion viva de la base.
-- Esta migracion se aplico en su dia con `apply_migration` del MCP y nunca
-- dejo un .sql en el repositorio, de modo que supabase/migrations/ no podia
-- reconstruir el esquema desde cero. El registro en
-- supabase_migrations.schema_migrations YA EXISTE: este archivo NO debe
-- reaplicarse en produccion, solo permitir levantar el esquema de cero.
-- Idempotente a proposito.
```

- [ ] **Step 3: Probar que los cuatro aplican sobre una base vacía**

Este es el único paso que demuestra que B-07 quedó cerrado.

```bash
ssh cibaocloud@supabase-01 'bash -s' <<'REMOTO'
set -euo pipefail
docker rm -f dermaland-schema-test >/dev/null 2>&1 || true
docker run -d --name dermaland-schema-test \
  -e POSTGRES_PASSWORD=probando \
  supabase/postgres:17.6.1.132 >/dev/null
for i in $(seq 1 30); do
  docker exec dermaland-schema-test pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done
echo "contenedor de prueba listo"
REMOTO
```

Luego, para cada `.sql` de `supabase/migrations/` en orden:

```bash
for f in supabase/migrations/*.sql; do
  echo "→ $f"
  ssh cibaocloud@supabase-01 \
    'docker exec -i dermaland-schema-test psql -U postgres -v ON_ERROR_STOP=1 -q' < "$f" \
    || { echo "FALLO en $f"; break; }
done
```

Expected: los 51 archivos aplican sin error.

Si alguno falla por un objeto que otra migración huérfana debía crear, **ese es exactamente el agujero que este task cierra** — arregla el archivo reconstruido y repite.

- [ ] **Step 4: Destruir el contenedor de prueba**

```bash
ssh cibaocloud@supabase-01 'docker rm -f dermaland-schema-test'
```

Expected: `dermaland-schema-test`. Verifica con `ssh cibaocloud@supabase-01 'docker ps -a --filter name=dermaland'` que no queda nada.

- [ ] **Step 5: Anotar el cierre en `docs/estado-actual.md`**

Añade al principio del documento una entrada fechada `## 2026-08-05 · B-07 — el repositorio vuelve a reconstruir el esquema`, explicando: cuántos archivos estaban sin registro, cuáles cuatro migraciones se recuperaron, y que la prueba de aplicación sobre base vacía pasó.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/ docs/estado-actual.md
git commit -m "fix(migraciones): recuperar las 4 migraciones que solo existian en la base

ai_providers_module, product_images_storage_bucket, ecf_events_fk_restrict
y 0042_payments_azul se aplicaron por MCP sin dejar .sql, asi que
supabase/migrations ya no reconstruia produccion desde cero. Reconstruidas
desde la definicion viva, idempotentes, conservando el nombre registrado.

Verificado aplicando los 51 archivos sobre una base 17.6 vacia.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# FASE B — B-01: el simulacro que nadie ha corrido

---

### Task 4: Guarda de destino

Se escribe **antes** que cualquier script con permiso de escritura. `supabase-01` aloja la producción de csl-app; un destino mal escrito ahí es pérdida de datos de otro cliente.

**Files:**
- Create: `scripts/backup/lib/assert-safe-target.mjs`
- Test: `apps/web/tests/unit/assert-safe-target.test.ts`

**Interfaces:**
- Produces: `assertSafeTarget({ tables, confirm, isProduction }): void` — lanza `Error` si el destino no es seguro. `tables` es `string[]` con los nombres de tabla presentes en el destino.

- [ ] **Step 1: Escribir la prueba que falla**

Crea `apps/web/tests/unit/assert-safe-target.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assertSafeTarget } from "../../../../scripts/backup/lib/assert-safe-target.mjs";

const ok = { tables: [], confirm: "si", isProduction: false };

describe("assertSafeTarget", () => {
  it("acepta un destino vacío con confirmación", () => {
    expect(() => assertSafeTarget(ok)).not.toThrow();
  });

  it("acepta un destino que ya contiene DermaLand", () => {
    expect(() =>
      assertSafeTarget({ ...ok, tables: ["businesses", "products", "sales"] }),
    ).not.toThrow();
  });

  it("rechaza el proyecto de producción", () => {
    expect(() => assertSafeTarget({ ...ok, isProduction: true })).toThrow(
      /produccion/i,
    );
  });

  it("rechaza un destino con tablas de csl-app", () => {
    expect(() =>
      assertSafeTarget({ ...ok, tables: ["csl_equipos", "csl_user_profiles"] }),
    ).toThrow(/csl_equipos/);
  });

  it("rechaza un destino con tablas de PalusaApp", () => {
    expect(() => assertSafeTarget({ ...ok, tables: ["palusa_tenants"] })).toThrow(
      /palusa_tenants/,
    );
  });

  it("rechaza tablas desconocidas: deny-by-default", () => {
    // No basta con no reconocer csl_/palusa_. Cualquier tabla ajena a la
    // huella de DermaLand aborta: el modo de falla que hay que evitar es
    // escribir sobre datos de alguien mas.
    expect(() => assertSafeTarget({ ...ok, tables: ["facturas_de_otro"] })).toThrow(
      /desconocid/i,
    );
  });

  it("rechaza si falta la confirmación explícita", () => {
    expect(() => assertSafeTarget({ ...ok, confirm: "" })).toThrow(
      /DERMALAND_DR_CONFIRM/,
    );
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `cd apps/web && pnpm vitest run tests/unit/assert-safe-target.test.ts`
Expected: FAIL — no existe `scripts/backup/lib/assert-safe-target.mjs`.

- [ ] **Step 3: Implementar la guarda**

Crea `scripts/backup/lib/assert-safe-target.mjs`:

```js
/**
 * Guarda de destino: deny-by-default.
 *
 * El dump de DermaLand puede generarse en modo destructivo (`--with-drop`), y
 * el servidor de recuperacion aloja ademas la produccion de csl-app y el stack
 * de PalusaApp. Un destino mal escrito no ensucia una base: la vacia. Es el
 * modo de falla del incidente de Neon, y esta guarda existe para que no se
 * repita.
 *
 * Ante cualquier duda, aborta. Un simulacro que no corre cuesta minutos; una
 * restauracion sobre datos ajenos cuesta el negocio de otro.
 */

/** Tablas que DermaLand reconoce como suyas (muestra, no lista completa). */
const HUELLA_DERMALAND = new Set([
  "businesses", "branches", "users", "clients", "products", "product_lots",
  "sales", "sale_items", "proformas", "inventory_movements", "audit_logs",
  "laboratories", "brands", "categories", "cash_sessions", "payments",
]);

/** Prefijos de otros inquilinos que conviven en supabase-01. */
const PREFIJOS_AJENOS = [/^csl_/, /^palusa/, /^maintenance_/, /^material_/];

export function assertSafeTarget({ tables, confirm, isProduction }) {
  if (isProduction) {
    throw new Error(
      "ABORTADO: el destino es el proyecto de PRODUCCION. El simulacro nunca escribe en produccion.",
    );
  }

  if (!confirm) {
    throw new Error(
      "ABORTADO: falta DERMALAND_DR_CONFIRM. Exportala para confirmar que el destino es desechable.",
    );
  }

  const lista = tables ?? [];
  const ajenas = lista.filter((t) => PREFIJOS_AJENOS.some((re) => re.test(t)));
  if (ajenas.length) {
    throw new Error(
      `ABORTADO: el destino contiene tablas de OTRO inquilino (${ajenas.join(", ")}). ` +
        "Escribir aqui destruiria datos ajenos.",
    );
  }

  const desconocidas = lista.filter((t) => !HUELLA_DERMALAND.has(t));
  if (desconocidas.length) {
    throw new Error(
      `ABORTADO: el destino contiene tablas desconocidas (${desconocidas.slice(0, 5).join(", ")}). ` +
        "La guarda es deny-by-default: si no reconoce el destino, no escribe.",
    );
  }
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `cd apps/web && pnpm vitest run tests/unit/assert-safe-target.test.ts`
Expected: PASS (7 pruebas).

- [ ] **Step 5: Hacer que `restore-from-json.mjs` use la guarda compartida**

La spec §3 exige que **todo** script con permiso de escritura invoque la guarda.
`scripts/backup/restore-from-json.mjs` ya existe y trae la suya propia: solo
comprueba que el destino no sea el proyecto de `.env.local`. Eso no detecta un
destino que contenga datos de csl-app o de PalusaApp.

En `scripts/backup/restore-from-json.mjs`:

1. Añade el import junto a los demás:

```js
import { assertSafeTarget } from "./lib/assert-safe-target.mjs";
```

2. Deja intacto el bloque `// Guarda: no restaurar sobre el proyecto de producción`
   (sigue siendo válido y barato) y añade **inmediatamente después** la
   comprobación del contenido del destino, antes de la primera escritura:

```js
// Guarda compartida: ademas de no ser produccion, el destino no puede contener
// datos de otro inquilino. Ver lib/assert-safe-target.mjs.
const target = createClient(TARGET_URL, TARGET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: tablasDestino } = await target
  .rpc("pg_tables_public")
  .then((r) => r, () => ({ data: null }));
assertSafeTarget({
  tables: Array.isArray(tablasDestino) ? tablasDestino.map((t) => t.tablename) : [],
  confirm: process.env.DERMALAND_DR_CONFIRM ?? "",
  isProduction: false,
});
```

Si el proyecto destino no expone la función `pg_tables_public`, la lista llega
vacía y la guarda exige de todos modos `DERMALAND_DR_CONFIRM`. Es el
comportamiento correcto: **ante desconocimiento, exigir confirmación explícita.**

3. Verifica que el script sigue negándose sobre producción:

Run: `TARGET_SUPABASE_URL=https://sntcvyozbhrgicwmtcoh.supabase.co TARGET_SERVICE_ROLE_KEY=x node scripts/backup/restore-from-json.mjs`
Expected: `ABORTADO: el destino coincide con el proyecto de producción.` — y ninguna escritura.

- [ ] **Step 6: Commit**

```bash
git add scripts/backup/lib/assert-safe-target.mjs apps/web/tests/unit/assert-safe-target.test.ts scripts/backup/restore-from-json.mjs
git commit -m "feat(respaldos): guarda de destino deny-by-default

supabase-01 aloja la produccion de csl-app y el stack de PalusaApp. Antes
de que exista un script que escriba, existe la guarda que le impide escribir
en el lugar equivocado. Es el modo de falla del incidente de Neon.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: El dump deja de ser destructivo por defecto

Hoy `pg-dump-backup.mjs` genera el dump con `--clean --if-exists`: el archivo **empieza con `DROP`**.

**Files:**
- Create: `scripts/backup/lib/pg-dump-args.mjs`
- Modify: `scripts/backup/pg-dump-backup.mjs`
- Test: `apps/web/tests/unit/pg-dump-args.test.ts`

**Interfaces:**
- Produces: `buildPgDumpArgs({ outFile, dbUrl, withDrop }): string[]`

- [ ] **Step 1: Escribir la prueba que falla**

Crea `apps/web/tests/unit/pg-dump-args.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPgDumpArgs } from "../../../../scripts/backup/lib/pg-dump-args.mjs";

const base = { outFile: "/tmp/x.sql.gz", dbUrl: "postgresql://u:p@h/db" };

describe("buildPgDumpArgs", () => {
  it("por defecto NO incluye --clean ni --if-exists", () => {
    const args = buildPgDumpArgs({ ...base, withDrop: false });
    expect(args).not.toContain("--clean");
    expect(args).not.toContain("--if-exists");
  });

  it("incluye --clean --if-exists solo con withDrop", () => {
    const args = buildPgDumpArgs({ ...base, withDrop: true });
    expect(args).toContain("--clean");
    expect(args).toContain("--if-exists");
  });

  it("mantiene siempre las opciones de portabilidad y compresión", () => {
    const args = buildPgDumpArgs({ ...base, withDrop: false });
    expect(args).toContain("--no-owner");
    expect(args).toContain("--no-privileges");
    expect(args).toContain("-Z");
    expect(args).toContain("9");
  });

  it("pone la URL al final y el archivo tras -f", () => {
    const args = buildPgDumpArgs({ ...base, withDrop: false });
    expect(args[args.length - 1]).toBe(base.dbUrl);
    expect(args[args.indexOf("-f") + 1]).toBe(base.outFile);
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `cd apps/web && pnpm vitest run tests/unit/pg-dump-args.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar el constructor de argumentos**

Crea `scripts/backup/lib/pg-dump-args.mjs`:

```js
/**
 * Argumentos de pg_dump.
 *
 * `--clean --if-exists` hace que el archivo EMPIECE con sentencias DROP.
 * Apuntado a la base equivocada, no la ensucia: la vacia. Por eso deja de ser
 * el comportamiento por defecto y pasa a exigir `--with-drop` explicito, para
 * restaurar sobre una base que YA contiene una version previa de DermaLand.
 */
export function buildPgDumpArgs({ outFile, dbUrl, withDrop }) {
  const args = ["--no-owner", "--no-privileges"];
  if (withDrop) args.push("--clean", "--if-exists");
  args.push("-Z", "9", "-f", outFile, dbUrl);
  return args;
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `cd apps/web && pnpm vitest run tests/unit/pg-dump-args.test.ts`
Expected: PASS (4 pruebas).

- [ ] **Step 5: Cablear el script existente**

En `scripts/backup/pg-dump-backup.mjs`:

1. Añade el import al principio, junto a los demás:

```js
import { buildPgDumpArgs } from "./lib/pg-dump-args.mjs";
```

2. Sustituye el bloque de `spawnSync` (líneas ~48-53, el que hoy lleva el array literal con `"--clean", "--if-exists"`) por:

```js
// Destructivo solo si se pide explicitamente. Ver lib/pg-dump-args.mjs.
const withDrop = process.argv.includes("--with-drop");
if (withDrop) {
  console.warn(
    "⚠️  --with-drop: el dump EMPEZARA con sentencias DROP. Solo para restaurar\n" +
      "    sobre una base que ya contiene una version previa de DermaLand.",
  );
}

const res = spawnSync("pg_dump", buildPgDumpArgs({ outFile, dbUrl: DB_URL, withDrop }), {
  stdio: ["ignore", "inherit", "inherit"],
});
```

3. Actualiza el comentario de cabecera del archivo para documentar `--with-drop`.

- [ ] **Step 6: Verificar que no se rompió nada**

Run: `cd apps/web && pnpm vitest run && pnpm typecheck`
Expected: PASS — 446 pruebas previas + las nuevas de este plan. Typecheck limpio.

- [ ] **Step 7: Commit**

```bash
git add scripts/backup/lib/pg-dump-args.mjs scripts/backup/pg-dump-backup.mjs apps/web/tests/unit/pg-dump-args.test.ts
git commit -m "fix(respaldos): el dump deja de ser destructivo por defecto

Se generaba con --clean --if-exists, asi que el archivo empezaba con DROP.
Apuntado a la base equivocada no la ensucia: la vacia. Ahora hace falta
--with-drop explicito.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Comparador de huellas de esquema

El paso que convierte el simulacro en prueba. Un respaldo puede restaurar sin error y aun así estar incompleto.

**Files:**
- Create: `scripts/backup/lib/schema-fingerprint.mjs`
- Test: `apps/web/tests/unit/schema-fingerprint.test.ts`

**Interfaces:**
- Produces:
  - `FINGERPRINT_SQL: string` — una consulta que devuelve la huella completa como una sola columna JSON.
  - `diffFingerprints(prod, copia): { ok: boolean, problemas: string[] }`

- [ ] **Step 1: Escribir la prueba que falla**

Crea `apps/web/tests/unit/schema-fingerprint.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  FINGERPRINT_SQL,
  diffFingerprints,
} from "../../../../scripts/backup/lib/schema-fingerprint.mjs";

const huella = () => ({
  filas: { products: 627, sales: 120 },
  funciones: ["emit_sale_atomic()", "transfer_stock_atomic(uuid)"],
  politicas: { products: 4, sales: 3 },
  indices: ["idx_products_barcode"],
});

describe("FINGERPRINT_SQL", () => {
  it("consulta las cuatro dimensiones que exige el diseño", () => {
    expect(FINGERPRINT_SQL).toContain("pg_policies");
    expect(FINGERPRINT_SQL).toContain("pg_indexes");
    expect(FINGERPRINT_SQL).toContain("pg_proc");
    expect(FINGERPRINT_SQL).toContain("query_to_xml");
  });
});

describe("diffFingerprints", () => {
  it("aprueba cuando la copia es idéntica", () => {
    expect(diffFingerprints(huella(), huella())).toEqual({ ok: true, problemas: [] });
  });

  it("falla si una tabla llega con menos filas", () => {
    const copia = huella();
    copia.filas.products = 626;
    const r = diffFingerprints(huella(), copia);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toMatch(/products.*627.*626/);
  });

  it("falla si falta una tabla entera", () => {
    const copia = huella();
    delete copia.filas.sales;
    expect(diffFingerprints(huella(), copia).ok).toBe(false);
  });

  it("falla si falta una función", () => {
    const copia = huella();
    copia.funciones = ["emit_sale_atomic()"];
    const r = diffFingerprints(huella(), copia);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toMatch(/transfer_stock_atomic/);
  });

  it("falla si la copia perdió políticas RLS", () => {
    // Una copia sin RLS es una fuga de datos esperando ocurrir.
    const copia = huella();
    copia.politicas.products = 0;
    expect(diffFingerprints(huella(), copia).ok).toBe(false);
  });

  it("falla si falta un índice", () => {
    const copia = huella();
    copia.indices = [];
    expect(diffFingerprints(huella(), copia).ok).toBe(false);
  });

  it("no se queja de objetos EXTRA en la copia", () => {
    // El destino puede traer objetos propios de la imagen base. Lo que
    // importa es que no FALTE nada de produccion.
    const copia = huella();
    copia.indices.push("idx_extra_de_la_imagen");
    expect(diffFingerprints(huella(), copia).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `cd apps/web && pnpm vitest run tests/unit/schema-fingerprint.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar el comparador**

Crea `scripts/backup/lib/schema-fingerprint.mjs`:

```js
/**
 * Huella del esquema: lo que hay que comparar para que un simulacro sea una
 * PRUEBA y no un teatro. Un dump puede restaurar sin un solo error y aun asi
 * llegar incompleto.
 *
 * Cuatro dimensiones:
 *   filas     — conteo EXACTO por tabla (no la estimacion de pg_stat_user_tables)
 *   funciones — nombre + firma
 *   politicas — conteo de RLS por tabla; una copia sin RLS es una fuga
 *   indices   — presencia por nombre
 */

/** Devuelve la huella completa como un unico valor JSON en la columna `huella`. */
export const FINGERPRINT_SQL = `
select json_build_object(
  'filas', (
    select coalesce(json_object_agg(relname, filas), '{}'::json) from (
      select c.relname,
             (xpath('/row/cnt/text()', query_to_xml(
                format('select count(*) as cnt from public.%I', c.relname),
                false, true, '')))[1]::text::bigint as filas
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    ) t
  ),
  'funciones', (
    select coalesce(json_agg(f order by f), '[]'::json) from (
      select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
    ) x
  ),
  'politicas', (
    select coalesce(json_object_agg(tablename, n), '{}'::json)
    from (select tablename, count(*) as n from pg_policies
          where schemaname = 'public' group by tablename) p
  ),
  'indices', (
    select coalesce(json_agg(indexname order by indexname), '[]'::json)
    from pg_indexes where schemaname = 'public'
  )
) as huella;
`;

/**
 * Compara la copia contra produccion. Solo importa lo que FALTA: el destino
 * puede traer objetos propios de la imagen base sin que eso invalide nada.
 */
export function diffFingerprints(prod, copia) {
  const problemas = [];

  for (const [tabla, esperadas] of Object.entries(prod.filas ?? {})) {
    const hay = copia.filas?.[tabla];
    if (hay === undefined) {
      problemas.push(`Tabla ausente en la copia: ${tabla} (produccion tiene ${esperadas} filas)`);
    } else if (Number(hay) !== Number(esperadas)) {
      problemas.push(`Filas distintas en ${tabla}: produccion ${esperadas}, copia ${hay}`);
    }
  }

  const enCopia = new Set(copia.funciones ?? []);
  for (const f of prod.funciones ?? []) {
    if (!enCopia.has(f)) problemas.push(`Funcion ausente en la copia: ${f}`);
  }

  for (const [tabla, esperadas] of Object.entries(prod.politicas ?? {})) {
    const hay = copia.politicas?.[tabla] ?? 0;
    if (Number(hay) < Number(esperadas)) {
      problemas.push(
        `Politicas RLS incompletas en ${tabla}: produccion ${esperadas}, copia ${hay}`,
      );
    }
  }

  const indicesCopia = new Set(copia.indices ?? []);
  for (const i of prod.indices ?? []) {
    if (!indicesCopia.has(i)) problemas.push(`Indice ausente en la copia: ${i}`);
  }

  return { ok: problemas.length === 0, problemas };
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `cd apps/web && pnpm vitest run tests/unit/schema-fingerprint.test.ts`
Expected: PASS (8 pruebas).

- [ ] **Step 5: Commit**

```bash
git add scripts/backup/lib/schema-fingerprint.mjs apps/web/tests/unit/schema-fingerprint.test.ts
git commit -m "feat(respaldos): comparador de huella de esquema

Filas exactas por tabla, funciones con firma, politicas RLS e indices. Es
el paso que convierte el simulacro en prueba: un dump puede restaurar sin
un solo error y aun asi llegar incompleto.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: El simulacro de recuperación

Un comando, seis pasos, sin dejar rastro.

**Files:**
- Create: `scripts/backup/dr-drill.mjs`
- Create: `docs/dr-drill-<AAAAMMDD>.md` (lo genera el script)
- Modify: `docs/backup-and-restore.md`

**Interfaces:**
- Consumes: `assertSafeTarget` (Task 4), `FINGERPRINT_SQL` y `diffFingerprints` (Task 6).
- Produces: ejecutable por `node scripts/backup/dr-drill.mjs`. Sale con código 0 solo si el simulacro **PASA**.

- [ ] **Step 1: Implementar el orquestador**

Crea `scripts/backup/dr-drill.mjs`:

```js
#!/usr/bin/env node
/**
 * Simulacro de recuperacion ante desastre (B-01).
 *
 * Un respaldo que nunca se ha restaurado es una hipotesis, no un respaldo.
 * Este script convierte la hipotesis en hecho, y falla ruidosamente si no lo es.
 *
 * Corre ENTERO dentro de supabase-01: la Mac no tiene psql ni pg_dump, y la
 * imagen del arenero trae pg_dump 17.6, la version exacta de produccion. El
 * respaldo nunca pasa por el portatil.
 *
 * ATENCION: supabase-01 aloja tambien la produccion de csl-app (contenedor
 * `supabase-db`) y PalusaApp (`palusa-*`). Este script NO los toca jamas.
 *
 * Uso:
 *   DERMALAND_DR_CONFIRM=si node scripts/backup/dr-drill.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeTarget } from "./lib/assert-safe-target.mjs";
import { FINGERPRINT_SQL, diffFingerprints } from "./lib/schema-fingerprint.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOST = process.env.DR_HOST ?? "cibaocloud@supabase-01";
const CONTENEDOR = "dermaland-dr-db";
const IMAGEN = "supabase/postgres:17.6.1.132";
const CONFIRM = process.env.DERMALAND_DR_CONFIRM ?? "";

/** Nunca aceptar como destino un contenedor que no sea el nuestro. */
if (CONTENEDOR !== "dermaland-dr-db") {
  console.error("ABORTADO: el contenedor destino fue alterado.");
  process.exit(1);
}

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

/** Corre un script bash en el servidor. El cuerpo viaja por stdin, no por argv:
 *  asi ningun secreto aparece en `ps` del servidor. */
function remoto(script, { input } = {}) {
  const res = spawnSync("ssh", [HOST, "bash", "-s"], {
    input: input ?? script,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`Fallo remoto (codigo ${res.status}):\n${res.stderr ?? ""}`);
  }
  return res.stdout;
}

/** psql dentro del arenero. La consulta va por stdin. */
function psqlDr(sql) {
  const res = spawnSync(
    "ssh",
    [HOST, `docker exec -i ${CONTENEDOR} psql -U postgres -tA -v ON_ERROR_STOP=1`],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (res.status !== 0) throw new Error(`psql (arenero) fallo:\n${res.stderr ?? ""}`);
  return res.stdout.trim();
}

const paso = (n, t) => console.log(`\n[${n}/6] ${t}`);
let creado = false;

/** Paso 6 corre siempre, incluso si algo revento antes. */
function destruir() {
  if (!creado) return;
  try {
    remoto(`docker rm -f ${CONTENEDOR} >/dev/null 2>&1 || true
docker volume rm ${CONTENEDOR}-data >/dev/null 2>&1 || true
echo destruido`);
    console.log("Arenero destruido.");
  } catch (e) {
    console.error("AVISO: no se pudo destruir el arenero:", e.message);
    console.error(`Hazlo a mano: ssh ${HOST} 'docker rm -f ${CONTENEDOR}'`);
  }
}

try {
  // ── 1. Levantar el arenero ────────────────────────────────────────────────
  paso(1, "Levantando el arenero aislado en el servidor…");
  remoto(`set -euo pipefail
# Salvaguarda: jamas tocar los contenedores de otros inquilinos.
for prohibido in supabase-db palusa-db; do
  if [ "${CONTENEDOR}" = "$prohibido" ]; then echo "ABORTADO: contenedor prohibido"; exit 1; fi
done
docker rm -f ${CONTENEDOR} >/dev/null 2>&1 || true
docker volume rm ${CONTENEDOR}-data >/dev/null 2>&1 || true
docker volume create ${CONTENEDOR}-data >/dev/null
# Sin -p: el arenero NO expone puerto. Se opera solo por docker exec.
docker run -d --name ${CONTENEDOR} \\
  -e POSTGRES_PASSWORD=arenero-efimero \\
  -v ${CONTENEDOR}-data:/var/lib/postgresql/data \\
  ${IMAGEN} >/dev/null
for i in $(seq 1 45); do
  docker exec ${CONTENEDOR} pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done
docker exec ${CONTENEDOR} pg_isready -U postgres`);
  creado = true;
  console.log("Arenero listo (sin puerto expuesto).");

  // ── 2. Comprobar que el destino es seguro ANTES de escribir nada ──────────
  paso(2, "Comprobando que el destino es seguro…");
  const tablasDestino = psqlDr(
    `select string_agg(tablename, ',') from pg_tables where schemaname = 'public';`,
  );
  assertSafeTarget({
    tables: tablasDestino ? tablasDestino.split(",").filter(Boolean) : [],
    confirm: CONFIRM,
    isProduction: false,
  });
  console.log("Destino verificado: vacio y aislado.");

  // ── 3. Respaldo fresco de produccion (SOLO LECTURA) ───────────────────────
  paso(3, "Generando respaldo fresco de produccion (solo lectura)…");
  remoto(null, {
    input: `set -euo pipefail
umask 077
ENVF=$(mktemp)
trap 'rm -f "$ENVF"' EXIT
cat > "$ENVF" <<'ENVEOF'
PGURL=${dbUrl()}
ENVEOF
# pg_dump corre DENTRO de la imagen del arenero: version 17.6, la misma que
# produccion. Sin --clean: el dump no debe empezar con DROP.
docker run --rm --env-file "$ENVF" ${IMAGEN} \\
  sh -c 'pg_dump --no-owner --no-privileges "$PGURL"' > /tmp/dermaland-dr.sql
wc -l < /tmp/dermaland-dr.sql`,
  });
  console.log("Respaldo generado en el servidor.");

  // ── 4. Restaurar en el arenero ────────────────────────────────────────────
  paso(4, "Restaurando el respaldo en el arenero…");
  const errores = remoto(`set -uo pipefail
docker exec -i ${CONTENEDOR} psql -U postgres -q < /tmp/dermaland-dr.sql 2>&1 |
  grep -i '^ERROR' | sort | uniq -c | head -40 || true`);
  if (errores.trim()) {
    console.warn("Errores durante la restauracion (se evaluan en el paso 5):");
    console.warn(errores.trim());
  }

  // ── 5. Comparar produccion contra la copia ────────────────────────────────
  paso(5, "Comparando produccion contra la copia…");
  const huellaProdRaw = remoto(null, {
    input: `set -euo pipefail
umask 077
ENVF=$(mktemp); trap 'rm -f "$ENVF"' EXIT
cat > "$ENVF" <<'ENVEOF'
PGURL=${dbUrl()}
ENVEOF
docker run --rm -i --env-file "$ENVF" ${IMAGEN} \\
  sh -c 'psql -tA -v ON_ERROR_STOP=1 "$PGURL"' <<'SQLEOF'
${FINGERPRINT_SQL}
SQLEOF`,
  });
  const huellaProd = JSON.parse(huellaProdRaw.trim());
  const huellaCopia = JSON.parse(psqlDr(FINGERPRINT_SQL));

  const { ok, problemas } = diffFingerprints(huellaProd, huellaCopia);

  const hoy = new Date().toISOString().slice(0, 10);
  const salida = path.join(root, "docs", `dr-drill-${hoy.replace(/-/g, "")}.md`);
  const tablasProd = Object.keys(huellaProd.filas ?? {}).length;
  const filasProd = Object.values(huellaProd.filas ?? {}).reduce((a, b) => a + Number(b), 0);

  writeFileSync(
    salida,
    [
      `# Simulacro de recuperacion — ${hoy}`,
      "",
      `**Veredicto: ${ok ? "PASA" : "FALLA"}**`,
      "",
      `- Destino: contenedor efimero \`${CONTENEDOR}\` (${IMAGEN}) en \`${HOST}\`, sin puerto expuesto.`,
      `- Tablas comparadas: **${tablasProd}** · filas en produccion: **${filasProd}**`,
      `- Funciones: ${(huellaProd.funciones ?? []).length} · Indices: ${(huellaProd.indices ?? []).length}`,
      `- Tablas con RLS: ${Object.keys(huellaProd.politicas ?? {}).length}`,
      "",
      ok
        ? "Las cuatro dimensiones cuadran al 100 %. El respaldo es restaurable."
        : "## Diferencias encontradas\n\n" + problemas.map((p) => `- ${p}`).join("\n"),
      "",
      "## Lo que este simulacro NO cubre",
      "",
      "- **Roles del cluster.** `pg_dump` no exporta objetos globales; los roles",
      "  vienen de la imagen `supabase/postgres`, no del respaldo.",
      "- **Archivos de Storage.** Las imagenes de producto viven fuera de la base",
      "  y necesitan su propio respaldo.",
      "",
      "Decirlo importa: un reporte que calla esto miente por omision.",
      "",
    ].join("\n"),
    "utf8",
  );

  console.log(`\nReporte → ${salida}`);
  if (!ok) {
    console.error(`\n❌ SIMULACRO FALLIDO — ${problemas.length} diferencias:`);
    problemas.slice(0, 20).forEach((p) => console.error(`   · ${p}`));
    process.exitCode = 1;
  } else {
    console.log("\n✅ SIMULACRO SUPERADO: el respaldo restaura completo.");
  }
} catch (e) {
  console.error("\n❌ El simulacro se detuvo:", e.message);
  process.exitCode = 1;
} finally {
  paso(6, "Destruyendo el arenero…");
  destruir();
}
```

- [ ] **Step 2: Verificar que la guarda funciona antes de correr el simulacro**

Antes de la corrida real, comprueba que el script **se niega** sin confirmación:

Run: `node scripts/backup/dr-drill.mjs`
Expected: se detiene en el paso 2 con `ABORTADO: falta DERMALAND_DR_CONFIRM`, y el paso 6 destruye el arenero igualmente.

Verifica que no quedó nada: `ssh cibaocloud@supabase-01 'docker ps -a --filter name=dermaland'` → vacío.

- [ ] **Step 3: Correr el simulacro completo**

Run: `DERMALAND_DR_CONFIRM=si node scripts/backup/dr-drill.mjs`
Expected: los seis pasos, y `✅ SIMULACRO SUPERADO`.

**Si falla,** no lo maquilles: el reporte nombra qué falta. Diferencias esperables la primera vez y qué significan:
- *Funciones ausentes* → el dump no trae algo que produccion sí tiene. Investiga antes de seguir.
- *Políticas RLS incompletas* → **grave**, una copia sin RLS es una fuga. Detente y repórtalo.
- *Filas distintas* → probable escritura en producción durante el dump. Repite y compara.

- [ ] **Step 4: Confirmar que el servidor quedó limpio**

Run: `ssh cibaocloud@supabase-01 'docker ps -a --filter name=dermaland; docker volume ls | grep dermaland; echo "--- intactos ---"; docker ps --format "{{.Names}}" | grep -E "^(supabase|palusa)" | head'`
Expected: sin rastro de `dermaland-*`, y los contenedores de csl-app y PalusaApp **intactos y corriendo**.

- [ ] **Step 5: Documentar el procedimiento**

En `docs/backup-and-restore.md`, añade una sección `## Simulacro de recuperación (B-01)` con: el comando exacto, dónde corre, qué compara, qué NO cubre, y con qué frecuencia repetirlo (propuesta: antes de cada cambio grande de esquema y, como mínimo, trimestral).

- [ ] **Step 6: Commit**

```bash
git add scripts/backup/dr-drill.mjs docs/dr-drill-*.md docs/backup-and-restore.md
git commit -m "feat(respaldos): simulacro de recuperacion de un solo comando (B-01)

Un respaldo que nunca se restauro es una hipotesis. El simulacro levanta un
arenero efimero y aislado en supabase-01, restaura, compara las cuatro
dimensiones contra produccion y se destruye. Falla ruidosamente si algo no
cuadra.

Corre entero en el servidor: la Mac no tiene psql/pg_dump y la imagen trae
pg_dump 17.6, la version exacta de produccion.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# FASE C — B-04: 2FA que de verdad obliga

> **Orden obligatorio (spec §6.2):** el enforcement de Task 8 **no se despliega** hasta que un admin tenga factor verificado y el break-glass de Task 9 esté probado. Son 2 admins y ningún tercero: activarlo con `auth.mfa_factors` vacía los deja fuera a los dos a la vez y sin red.

---

### Task 8: Puerta de 2FA obligatoria para admin

**Files:**
- Create: `apps/web/src/lib/auth/mfa-gate.ts`
- Create: `apps/web/src/lib/auth/mfa-gate.test.ts`
- Modify: `apps/web/src/middleware.ts` (bloque "B-04: enforcement 2FA", ~líneas 194-210)

**Interfaces:**
- Produces: `mfaGateDecision({ role, currentLevel, nextLevel, chequeoFallo }): 'permitir' | 'enrolar' | 'desafiar'`
  - `'enrolar'` → redirigir a `/perfil/seguridad`
  - `'desafiar'` → redirigir a `/login/mfa`

- [ ] **Step 1: Escribir la prueba que falla**

Crea `apps/web/src/lib/auth/mfa-gate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mfaGateDecision } from "./mfa-gate";

const admin = { role: "admin" as const };
const cajero = { role: "cashier" as const };

describe("mfaGateDecision — admin", () => {
  it("obliga a enrolarse si no tiene ningún factor", () => {
    // nextLevel 'aal1' significa que no hay factor verificado.
    expect(
      mfaGateDecision({ ...admin, currentLevel: "aal1", nextLevel: "aal1", chequeoFallo: false }),
    ).toBe("enrolar");
  });

  it("pide el desafío si tiene factor pero la sesión sigue en aal1", () => {
    expect(
      mfaGateDecision({ ...admin, currentLevel: "aal1", nextLevel: "aal2", chequeoFallo: false }),
    ).toBe("desafiar");
  });

  it("deja pasar cuando ya completó el segundo factor", () => {
    expect(
      mfaGateDecision({ ...admin, currentLevel: "aal2", nextLevel: "aal2", chequeoFallo: false }),
    ).toBe("permitir");
  });

  it("niega el paso si el chequeo falla: fail-closed para admin", () => {
    expect(
      mfaGateDecision({ ...admin, currentLevel: null, nextLevel: null, chequeoFallo: true }),
    ).toBe("enrolar");
  });
});

describe("mfaGateDecision — roles no admin", () => {
  it("no obliga a un cajero sin factor", () => {
    expect(
      mfaGateDecision({ ...cajero, currentLevel: "aal1", nextLevel: "aal1", chequeoFallo: false }),
    ).toBe("permitir");
  });

  it("sigue pidiendo el desafío a un cajero que SÍ activó 2FA", () => {
    // 2FA es opcional para el, pero si lo activo hay que exigirlo.
    expect(
      mfaGateDecision({ ...cajero, currentLevel: "aal1", nextLevel: "aal2", chequeoFallo: false }),
    ).toBe("desafiar");
  });

  it("mantiene el fail-open para no admin: un fallo del chequeo no los bloquea", () => {
    expect(
      mfaGateDecision({ ...cajero, currentLevel: null, nextLevel: null, chequeoFallo: true }),
    ).toBe("permitir");
  });

  it("trata un rol ausente como no admin", () => {
    expect(
      mfaGateDecision({ role: undefined, currentLevel: "aal1", nextLevel: "aal1", chequeoFallo: false }),
    ).toBe("permitir");
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `cd apps/web && pnpm vitest run src/lib/auth/mfa-gate.test.ts`
Expected: FAIL — no existe `mfa-gate.ts`.

- [ ] **Step 3: Implementar la decisión**

Crea `apps/web/src/lib/auth/mfa-gate.ts`:

```ts
/**
 * Puerta de 2FA (B-04).
 *
 * El middleware confundia dos cosas distintas:
 *   - TENER un factor verificado  → `nextLevel === "aal2"`
 *   - HABERLO USADO en esta sesion → `currentLevel === "aal2"`
 *
 * Solo exigia la segunda, de modo que un admin que nunca escaneo el QR no veia
 * jamas un prompt: 2FA existia sin proteger a nadie. Para admin ahora se
 * exigen las dos.
 *
 * El fail-open se conserva para roles no admin (un fallo del chequeo no debe
 * dejar a un cajero fuera del POS a mitad de un turno) y se retira para admin,
 * donde la cuenta comprometida cuesta mas que el inconveniente.
 */

export type NivelAal = "aal1" | "aal2" | null | undefined;
export type DecisionMfa = "permitir" | "enrolar" | "desafiar";

/** Roles a los que 2FA les es obligatorio. */
const ROLES_OBLIGADOS: ReadonlySet<string> = new Set(["admin"]);

export function mfaGateDecision(params: {
  role: string | null | undefined;
  currentLevel: NivelAal;
  nextLevel: NivelAal;
  chequeoFallo: boolean;
}): DecisionMfa {
  const { role, currentLevel, nextLevel, chequeoFallo } = params;
  const obligado = typeof role === "string" && ROLES_OBLIGADOS.has(role);

  if (chequeoFallo) {
    // Fail-closed solo para quien esta obligado.
    return obligado ? "enrolar" : "permitir";
  }

  const tieneFactor = nextLevel === "aal2";
  const yaLoUso = currentLevel === "aal2";

  if (tieneFactor && !yaLoUso) return "desafiar";
  if (!tieneFactor && obligado) return "enrolar";
  return "permitir";
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `cd apps/web && pnpm vitest run src/lib/auth/mfa-gate.test.ts`
Expected: PASS (8 pruebas).

- [ ] **Step 5: Cablear el middleware**

En `apps/web/src/middleware.ts`:

1. Añade `/perfil/seguridad` a las rutas siempre alcanzables. **Sin esto el enforcement se muerde la cola:** se redirige al admin a enrolarse y la propia redirección lo vuelve a redirigir. Localiza `PUBLIC_PATHS` y añade **debajo del array** (no dentro: `/perfil/seguridad` exige sesión, solo está exenta de la puerta 2FA):

```ts
/**
 * Rutas exentas de la puerta 2FA. NO son publicas: exigen sesion. Son el
 * destino al que la propia puerta redirige, asi que si la puerta las vigilara
 * se produciria un bucle de redirecciones.
 */
const MFA_EXEMPT_PATHS: ReadonlyArray<string> = ["/perfil/seguridad", "/login/mfa"];
```

2. Añade el import junto a los demás:

```ts
import { mfaGateDecision } from "@/lib/auth/mfa-gate";
```

3. Sustituye el bloque `try { ... } catch { ... }` de 2FA (el comentario que empieza `// B-04: enforcement 2FA`) por:

```ts
  // B-04: enforcement 2FA. Para admin se exige TENER factor y HABERLO usado;
  // para los demas, 2FA sigue siendo opcional pero se respeta si lo activaron.
  // Ver src/lib/auth/mfa-gate.ts y la spec 2026-08-05 §6.
  if (!MFA_EXEMPT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    let currentLevel = null;
    let nextLevel = null;
    let chequeoFallo = false;
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      currentLevel = aal?.currentLevel ?? null;
      nextLevel = aal?.nextLevel ?? null;
      if (!aal) chequeoFallo = true;
    } catch {
      chequeoFallo = true;
    }

    const decision = mfaGateDecision({
      role: typeof user.app_metadata?.role === "string" ? user.app_metadata.role : undefined,
      currentLevel,
      nextLevel,
      chequeoFallo,
    });

    if (decision !== "permitir") {
      const url = request.nextUrl.clone();
      url.pathname = decision === "enrolar" ? "/perfil/seguridad" : "/login/mfa";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }
```

- [ ] **Step 6: Verificar typecheck y la suite completa**

Run: `cd apps/web && pnpm typecheck && pnpm vitest run`
Expected: typecheck limpio; toda la suite en verde.

- [ ] **Step 7: Commit — SIN desplegar**

```bash
git add apps/web/src/lib/auth/mfa-gate.ts apps/web/src/lib/auth/mfa-gate.test.ts apps/web/src/middleware.ts
git commit -m "feat(seguridad): 2FA obligatorio para admin (B-04)

El middleware exigia el segundo factor solo a quien YA lo habia activado, asi
que un admin que nunca escaneo el QR no veia un solo prompt: 2FA existia sin
proteger a nadie. Ahora para admin se exige tener factor Y haberlo usado, y
el fail-open deja de aplicarles.

NO DESPLEGAR hasta que un admin este enrolado y el break-glass este probado:
son 2 admins y ningun tercero.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**No despliegues todavía.** El orden de la spec §6.2 es obligatorio.

---

### Task 9: Break-glass de 2FA y etiqueta de auditoría

La red de seguridad sin la cual Task 8 no puede activarse.

**Files:**
- Create: `scripts/mfa-break-glass.mjs`
- Modify: `apps/web/src/features/admin/audit-labels.ts`
- Modify: `docs/security.md`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: ejecutable por `node scripts/mfa-break-glass.mjs <correo>`.

- [ ] **Step 1: Añadir la etiqueta legible de auditoría**

En `apps/web/src/features/admin/audit-labels.ts`, dentro de `ACTION_LABELS` y respetando el orden alfabético (va justo antes de `"users.created"`):

```ts
  "user.mfa_break_glass": "Segundo factor retirado (emergencia)",
```

Esto respeta la regla de que la interfaz nunca muestra claves crudas.

- [ ] **Step 2: Implementar el break-glass**

Crea `scripts/mfa-break-glass.mjs`:

```js
#!/usr/bin/env node
/**
 * Break-glass de 2FA: retira el segundo factor de UN usuario nombrado.
 *
 * Existe porque DermaLand tiene 2 admins y ningun tercero: si ambos pierden el
 * telefono, nadie entra. Deliberadamente NO se implementaron codigos de
 * recuperacion — serian criptografia casera con almacenamiento propio, mas
 * superficie de ataque que la que eliminan.
 *
 * Corre FUERA de la app, con la service_role que solo tiene el duenio, y deja
 * rastro en audit_logs: la operacion es visible, no silenciosa.
 *
 * Uso:  node scripts/mfa-break-glass.mjs admin@dermaland.do
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

const correo = process.argv[2];
if (!correo) {
  console.error("Uso: node scripts/mfa-break-glass.mjs <correo>");
  console.error("Retira el segundo factor de UN usuario. Nunca de varios.");
  process.exit(1);
}

function env(clave) {
  if (process.env[clave]) return process.env[clave];
  const txt = readFileSync(path.join(root, "apps/web/.env.local"), "utf8");
  const m = txt.match(new RegExp(`^${clave}=(.*)$`, "m"));
  if (!m) {
    console.error(`ERROR: falta ${clave} (entorno o apps/web/.env.local).`);
    process.exit(1);
  }
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const admin = createClient(
  env("NEXT_PUBLIC_SUPABASE_URL"),
  env("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: lista, error: errLista } = await admin.auth.admin.listUsers({ perPage: 200 });
if (errLista) {
  console.error("No se pudo listar usuarios:", errLista.message);
  process.exit(1);
}

const usuario = lista.users.find((u) => u.email?.toLowerCase() === correo.toLowerCase());
if (!usuario) {
  console.error(`No existe ningun usuario con el correo ${correo}.`);
  process.exit(1);
}

const { data: factores, error: errFac } = await admin.auth.admin.mfa.listFactors({
  userId: usuario.id,
});
if (errFac) {
  console.error("No se pudieron leer los factores:", errFac.message);
  process.exit(1);
}
if (!factores.factors.length) {
  console.log(`${correo} no tiene ningun segundo factor. Nada que retirar.`);
  process.exit(0);
}

console.log(`\nUsuario:  ${correo}`);
console.log(`Rol:      ${usuario.app_metadata?.role ?? "(sin rol)"}`);
console.log(`Factores: ${factores.factors.map((f) => `${f.friendly_name ?? f.factor_type} (${f.status})`).join(", ")}`);
console.log("\nRetirarlos le permitira entrar SOLO con contrasenia hasta que vuelva a enrolarse.");

const rl = createInterface({ input: process.stdin, output: process.stdout });
const respuesta = await rl.question(`\nEscribe el correo completo para confirmar: `);
rl.close();

if (respuesta.trim().toLowerCase() !== correo.toLowerCase()) {
  console.error("Confirmacion no coincide. Cancelado. No se cambio nada.");
  process.exit(1);
}

for (const f of factores.factors) {
  const { error } = await admin.auth.admin.mfa.deleteFactor({ userId: usuario.id, id: f.id });
  if (error) {
    console.error(`Fallo al retirar el factor ${f.id}:`, error.message);
    process.exit(1);
  }
  console.log(`Factor retirado: ${f.id}`);
}

// El rastro importa tanto como la operacion.
const { error: errLog } = await admin.from("audit_logs").insert({
  business_id: usuario.app_metadata?.business_id,
  user_id: usuario.id,
  user_name: correo,
  action: "user.mfa_break_glass",
  entity: "user",
  entity_id: usuario.id,
  metadata: {
    factores_retirados: factores.factors.length,
    motivo: "break-glass ejecutado desde la linea de comandos",
  },
});
if (errLog) {
  console.error("AVISO: el factor se retiro pero NO se pudo auditar:", errLog.message);
  console.error("Registralo a mano: la operacion no puede quedar invisible.");
  process.exitCode = 1;
} else {
  console.log("Registrado en auditoria.");
}

console.log(`\n✅ ${correo} puede entrar con contrasenia. Debe volver a enrolar 2FA en /perfil/seguridad.`);
```

- [ ] **Step 3: Verificar que el script se niega sin confirmación correcta**

Run: `node scripts/mfa-break-glass.mjs correo-que-no-existe@ejemplo.com`
Expected: `No existe ningun usuario con el correo …` y salida con código 1. **No cambia nada.**

- [ ] **Step 4: Correr la suite y el typecheck**

Run: `cd apps/web && pnpm vitest run && pnpm typecheck`
Expected: todo en verde.

- [ ] **Step 5: Documentar el procedimiento de emergencia**

En `docs/security.md`, añade una sección `## Break-glass de 2FA` que explique: cuándo usarlo, el comando exacto, por qué no hay códigos de recuperación, que exige la `service_role` (que no vive en la app), y que queda registrado en auditoría.

Incluye además el **orden de activación** de la spec §6.2 como lista numerada, porque es el paso que la gente se salta.

- [ ] **Step 6: Commit**

```bash
git add scripts/mfa-break-glass.mjs apps/web/src/features/admin/audit-labels.ts docs/security.md
git commit -m "feat(seguridad): break-glass de 2FA con rastro en auditoria

Son 2 admins y ningun tercero: si ambos pierden el telefono, nadie entra.
En vez de inventar codigos de recuperacion (criptografia casera, mas
superficie de la que eliminan), un script fuera de la app con service_role
que retira el factor de UN usuario nombrado y lo deja registrado.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Activación y cierre

Los pasos que dependen del dueño. **No los ejecutes por tu cuenta: guíalo y espera.**

**Files:**
- Modify: `docs/production-readiness-report.md`
- Modify: `docs/estado-actual.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Pedirle al dueño que enrole su 2FA**

Indícale: entrar a `/perfil/seguridad`, escanear el QR y confirmar el código.

Verifica que quedó registrado con `mcp__supabase-dermaland__execute_sql`:

```sql
select u.email, f.friendly_name, f.status, f.created_at
from auth.mfa_factors f join auth.users u on u.id = f.user_id
order by f.created_at desc;
```

Expected: al menos una fila con `status = 'verified'`. **Si sigue vacía, no continúes.**

- [ ] **Step 2: Probar el break-glass contra ese admin**

Con el dueño presente, corre `node scripts/mfa-break-glass.mjs <su-correo>`, confirma que puede entrar solo con contraseña, y **pídele que vuelva a enrolarse inmediatamente**.

Esta prueba es la que hace seguro el despliegue de Task 8. Sin ella, el enforcement es una apuesta.

- [ ] **Step 3: Desplegar el enforcement**

Solo ahora, y **solo con autorización explícita del dueño en ese momento**.

La rama es `feat/cierre-pendientes-produccion`, partida de `main`: no arrastra la reformulación DGII. El despliegue es fusionarla a `main` (auto-deploy activo), **nunca** fusionar `feat/dgii-reformulacion`.

Tras el despliegue verifica en vivo: el admin enrolado entra pasando por `/login/mfa`, y el cajero entra sin cambios.

- [ ] **Step 4: Actualizar el reporte de validación**

En `docs/production-readiness-report.md`, cambia el estado de B-01, B-07 y B-04 según el resultado real. **Si algo quedó a medias, dilo con esas palabras** — un reporte que exagera es peor que no tenerlo.

Actualiza también la tabla de checklist del final (líneas ~205-215).

- [ ] **Step 5: Actualizar la memoria del proyecto**

`CLAUDE.md` obliga a mantener estos archivos al cerrar un cambio importante. Todos:

- `docs/estado-actual.md`: entrada fechada `## 2026-08-05 · Cierre de B-01, B-07 y B-04` con los números reales del simulacro.
- `PROJECT_MEMORY.md`: qué funciona ahora y qué sigue faltando.
- `docs/decisiones.md`: las tres decisiones de diseño con su porqué — arenero efímero en vez de base compartida; break-glass en vez de códigos de recuperación; el dump deja de ser destructivo por defecto.
- `docs/riesgos.md`: cerrar los riesgos B-01/B-04 y dejar abierto lo que siga abierto (PITR sin plan Pro, R-SEC-01).
- `docs/proximos-pasos.md`: **está desactualizado (2026-06-18) y lista como pendiente cosa ya hecha** — por ejemplo "Conectar Supabase", que lleva meses en producción. Purga lo cumplido y deja solo lo vigente.
- `CHANGELOG.md`: bump de versión menor siguiendo la convención del archivo, describiendo los tres cierres.

- [ ] **Step 6: Commit y push**

```bash
git add docs/ PROJECT_MEMORY.md CHANGELOG.md
git commit -m "docs(produccion): cierre de B-01, B-07 y B-04

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
```

---

## Verificación final

Todo esto debe ser cierto al terminar:

- [ ] `cd apps/web && pnpm vitest run` en verde (446 previas + 35 nuevas: 8 + 7 + 4 + 8 + 8).
- [ ] `cd apps/web && pnpm typecheck` sin errores.
- [ ] `docs/dr-drill-<fecha>.md` existe y dice **PASA**.
- [ ] `docs/migration-audit-<fecha>.md` existe y ningún `repair` se ejecutó sin autorización.
- [ ] Los 51 archivos de `supabase/migrations/` aplican sobre una base 17.6 vacía.
- [ ] `auth.mfa_factors` tiene al menos un factor `verified`.
- [ ] El break-glass fue probado de verdad, no solo escrito.
- [ ] En `supabase-01` no queda ningún contenedor ni volumen `dermaland-*`, y `supabase-db` y `palusa-*` siguen corriendo intactos.
