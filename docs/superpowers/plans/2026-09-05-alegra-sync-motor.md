# Sincronizador Alegra → DermaLand (motor) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un script (`scripts/alegra-sync.mts`) que lee clientes, proveedores, productos, stock y facturas de la API de Alegra y deja DermaLand igual, con simulación por defecto, registro de cada corrida y carga inicial del histórico.

**Architecture:** Cliente HTTP de solo lectura con paginación y control del límite de 150 req/min; mapeos y planificadores PUROS (sin red ni reloj) probados con fixtures reales; escritura por PostgREST con `service_role` reutilizando el motor de stock (`buildImportPlan`), el comparador de códigos (`barcode-match`), el emparejador de clientes (`pickClientMatch`) y las reglas de alta de producto del script `migrar-inventario-alegra.mts`. Entregas 3 y 4 de la spec (workflow diario, disparo manual, pantallas) van en un plan aparte.

**Tech Stack:** TypeScript (tsx para scripts), vitest, PostgREST/Supabase (`service_role`), `pg` (solo para aplicar la migración), API REST de Alegra v1.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-05-alegra-sync-design.md` (decisiones 1–6 no se reabren).
- `business_id` del negocio es constante del código: `00000000-0000-0000-0000-00000000d001`. Nunca sale de la API ni de un archivo.
- Almacenes Alegra: `"1"` = sucursal DermaLand Principal, `"2"` = sucursal Dermaland  Villa Olga (resueltas por la misma regla que `pickImportBranches`, v0.139.1).
- `products.price` es CON ITBIS; Alegra da precio SIN ITBIS: `price = round2(alegraPrice × (1 + itbis/100))`, ITBIS 18.
- El cliente HTTP SOLO hace `GET`. Límite 150 req/min, páginas de 30. Nunca usar `metadata.total` para cortar (tope 10 000).
- Dry-run por defecto; `--apply` escribe. Guardia anti-vacío: si un barrido completo trae < 50 % de la corrida anterior, no se desactiva nada y la corrida queda `ok=false`.
- Sin `console.log` en código de la app; los scripts sí imprimen. Inmutabilidad (nunca mutar objetos recibidos). Archivos < 400 líneas.
- Comandos de calidad: `cd apps/web && npx vitest run <ruta>`, `npx tsc --noEmit -p tsconfig.json`; scripts con `apps/web/node_modules/.bin/tsx`.
- Convención de commits: `tipo(ámbito): qué (vX.Y.Z)`; CHANGELOG + bump de `package.json` en la entrega final. Push solo a `gitea`; `origin/main` despliega y requiere permiso del dueño.

---

### Task 1: Migración `alegra_sync` y guion para aplicarla

**Files:**
- Create: `supabase/migrations/20260905200000_alegra_sync.sql`
- Create: `scripts/db/apply-migration.mjs`

**Interfaces:**
- Produces: columnas `products.alegra_id`, `clients.alegra_id`, `suppliers.alegra_id` (text, únicas por negocio); `clients.source` admite `'alegra'`; tablas `alegra_invoices`, `alegra_invoice_items`, `alegra_sync_runs` con RLS de lectura por `business_id`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Sincronizador Alegra → DermaLand (spec docs/superpowers/specs/2026-09-05-alegra-sync-design.md).
-- Alegra manda; DermaLand solo lee. Nada de esto borra datos.

alter table public.products  add column if not exists alegra_id text;
alter table public.clients   add column if not exists alegra_id text;
alter table public.suppliers add column if not exists alegra_id text;

create unique index if not exists products_alegra_id_unique
  on public.products (business_id, alegra_id) where alegra_id is not null;
create unique index if not exists clients_alegra_id_unique
  on public.clients (business_id, alegra_id) where alegra_id is not null;
create unique index if not exists suppliers_alegra_id_unique
  on public.suppliers (business_id, alegra_id) where alegra_id is not null;

-- `clients.source` tiene CHECK cerrado; se amplía con 'alegra'.
alter table public.clients drop constraint if exists clients_source_check;
alter table public.clients add constraint clients_source_check
  check (source in ('manual','whatsapp','web','import','agendapro','alegra'));

create table if not exists public.alegra_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  alegra_id text not null,
  branch_id uuid references public.branches(id),
  client_id uuid references public.clients(id),
  alegra_client_id text,
  client_name text,
  client_document text,
  client_document_type text,
  ncf text,
  ncf_prefix text,
  date date not null,
  issued_at timestamptz,
  status text not null check (status in ('open','closed','void','draft')),
  payment_method text,
  seller_name text,
  station text,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  itbis numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  total_paid numeric(14,2) not null default 0,
  balance numeric(14,2) not null default 0,
  payments jsonb not null default '[]'::jsonb,
  raw jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, alegra_id)
);
create index if not exists alegra_invoices_business_date on public.alegra_invoices (business_id, date desc);
create index if not exists alegra_invoices_business_client on public.alegra_invoices (business_id, client_id);
create index if not exists alegra_invoices_open_balance on public.alegra_invoices (business_id, status) where balance > 0;

create table if not exists public.alegra_invoice_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  invoice_id uuid not null references public.alegra_invoices(id) on delete cascade,
  line_no int not null,
  alegra_item_id text,
  product_id uuid references public.products(id),
  name text not null,
  quantity numeric(14,3) not null,
  unit_price numeric(14,4) not null,
  discount numeric(14,2) not null default 0,
  itbis numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  unique (invoice_id, line_no)
);
create index if not exists alegra_invoice_items_product on public.alegra_invoice_items (product_id);

create table if not exists public.alegra_sync_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  trigger text not null check (trigger in ('cron','manual','cli')),
  mode text not null check (mode in ('full','incremental')),
  dry_run boolean not null default true,
  counts jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  reference text,
  log_url text
);
create index if not exists alegra_sync_runs_business_started on public.alegra_sync_runs (business_id, started_at desc);

alter table public.alegra_invoices enable row level security;
alter table public.alegra_invoice_items enable row level security;
alter table public.alegra_sync_runs enable row level security;

-- Solo lectura desde la app (mismo patrón que web_orders). Escribe el service_role.
create policy alegra_invoices_sel on public.alegra_invoices for select
  using (business_id = ((auth.jwt() -> 'app_metadata') ->> 'business_id')::uuid);
create policy alegra_invoice_items_sel on public.alegra_invoice_items for select
  using (business_id = ((auth.jwt() -> 'app_metadata') ->> 'business_id')::uuid);
create policy alegra_sync_runs_sel on public.alegra_sync_runs for select
  using (business_id = ((auth.jwt() -> 'app_metadata') ->> 'business_id')::uuid);
```

- [ ] **Step 2: Escribir el guion que aplica UNA migración con `pg`**

```js
#!/usr/bin/env node
/**
 * Aplica UNA migración a la base de apps/web/.env.local (SUPABASE_DB_URL) y la
 * registra en supabase_migrations.schema_migrations (igual que el CLI).
 * DRY-RUN por defecto: imprime el archivo y NO ejecuta. Con --apply ejecuta
 * todo dentro de una transacción.
 *
 *   node scripts/db/apply-migration.mjs supabase/migrations/20260905200000_alegra_sync.sql
 *   node scripts/db/apply-migration.mjs <archivo> --apply
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.resolve("apps/web/package.json"));
const { Client } = require("pg");

const [file, ...flags] = process.argv.slice(2);
if (!file) { console.error("Uso: node scripts/db/apply-migration.mjs <archivo.sql> [--apply]"); process.exit(1); }
const APPLY = flags.includes("--apply");
const env = Object.fromEntries(readFileSync("apps/web/.env.local", "utf8").split("\n")
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const url = env.SUPABASE_DB_URL;
if (!url || /YOUR-PROJECT-REF/.test(url)) throw new Error("SUPABASE_DB_URL no está configurada en apps/web/.env.local");
const sql = readFileSync(file, "utf8");
const version = path.basename(file).split("_")[0];
console.log(`${APPLY ? "▶ APLICANDO" : "🔍 dry-run"} ${file} (versión ${version}, ${sql.length} bytes)`);
if (!APPLY) { console.log(sql); process.exit(0); }

// TLS VERIFICADO (nunca rejectUnauthorized:false). Si el certificado del pooler no
// valida, exportar SUPABASE_DB_SSL_CA=<ruta al CA de Supabase> y se usa como raíz.
const ca = process.env.SUPABASE_DB_SSL_CA ? readFileSync(process.env.SUPABASE_DB_SSL_CA, "utf8") : undefined;
const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) } });
await client.connect();
try {
  await client.query("begin");
  await client.query("set local search_path = public");
  await client.query(sql);
  await client.query(
    "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3) on conflict (version) do nothing",
    [version, path.basename(file, ".sql").slice(version.length + 1), [sql]],
  );
  await client.query("commit");
  console.log("✓ aplicada y registrada");
} catch (e) {
  await client.query("rollback");
  console.error("✗ rollback:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
```

- [ ] **Step 3: Dry-run y aplicar a producción**

Run: `node scripts/db/apply-migration.mjs supabase/migrations/20260905200000_alegra_sync.sql` (imprime el SQL) y luego `node scripts/db/apply-migration.mjs supabase/migrations/20260905200000_alegra_sync.sql --apply`.
Expected: `✓ aplicada y registrada`. Si el pooler rechaza DDL, cambiar el puerto de `SUPABASE_DB_URL` a 5432 (modo sesión) solo para esta corrida.

- [ ] **Step 4: Verificar por OpenAPI que existen las columnas y tablas**

Run:
```bash
node -e '
const fs=require("fs");const env=Object.fromEntries(fs.readFileSync("apps/web/.env.local","utf8").split("\n").filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,"")]}));
const H={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY};
fetch(env.NEXT_PUBLIC_SUPABASE_URL+"/rest/v1/",{headers:H}).then(r=>r.json()).then(j=>{const d=j.definitions;console.log("products.alegra_id:",!!d.products.properties.alegra_id,"clients.alegra_id:",!!d.clients.properties.alegra_id,"suppliers.alegra_id:",!!d.suppliers.properties.alegra_id,"alegra_invoices:",!!d.alegra_invoices,"alegra_invoice_items:",!!d.alegra_invoice_items,"alegra_sync_runs:",!!d.alegra_sync_runs)});'
```
Expected: todos `true`. Si PostgREST no ve las tablas nuevas, esperar 1 minuto (recarga del esquema) y repetir.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260905200000_alegra_sync.sql scripts/db/apply-migration.mjs
git commit -m "feat(alegra): migración alegra_sync (alegra_id, facturas, corridas) y guion para aplicarla"
```

---

### Task 2: Cliente HTTP de Alegra (solo lectura, paginado, con límite)

**Files:**
- Create: `apps/web/src/server/services/alegra/client.ts`
- Test: `apps/web/src/server/services/alegra/client.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AlegraClientOptions { email: string; token: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; baseUrl?: string; }
  export class AlegraClient {
    constructor(opts: AlegraClientOptions);
    get<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T>;
    /** Pagina de 30 en 30 hasta página incompleta; llama onPage por página. */
    listAll<T>(path: string, query?: Record<string, string | number | boolean | undefined>, onPage?: (rows: T[], start: number) => void): Promise<T[]>;
    readonly requests: number;
  }
  export class AlegraAuthError extends Error {}
  export class AlegraHttpError extends Error { status: number; body: string; }
  ```

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect, vi } from "vitest";
import { AlegraClient, AlegraAuthError, AlegraHttpError } from "./client";

function fakeFetch(handler: (url: string, n: number) => { status: number; body: unknown; headers?: Record<string, string> }) {
  let n = 0;
  const calls: string[] = [];
  const f = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (init?.method && init.method !== "GET") throw new Error(`método prohibido: ${init.method}`);
    const r = handler(url, n++);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
  });
  return { f: f as unknown as typeof fetch, calls };
}
const noSleep = async () => {};

describe("AlegraClient", () => {
  it("manda Basic base64(email:token) y solo GET", async () => {
    const { f, calls } = fakeFetch(() => ({ status: 200, body: { name: "DermaLand" } }));
    const c = new AlegraClient({ email: "a@b.com", token: "t0k", fetchImpl: f, sleep: noSleep });
    const r = await c.get<{ name: string }>("company");
    expect(r.name).toBe("DermaLand");
    expect(calls[0]).toBe("https://api.alegra.com/api/v1/company");
    const init = (f as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls[0]![1];
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("a@b.com:t0k").toString("base64")}`);
    expect(init.method ?? "GET").toBe("GET");
  });

  it("pagina de 30 en 30 hasta página incompleta y NO usa metadata.total", async () => {
    const { f, calls } = fakeFetch((url) => {
      const start = Number(new URL(url).searchParams.get("start") ?? 0);
      const size = start === 60 ? 5 : 30;
      return { status: 200, body: Array.from({ length: size }, (_, i) => ({ id: String(start + i) })) };
    });
    const c = new AlegraClient({ email: "a", token: "b", fetchImpl: f, sleep: noSleep });
    const pages: number[] = [];
    const rows = await c.listAll<{ id: string }>("items", { status: "active" }, (p, s) => pages.push(s));
    expect(rows).toHaveLength(65);
    expect(pages).toEqual([0, 30, 60]);
    expect(calls).toHaveLength(3);
    expect(new URL(calls[0]!).searchParams.get("limit")).toBe("30");
    expect(new URL(calls[0]!).searchParams.get("status")).toBe("active");
  });

  it("ante 429 espera X-Rate-Limit-Reset segundos y reintenta", async () => {
    const waited: number[] = [];
    const { f } = fakeFetch((_, n) => n === 0
      ? { status: 429, body: { message: "Too Many request" }, headers: { "X-Rate-Limit-Reset": "2" } }
      : { status: 200, body: [] });
    const c = new AlegraClient({ email: "a", token: "b", fetchImpl: f, sleep: async (ms) => { waited.push(ms); } });
    await c.listAll("items");
    expect(waited).toEqual([2000]);
  });

  it("frena solo cuando X-Rate-Limit-Remaining llega a 0", async () => {
    const waited: number[] = [];
    const { f } = fakeFetch((_, n) => ({ status: 200, body: n === 0 ? Array(30).fill({ id: "x" }) : [], headers: n === 0 ? { "X-Rate-Limit-Remaining": "0", "X-Rate-Limit-Reset": "3" } : {} }));
    const c = new AlegraClient({ email: "a", token: "b", fetchImpl: f, sleep: async (ms) => { waited.push(ms); } });
    await c.listAll("items");
    expect(waited).toEqual([3000]);
  });

  it("reintenta 5xx tres veces con espera creciente y luego falla con AlegraHttpError", async () => {
    const waited: number[] = [];
    const { f, calls } = fakeFetch(() => ({ status: 502, body: { message: "bad gateway" } }));
    const c = new AlegraClient({ email: "a", token: "b", fetchImpl: f, sleep: async (ms) => { waited.push(ms); } });
    await expect(c.get("company")).rejects.toBeInstanceOf(AlegraHttpError);
    expect(calls).toHaveLength(4);
    expect(waited).toEqual([1000, 2000, 4000]);
  });

  it("401 es AlegraAuthError y no se reintenta", async () => {
    const { f, calls } = fakeFetch(() => ({ status: 401, body: { message: "Unauthorized" } }));
    const c = new AlegraClient({ email: "a", token: "b", fetchImpl: f, sleep: noSleep });
    await expect(c.get("company")).rejects.toBeInstanceOf(AlegraAuthError);
    expect(calls).toHaveLength(1);
  });

  it("no expone ningún método de escritura", () => {
    const c = new AlegraClient({ email: "a", token: "b", fetchImpl: fakeFetch(() => ({ status: 200, body: {} })).f, sleep: noSleep });
    const nombres = Object.getOwnPropertyNames(Object.getPrototypeOf(c));
    expect(nombres.some((n) => /post|put|patch|delete|create|update/i.test(n))).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd apps/web && npx vitest run src/server/services/alegra/client.test.ts`
Expected: FAIL — `Cannot find module './client'`.

- [ ] **Step 3: Implementar el cliente**

```ts
/**
 * Cliente de SOLO LECTURA para la API de Alegra (api.alegra.com/api/v1).
 *
 * Reglas (spec §3): Basic base64(email:token); páginas de máximo 30 con
 * `start`/`limit`; 150 peticiones por minuto — cuando `X-Rate-Limit-Remaining`
 * llega a 0 se espera `X-Rate-Limit-Reset` segundos; 429 espera y reintenta;
 * 5xx reintenta 3 veces (1 s, 2 s, 4 s); 401 aborta sin reintentar.
 *
 * `fetchImpl` y `sleep` se inyectan para que los tests no toquen red ni reloj.
 * A propósito NO existe ningún método que no sea GET: DermaLand nunca escribe
 * en Alegra (decisión 1 de la spec).
 */
import "server-only";

export interface AlegraClientOptions {
  email: string;
  token: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
}
export type AlegraQuery = Record<string, string | number | boolean | undefined>;

export class AlegraAuthError extends Error {
  constructor(message = "Alegra rechazó las credenciales (401). Revisa ALEGRA_EMAIL / ALEGRA_TOKEN.") {
    super(message);
    this.name = "AlegraAuthError";
  }
}
export class AlegraHttpError extends Error {
  constructor(public readonly status: number, public readonly body: string, path: string) {
    super(`Alegra ${status} en ${path}: ${body.slice(0, 200)}`);
    this.name = "AlegraHttpError";
  }
}

export const ALEGRA_PAGE_SIZE = 30;
const RETRY_WAITS_MS = [1000, 2000, 4000];

export class AlegraClient {
  private readonly auth: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly baseUrl: string;
  private _requests = 0;

  constructor(opts: AlegraClientOptions) {
    this.auth = `Basic ${Buffer.from(`${opts.email}:${opts.token}`).toString("base64")}`;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.baseUrl = (opts.baseUrl ?? "https://api.alegra.com/api/v1").replace(/\/$/, "");
  }

  get requests(): number {
    return this._requests;
  }

  async get<T>(path: string, query?: AlegraQuery): Promise<T> {
    const url = new URL(`${this.baseUrl}/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    let retry = 0;
    for (;;) {
      this._requests++;
      const res = await this.fetchImpl(url.toString(), {
        method: "GET",
        headers: { Authorization: this.auth, Accept: "application/json" },
      });
      if (res.status === 401) throw new AlegraAuthError();
      if (res.status === 429) {
        await this.sleep(resetMs(res.headers));
        continue;
      }
      if (res.status >= 500 && retry < RETRY_WAITS_MS.length) {
        await this.sleep(RETRY_WAITS_MS[retry]!);
        retry++;
        continue;
      }
      const text = await res.text();
      if (!res.ok) throw new AlegraHttpError(res.status, text, path);
      const remaining = Number(res.headers.get("X-Rate-Limit-Remaining") ?? "1");
      if (remaining <= 0) await this.sleep(resetMs(res.headers));
      return JSON.parse(text) as T;
    }
  }

  async listAll<T>(
    path: string,
    query?: AlegraQuery,
    onPage?: (rows: T[], start: number) => void,
  ): Promise<T[]> {
    const all: T[] = [];
    for (let start = 0; ; start += ALEGRA_PAGE_SIZE) {
      const page = await this.get<T[]>(path, { ...query, start, limit: ALEGRA_PAGE_SIZE });
      onPage?.(page, start);
      all.push(...page);
      if (page.length < ALEGRA_PAGE_SIZE) return all;
    }
  }
}

function resetMs(headers: Headers): number {
  const s = Number(headers.get("X-Rate-Limit-Reset") ?? "60");
  return Math.max(1, Number.isFinite(s) ? s : 60) * 1000;
}
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `cd apps/web && npx vitest run src/server/services/alegra/client.test.ts`
Expected: 7 passed. (Si vitest se queja de `server-only`, añadir `vi.mock("server-only", () => ({}))` al inicio del test, como hacen otros tests del repo.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/services/alegra/client.ts apps/web/src/server/services/alegra/client.test.ts
git commit -m "feat(alegra): cliente HTTP de solo lectura con paginación y control de límite"
```

---

### Task 3: Tipos y fixtures reales de Alegra

**Files:**
- Create: `apps/web/src/features/alegra/types.ts`
- Create: `apps/web/src/features/alegra/__fixtures__/item-elta-uv-sport.json`
- Create: `apps/web/src/features/alegra/__fixtures__/contact-con-telefono.json`
- Create: `apps/web/src/features/alegra/__fixtures__/invoice-b02.json`

**Interfaces:**
- Produces los tipos mínimos que usan los mapeos:
  ```ts
  export interface AlegraItem { id: string; name: string; status: "active" | "inactive"; price: Array<{ idPriceList: string; name: string; price: number; main?: boolean }>; inventory?: { unit?: string; unitCost?: number; availableQuantity?: number; warehouses?: Array<{ id: string; name: string; availableQuantity: number }> } | null; customFields?: Array<{ key?: string; name?: string; value?: string | null }>; tax?: Array<{ percentage: string | number }>; }
  export interface AlegraContact { id: string; name: string; phonePrimary?: string | null; phoneSecondary?: string | null; mobile?: string | null; email?: string | null; identification?: string | null; identificationObject?: { type?: string | null; number?: string | null } | null; status: "active" | "inactive"; type: string[]; created_at?: string; updated_at?: string; }
  export interface AlegraInvoice { id: string; date: string; datetime?: string; status: "open" | "closed" | "void" | "draft"; client?: { id: string; name: string; identification?: string | null; identificationType?: string | null } | null; numberTemplate?: { prefix?: string | null; fullNumber?: string | null } | null; warehouse?: { id: string; name: string } | null; seller?: { id: string; name: string } | null; station?: { name?: string } | null; paymentMethod?: string | null; subtotal: number; discount: number; tax: number; total: number; totalPaid: number; balance: number; items: Array<{ id: string; name: string; price: number; quantity: number; discount?: number; discountAmount?: number; tax?: Array<{ amount?: number }>; total: number }>; payments?: Array<{ id: string; date: string; amount: number; paymentMethod?: string; status?: string }>; }
  ```

- [ ] **Step 1: Escribir `types.ts` con exactamente las interfaces de arriba** (con un comentario de cabecera: «Solo los campos que DermaLand usa; la API trae muchos más»).

- [ ] **Step 2: Crear los fixtures anonimizados**

`item-elta-uv-sport.json` (tal cual la API del 2026-09-05, recortado):
```json
{ "id": "1288", "name": "ELTA MD UV SPORT BROAD SPECTRUM SPF 50", "status": "active",
  "price": [{ "idPriceList": "1", "name": "General", "type": "amount", "price": 1779.661, "main": true }],
  "inventory": { "unit": "UND", "unitCost": 1156.78, "availableQuantity": 1,
    "warehouses": [{ "id": "1", "name": "Principal", "availableQuantity": 1 }, { "id": "2", "name": "CUTIS", "availableQuantity": 0 }] },
  "customFields": [{ "id": "1", "key": "barcode", "name": "Código de barras", "value": "390205022878" }],
  "tax": [{ "id": "1", "name": "ITBIS", "percentage": "18.00" }] }
```
`contact-con-telefono.json` (nombre y teléfono inventados, estructura real):
```json
{ "id": "5691", "name": "Ana Prueba Rodriguez", "phonePrimary": "829-555-0182", "phoneSecondary": null, "mobile": null, "email": null,
  "identification": "40200000001", "identificationObject": {}, "status": "active", "type": ["client"],
  "created_at": "2026-04-23T21:03:01.000Z", "updated_at": "2026-04-23T21:03:01.000Z" }
```
`invoice-b02.json` (cliente inventado, montos reales):
```json
{ "id": "14970", "date": "2026-09-05", "datetime": "2026-09-05 12:50:18", "status": "closed",
  "client": { "id": "6529", "name": "Cliente Prueba", "identification": "40200000002", "identificationType": "CED" },
  "numberTemplate": { "prefix": "B02", "number": "14482", "fullNumber": "B0200014482" },
  "subtotal": 4233.05, "discount": 0, "tax": 761.95, "total": 4995, "totalPaid": 4995, "balance": 0,
  "warehouse": { "id": "2", "name": "CUTIS" }, "paymentMethod": "cash", "seller": { "id": "1", "name": "VENDEDORA" }, "station": { "name": "VILLA OLGA" },
  "items": [
    { "id": "1095", "name": "GLISODIN SKIN BRIGHTENING 60 CAPSULAS", "price": 2911.02, "discount": 0, "discountAmount": 0, "quantity": 1, "tax": [{ "amount": 523.9836 }], "total": 3435.0036 },
    { "id": "1257", "name": "BABE DEPIGMENT SUPER FLUIDO SPF 50 50ML", "price": 1322.03, "discount": 0, "discountAmount": 0, "quantity": 1, "tax": [{ "amount": 237.9654 }], "total": 1559.9954 } ],
  "payments": [{ "id": "18980", "date": "2026-09-05", "amount": 4995, "paymentMethod": "cash", "status": "open" }] }
```

- [ ] **Step 3: Typecheck y commit**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json` → Expected: exit 0.
```bash
git add apps/web/src/features/alegra/types.ts apps/web/src/features/alegra/__fixtures__
git commit -m "feat(alegra): tipos mínimos y fixtures reales anonimizados"
```

---

### Task 4: Mapeo contacto → cliente / proveedor y emparejado sin duplicar

**Files:**
- Create: `apps/web/src/features/alegra/map-contact.ts`
- Create: `apps/web/src/features/alegra/plan-contacts.ts`
- Test: `apps/web/src/features/alegra/map-contact.test.ts`
- Test: `apps/web/src/features/alegra/plan-contacts.test.ts`

**Interfaces:**
- Consumes: `AlegraContact` (Task 3); `splitFullName` (`@/features/storefront/account/full-name`), `formatDominicanPhone` (`@/lib/utils/formatters`), `normalizePhone/normalizeEmail/normalizeDocument` (`@/features/customers/customer-normalization`), `pickClientMatch`, `ClientCandidate` (`@/features/customers/identity-match`).
- Produces:
  ```ts
  export interface ClientDraft { firstName: string; lastName: string; phone: string | null; whatsapp: string | null; email: string | null; documentType: "cedula" | "rnc" | "passport" | null; documentNumber: string | null; active: boolean; alegraId: string; alegraUpdatedAt: string | null; }
  export function contactToClientDraft(c: AlegraContact): ClientDraft;
  export interface SupplierDraft { name: string; rnc: string | null; phone: string | null; email: string | null; alegraId: string; }
  export function contactToSupplierDraft(c: AlegraContact): SupplierDraft;
  export function isClient(c: AlegraContact): boolean; export function isProvider(c: AlegraContact): boolean;

  export interface ExistingClient extends ClientCandidate { alegraId: string | null; documentNormalized: string | null; phone: string | null; email: string | null; documentNumber: string | null; }
  export type ContactAction =
    | { kind: "create"; draft: ClientDraft }
    | { kind: "link"; clientId: string; draft: ClientDraft; fill: Partial<Pick<ClientDraft, "phone" | "whatsapp" | "email" | "documentType" | "documentNumber">>; reason: "alegra_id" | "phone" | "email" | "document" }
    | { kind: "skip"; clientId: string; reason: "unchanged" };
  export function planContacts(contacts: AlegraContact[], existing: ExistingClient[]): ContactAction[];
  ```

- [ ] **Step 1: Test del mapeo (falla)**

```ts
import { describe, it, expect } from "vitest";
import contacto from "./__fixtures__/contact-con-telefono.json";
import { contactToClientDraft, contactToSupplierDraft, isClient, isProvider } from "./map-contact";
import type { AlegraContact } from "./types";

describe("contactToClientDraft", () => {
  it("parte el nombre, formatea el teléfono con guiones y detecta cédula (11 dígitos)", () => {
    const d = contactToClientDraft(contacto as AlegraContact);
    expect(d.firstName).toBe("Ana");
    expect(d.lastName).toBe("Prueba Rodriguez");
    expect(d.phone).toBe("829-555-0182");
    expect(d.whatsapp).toBe("829-555-0182");
    expect(d.documentType).toBe("cedula");
    expect(d.documentNumber).toBe("40200000001");
    expect(d.active).toBe(true);
    expect(d.alegraId).toBe("5691");
    expect(d.alegraUpdatedAt).toBe("2026-04-23T21:03:01.000Z");
  });
  it("RNC de 9 dígitos → rnc; otra cosa → passport; vacío → null; usa mobile si no hay phonePrimary", () => {
    const base = contacto as AlegraContact;
    expect(contactToClientDraft({ ...base, identification: "130984395" }).documentType).toBe("rnc");
    expect(contactToClientDraft({ ...base, identification: "AB1234" }).documentType).toBe("passport");
    expect(contactToClientDraft({ ...base, identification: null }).documentType).toBeNull();
    expect(contactToClientDraft({ ...base, phonePrimary: null, mobile: "(809) 555 0101" }).phone).toBe("809-555-0101");
    expect(contactToClientDraft({ ...base, phonePrimary: null, mobile: null }).phone).toBeNull();
    expect(contactToClientDraft({ ...base, status: "inactive" }).active).toBe(false);
  });
  it("identificationObject.number manda sobre identification cuando viene lleno", () => {
    const d = contactToClientDraft({ ...(contacto as AlegraContact), identificationObject: { type: "RNC", number: "1-31-79421-1" } });
    expect(d.documentType).toBe("rnc");
    expect(d.documentNumber).toBe("131794211");
  });
  it("proveedor: nombre tal cual, rnc si es de 9 dígitos", () => {
    const p = contactToSupplierDraft({ ...(contacto as AlegraContact), id: "2477", name: "Managament Company", identification: "131794211", type: ["provider"] });
    expect(p).toEqual({ name: "Managament Company", rnc: "131794211", phone: "829-555-0182", email: null, alegraId: "2477" });
    expect(isProvider({ ...(contacto as AlegraContact), type: ["provider"] })).toBe(true);
    expect(isClient({ ...(contacto as AlegraContact), type: ["client", "provider"] })).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `cd apps/web && npx vitest run src/features/alegra/map-contact.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `map-contact.ts`**

```ts
/**
 * Contacto de Alegra → borrador de cliente/proveedor de DermaLand. PURO.
 * Reglas (spec §5.2): nombre partido como en la tienda; teléfono con guiones
 * como lo escribe el mostrador; documento: 9 dígitos = RNC, 11 = cédula, otro
 * = pasaporte; inactivo en Alegra NO borra, solo `active=false`.
 */
import { splitFullName } from "@/features/storefront/account/full-name";
import { formatDominicanPhone } from "@/lib/utils/formatters";
import { normalizeDocument } from "@/features/customers/customer-normalization";
import type { AlegraContact } from "./types";

export type DocumentType = "cedula" | "rnc" | "passport";
export interface ClientDraft {
  firstName: string; lastName: string;
  phone: string | null; whatsapp: string | null; email: string | null;
  documentType: DocumentType | null; documentNumber: string | null;
  active: boolean; alegraId: string; alegraUpdatedAt: string | null;
}
export interface SupplierDraft { name: string; rnc: string | null; phone: string | null; email: string | null; alegraId: string; }

export function isClient(c: AlegraContact): boolean { return (c.type ?? []).includes("client"); }
export function isProvider(c: AlegraContact): boolean { return (c.type ?? []).includes("provider"); }

export function documentOf(c: AlegraContact): { type: DocumentType | null; number: string | null } {
  const raw = c.identificationObject?.number?.trim() || c.identification?.trim() || "";
  const number = normalizeDocument(raw);
  if (!number) return { type: null, number: null };
  if (/^\d{9}$/.test(number)) return { type: "rnc", number };
  if (/^\d{11}$/.test(number)) return { type: "cedula", number };
  return { type: "passport", number };
}

function phoneOf(c: AlegraContact): string | null {
  const raw = (c.phonePrimary ?? "").trim() || (c.mobile ?? "").trim() || (c.phoneSecondary ?? "").trim();
  if (!raw) return null;
  const f = formatDominicanPhone(raw);
  return f || null;
}

function emailOf(c: AlegraContact): string | null {
  const e = (c.email ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

export function contactToClientDraft(c: AlegraContact): ClientDraft {
  const { firstName, lastName } = splitFullName(c.name);
  const phone = phoneOf(c);
  const doc = documentOf(c);
  return {
    firstName, lastName,
    phone, whatsapp: phone, email: emailOf(c),
    documentType: doc.type, documentNumber: doc.number,
    active: c.status !== "inactive",
    alegraId: String(c.id),
    alegraUpdatedAt: c.updated_at ?? null,
  };
}

export function contactToSupplierDraft(c: AlegraContact): SupplierDraft {
  const doc = documentOf(c);
  return { name: c.name.trim(), rnc: doc.type === "rnc" ? doc.number : null, phone: phoneOf(c), email: emailOf(c), alegraId: String(c.id) };
}
```

- [ ] **Step 4: Correr y ver pasar** — mismo comando → 4 passed.

- [ ] **Step 5: Test del planificador (falla)**

```ts
import { describe, it, expect } from "vitest";
import { planContacts, type ExistingClient } from "./plan-contacts";
import type { AlegraContact } from "./types";

const c = (over: Partial<AlegraContact>): AlegraContact => ({ id: "1", name: "Juan Perez", phonePrimary: null, mobile: null, email: null, identification: null, status: "active", type: ["client"], updated_at: "2026-09-01T00:00:00.000Z", ...over });
const e = (over: Partial<ExistingClient>): ExistingClient => ({ id: "c1", firstName: "Juan", lastName: "Perez", phoneDigits: null, whatsappDigits: null, emailNormalized: null, createdAt: "2026-01-01T00:00:00Z", alegraId: null, documentNormalized: null, phone: null, email: null, documentNumber: null, ...over });

describe("planContacts", () => {
  it("crea cuando no hay nada con qué emparejar (ni teléfono, ni correo, ni documento)", () => {
    const acciones = planContacts([c({ id: "10" })], [e({})]);
    expect(acciones[0]!.kind).toBe("create");
  });
  it("empareja por alegra_id ya guardado y omite si Alegra no cambió desde la última vez", () => {
    const acciones = planContacts([c({ id: "10", updated_at: "2026-09-01T00:00:00.000Z" })], [e({ id: "c9", alegraId: "10", alegraUpdatedAt: "2026-09-01T00:00:00.000Z" } as Partial<ExistingClient>)]);
    expect(acciones[0]).toMatchObject({ kind: "skip", clientId: "c9", reason: "unchanged" });
  });
  it("empareja por teléfono (con guiones vs sin guiones) y rellena solo lo vacío", () => {
    const acciones = planContacts([c({ id: "10", phonePrimary: "8295550182", email: "a@b.com" })], [e({ id: "c2", phoneDigits: "8295550182", phone: "829-555-0182", email: null })]);
    expect(acciones[0]).toMatchObject({ kind: "link", clientId: "c2", reason: "phone", fill: { email: "a@b.com" } });
    expect((acciones[0] as { fill: Record<string, unknown> }).fill).not.toHaveProperty("phone");
  });
  it("empareja por documento cuando no hay teléfono ni correo", () => {
    const acciones = planContacts([c({ id: "10", identification: "40200000001" })], [e({ id: "c3", documentNormalized: "40200000001" })]);
    expect(acciones[0]).toMatchObject({ kind: "link", clientId: "c3", reason: "document" });
  });
  it("NUNCA empareja solo por nombre", () => {
    const acciones = planContacts([c({ id: "10", name: "Juan Perez" })], [e({ id: "c4", firstName: "Juan", lastName: "Perez" })]);
    expect(acciones[0]!.kind).toBe("create");
  });
  it("entre dos fichas con el mismo teléfono gana la más antigua", () => {
    const acciones = planContacts([c({ id: "10", phonePrimary: "8295550182" })], [
      e({ id: "nueva", phoneDigits: "8295550182", createdAt: "2026-08-01T00:00:00Z" }),
      e({ id: "vieja", phoneDigits: "8295550182", createdAt: "2025-01-01T00:00:00Z" }),
    ]);
    expect(acciones[0]).toMatchObject({ kind: "link", clientId: "vieja" });
  });
  it("una ficha ya vinculada a OTRO alegra_id no se reutiliza (Alegra tiene dos contactos con el mismo teléfono)", () => {
    const acciones = planContacts([c({ id: "10", phonePrimary: "8295550182" })], [e({ id: "c5", phoneDigits: "8295550182", alegraId: "99" })]);
    expect(acciones[0]!.kind).toBe("create");
  });
});
```

- [ ] **Step 6: Correr y ver fallar** — `npx vitest run src/features/alegra/plan-contacts.test.ts` → FAIL.

- [ ] **Step 7: Implementar `plan-contacts.ts`**

```ts
/**
 * Decide, contacto por contacto, si se crea una ficha, se enlaza a una
 * existente o no hay nada que hacer. PURO. Reglas (spec §5.2, decisión 4):
 *  1. `alegra_id` ya guardado → enlazar; si `updated_at` no cambió → skip.
 *  2. Teléfono/WhatsApp/correo normalizados → `pickClientMatch` (gana la más antigua).
 *  3. Documento normalizado igual.
 *  4. Nada → crear. Nunca por nombre solo. Una ficha ya enlazada a OTRO alegra_id
 *     no se reutiliza (Alegra puede tener dos contactos con el mismo número).
 * Al enlazar solo se rellenan campos VACÍOS de la ficha (fill); nunca se pisa lo
 * que escribió el mostrador.
 */
import { pickClientMatch, type ClientCandidate } from "@/features/customers/identity-match";
import { normalizeEmail, normalizePhone } from "@/features/customers/customer-normalization";
import { contactToClientDraft, isClient, type ClientDraft } from "./map-contact";
import type { AlegraContact } from "./types";

export interface ExistingClient extends ClientCandidate {
  alegraId: string | null;
  alegraUpdatedAt?: string | null;
  documentNormalized: string | null;
  phone: string | null;
  email: string | null;
  documentNumber: string | null;
}
export type Fill = Partial<Pick<ClientDraft, "phone" | "whatsapp" | "email" | "documentType" | "documentNumber">>;
export type ContactAction =
  | { kind: "create"; draft: ClientDraft }
  | { kind: "link"; clientId: string; draft: ClientDraft; fill: Fill; reason: "alegra_id" | "phone" | "email" | "document" }
  | { kind: "skip"; clientId: string; reason: "unchanged" };

function fillFor(existing: ExistingClient, draft: ClientDraft): Fill {
  const fill: Fill = {};
  if (!existing.phone && draft.phone) { fill.phone = draft.phone; fill.whatsapp = draft.whatsapp; }
  if (!existing.email && draft.email) fill.email = draft.email;
  if (!existing.documentNumber && draft.documentNumber) { fill.documentType = draft.documentType; fill.documentNumber = draft.documentNumber; }
  return fill;
}

export function planContacts(contacts: AlegraContact[], existing: ExistingClient[]): ContactAction[] {
  const byAlegraId = new Map(existing.filter((e) => e.alegraId).map((e) => [e.alegraId!, e]));
  const byDocument = new Map(existing.filter((e) => e.documentNormalized && !e.alegraId).map((e) => [e.documentNormalized!, e]));
  const libres = existing.filter((e) => !e.alegraId);
  const tomadas = new Set<string>();

  return contacts.filter(isClient).map((c): ContactAction => {
    const draft = contactToClientDraft(c);
    const ya = byAlegraId.get(draft.alegraId);
    if (ya) {
      if (ya.alegraUpdatedAt && draft.alegraUpdatedAt && ya.alegraUpdatedAt >= draft.alegraUpdatedAt) {
        return { kind: "skip", clientId: ya.id, reason: "unchanged" };
      }
      return { kind: "link", clientId: ya.id, draft, fill: fillFor(ya, draft), reason: "alegra_id" };
    }
    const telefono = normalizePhone(draft.phone);
    const correo = normalizeEmail(draft.email);
    if (telefono || correo) {
      const candidatas = libres.filter((e) => !tomadas.has(e.id) && (
        (telefono && (e.phoneDigits === telefono || e.whatsappDigits === telefono)) || (correo && e.emailNormalized === correo)));
      const m = pickClientMatch(candidatas, { fullName: `${draft.firstName} ${draft.lastName}`.trim(), phone: draft.phone ?? "", email: draft.email });
      if (m) {
        tomadas.add(m.id);
        const porCorreo = !!correo && candidatas.some((e) => e.id === m.id && e.emailNormalized === correo);
        const e = existing.find((x) => x.id === m.id)!;
        return { kind: "link", clientId: m.id, draft, fill: fillFor(e, draft), reason: porCorreo && !telefono ? "email" : "phone" };
      }
    }
    if (draft.documentNumber) {
      const e = byDocument.get(draft.documentNumber);
      if (e && !tomadas.has(e.id)) {
        tomadas.add(e.id);
        return { kind: "link", clientId: e.id, draft, fill: fillFor(e, draft), reason: "document" };
      }
    }
    return { kind: "create", draft };
  });
}
```
Nota: `pickClientMatch` devuelve `{ id, ... }` (ver `identity-match.ts`); si su tipo de retorno se llama distinto, ajustar `m.id` al nombre real sin cambiar la lógica.

- [ ] **Step 8: Correr y ver pasar** — `npx vitest run src/features/alegra/` → todos passed. Typecheck: `npx tsc --noEmit -p tsconfig.json`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/alegra/map-contact.ts apps/web/src/features/alegra/map-contact.test.ts apps/web/src/features/alegra/plan-contacts.ts apps/web/src/features/alegra/plan-contacts.test.ts
git commit -m "feat(alegra): mapeo de contactos y emparejado sin duplicar (teléfono/correo/documento)"
```

---

### Task 5: Mapeo ítem → producto y planificador de catálogo

**Files:**
- Create: `apps/web/src/features/alegra/map-item.ts`
- Create: `apps/web/src/features/alegra/plan-products.ts`
- Test: `apps/web/src/features/alegra/map-item.test.ts`
- Test: `apps/web/src/features/alegra/plan-products.test.ts`

**Interfaces:**
- Consumes: `AlegraItem`; `normalizeProductName` (`@/features/inventory/alegra-import`); `sameBarcode` (`@/features/products/barcode-match`); `parseProductName` (`@/lib/import/product-parser`).
- Produces:
  ```ts
  export interface ItemDraft { alegraId: string; alegraName: string; displayName: string; cost: number; price: number; active: boolean; barcode: string | null; unit: "unidad"; }
  export function itemToDraft(item: AlegraItem, itbisRate?: number): ItemDraft;   // price = round2(alegraPrice × 1.18)
  export function barcodeOf(item: AlegraItem): string | null;                      // customFields key/name "barcode"/"Código de barras"
  export interface ExistingProduct { id: string; name: string; alegraId: string | null; barcode: string | null; cost: number; price: number; active: boolean; }
  export type ProductAction =
    | { kind: "create"; draft: ItemDraft }
    | { kind: "update"; productId: string; draft: ItemDraft; patch: { alegra_id: string; cost?: number; price?: number; active?: boolean; name?: string; barcode?: string }; barcodeConflict?: { stored: string; alegra: string } }
    | { kind: "deactivate"; productId: string; name: string }
    | { kind: "skip"; productId: string };
  export interface ProductPlan { actions: ProductAction[]; matchedByName: number; priceChanged: number; guardTripped: boolean; }
  export function planProducts(items: AlegraItem[], existing: ExistingProduct[], previousCount: number | null): ProductPlan;
  ```

- [ ] **Step 1: Test del mapeo (falla)**

```ts
import { describe, it, expect } from "vitest";
import item from "./__fixtures__/item-elta-uv-sport.json";
import { itemToDraft, barcodeOf } from "./map-item";
import type { AlegraItem } from "./types";

describe("itemToDraft", () => {
  it("precio CON ITBIS redondeado a 2, costo de inventario, nombre limpio, código del campo personalizado", () => {
    const d = itemToDraft(item as AlegraItem);
    expect(d.price).toBe(2100);          // 1779.661 × 1.18 = 2100.0000
    expect(d.cost).toBe(1156.78);
    expect(d.displayName).toBe("Elta MD UV Sport Broad Spectrum SPF 50");
    expect(d.alegraName).toBe("ELTA MD UV SPORT BROAD SPECTRUM SPF 50");
    expect(d.barcode).toBe("390205022878");
    expect(d.active).toBe(true);
    expect(d.alegraId).toBe("1288");
    expect(d.unit).toBe("unidad");
  });
  it("sin lista de precios o sin inventario → 0; inactivo → active=false; código vacío → null", () => {
    const base = item as AlegraItem;
    expect(itemToDraft({ ...base, price: [] }).price).toBe(0);
    expect(itemToDraft({ ...base, inventory: null }).cost).toBe(0);
    expect(itemToDraft({ ...base, status: "inactive" }).active).toBe(false);
    expect(barcodeOf({ ...base, customFields: [{ key: "barcode", value: "  " }] })).toBeNull();
    expect(barcodeOf({ ...base, customFields: [{ name: "Código de barras", value: "0390205022878" }] })).toBe("0390205022878");
  });
  it("el nombre limpio sigue emparejando con el de Alegra; si no, se conserva el crudo", () => {
    const d = itemToDraft({ ...(item as AlegraItem), name: "ZO LEUKOPLAST" });
    expect(d.displayName).toBe("ZO Leukoplast");
  });
});
```

- [ ] **Step 2: Ver fallar** — `npx vitest run src/features/alegra/map-item.test.ts` → FAIL.

- [ ] **Step 3: Implementar `map-item.ts`**

```ts
/**
 * Ítem de Alegra → borrador de producto. PURO.
 * `products.price` es CON ITBIS y Alegra da la lista «General» SIN ITBIS
 * (verificado: 1779.661 × 1.18 = 2100 = precio actual en DermaLand).
 * El código de barras vive en el campo personalizado «Código de barras»
 * (`key: "barcode"`), no en `reference`.
 */
import { normalizeProductName } from "@/features/inventory/alegra-import";
import { parseProductName } from "@/lib/import/product-parser";
import type { AlegraItem } from "./types";

export const ITBIS_RATE = 18;
export interface ItemDraft {
  alegraId: string; alegraName: string; displayName: string;
  cost: number; price: number; active: boolean; barcode: string | null; unit: "unidad";
}
const round2 = (n: number) => Math.round(n * 100) / 100;

export function barcodeOf(item: AlegraItem): string | null {
  const f = (item.customFields ?? []).find((c) => c.key === "barcode" || /c[oó]digo de barras/i.test(c.name ?? ""));
  const v = (f?.value ?? "").trim();
  return v ? v : null;
}

export function displayNameFor(alegraName: string): string {
  const limpio = parseProductName(alegraName).name;
  return normalizeProductName(limpio) === normalizeProductName(alegraName) ? limpio : alegraName;
}

export function itemToDraft(item: AlegraItem, itbisRate = ITBIS_RATE): ItemDraft {
  const lista = (item.price ?? []).find((p) => p.main) ?? (item.price ?? [])[0];
  const sinItbis = Number(lista?.price ?? 0);
  const cost = round2(Number(item.inventory?.unitCost ?? 0));
  return {
    alegraId: String(item.id),
    alegraName: item.name.trim(),
    displayName: displayNameFor(item.name.trim()),
    cost: Number.isFinite(cost) ? cost : 0,
    price: Number.isFinite(sinItbis) && sinItbis > 0 ? round2(sinItbis * (1 + itbisRate / 100)) : 0,
    active: item.status !== "inactive",
    barcode: barcodeOf(item),
    unit: "unidad",
  };
}
```

- [ ] **Step 4: Ver pasar** — 3 passed.

- [ ] **Step 5: Test del planificador (falla)**

```ts
import { describe, it, expect } from "vitest";
import { planProducts, type ExistingProduct } from "./plan-products";
import type { AlegraItem } from "./types";

const it_ = (over: Partial<AlegraItem>): AlegraItem => ({ id: "1", name: "ELTA MD UV SPORT BROAD SPECTRUM SPF 50", status: "active", price: [{ idPriceList: "1", name: "General", price: 1779.661, main: true }], inventory: { unitCost: 1156.78, warehouses: [] }, customFields: [{ key: "barcode", value: "390205022878" }], ...over });
const ex = (over: Partial<ExistingProduct>): ExistingProduct => ({ id: "p1", name: "Elta MD UV Sport Broad Spectrum SPF 50", alegraId: null, barcode: "0390205022878", cost: 1156.78, price: 2100, active: true, ...over });

describe("planProducts", () => {
  it("empareja por nombre normalizado, guarda alegra_id y no toca nada más si todo coincide", () => {
    const p = planProducts([it_({})], [ex({})], null);
    expect(p.actions[0]).toMatchObject({ kind: "update", productId: "p1", patch: { alegra_id: "1" } });
    expect(p.matchedByName).toBe(1);
    expect(p.priceChanged).toBe(0);
  });
  it("empareja por alegra_id aunque el nombre cambie, y renombra con nombre limpio", () => {
    const p = planProducts([it_({ name: "ELTA MD UV SPORT SPF 50 NUEVO" })], [ex({ alegraId: "1" })], null);
    expect(p.actions[0]).toMatchObject({ kind: "update", patch: { name: "Elta MD UV Sport SPF 50 Nuevo" } });
  });
  it("precio y costo mandan desde Alegra y se cuenta el cambio de precio", () => {
    const p = planProducts([it_({ price: [{ idPriceList: "1", name: "General", price: 2000, main: true }] })], [ex({ alegraId: "1" })], null);
    expect(p.actions[0]).toMatchObject({ kind: "update", patch: { price: 2360 } });
    expect(p.priceChanged).toBe(1);
  });
  it("código de barras: rellena si falta; si es el mismo en otra forma no toca; si es distinto lo reporta y no lo pisa", () => {
    expect(planProducts([it_({})], [ex({ alegraId: "1", barcode: null })], null).actions[0]).toMatchObject({ kind: "update", patch: { barcode: "390205022878" } });
    const mismo = planProducts([it_({})], [ex({ alegraId: "1", barcode: "0390205022878" })], null).actions[0] as { patch: Record<string, unknown> };
    expect(mismo.patch).not.toHaveProperty("barcode");
    const otro = planProducts([it_({})], [ex({ alegraId: "1", barcode: "8413400011422" })], null).actions[0] as { patch: Record<string, unknown>; barcodeConflict?: unknown };
    expect(otro.patch).not.toHaveProperty("barcode");
    expect(otro.barcodeConflict).toEqual({ stored: "8413400011422", alegra: "390205022878" });
  });
  it("empareja por código de barras cuando el nombre no coincide", () => {
    const p = planProducts([it_({ name: "OTRO NOMBRE" })], [ex({ barcode: "0390205022878" })], null);
    expect(p.actions[0]).toMatchObject({ kind: "update", productId: "p1" });
  });
  it("crea los que no existen y desactiva los que Alegra ya no trae (solo los enlazados)", () => {
    const p = planProducts([it_({ id: "2", name: "PRODUCTO NUEVO 30 ML", customFields: [] })], [ex({ alegraId: "1" }), ex({ id: "p3", name: "Manual Sin Alegra", alegraId: null, barcode: null })], null);
    expect(p.actions.find((a) => a.kind === "create")).toMatchObject({ draft: { alegraName: "PRODUCTO NUEVO 30 ML" } });
    expect(p.actions.find((a) => a.kind === "deactivate")).toMatchObject({ productId: "p1" });
    expect(p.actions.find((a) => a.kind === "deactivate" && a.productId === "p3")).toBeUndefined();
  });
  it("guardia anti-vacío: con menos del 50 % de la corrida anterior no desactiva nada", () => {
    const p = planProducts([it_({ id: "2", name: "SOLO UNO" })], [ex({ alegraId: "1" })], 1487);
    expect(p.guardTripped).toBe(true);
    expect(p.actions.some((a) => a.kind === "deactivate")).toBe(false);
  });
  it("nombre ambiguo (dos productos con el mismo nombre normalizado y sin alegra_id) → no adivina: crea", () => {
    const p = planProducts([it_({ customFields: [] })], [ex({ id: "a", barcode: null }), ex({ id: "b", barcode: null })], null);
    expect(p.actions[0]!.kind).toBe("create");
  });
});
```

- [ ] **Step 6: Ver fallar** — `npx vitest run src/features/alegra/plan-products.test.ts` → FAIL.

- [ ] **Step 7: Implementar `plan-products.ts`**

```ts
/**
 * Diferencia catálogo Alegra vs DermaLand. PURO.
 * Emparejado (spec §5.2): alegra_id → nombre normalizado ÚNICO → código de
 * barras (sameBarcode) → crear. Actualiza siempre costo/precio/activo/alegra_id;
 * nombre solo si Alegra lo cambió; código solo si falta (conflicto → reporte).
 * Desactiva (nunca borra) los enlazados que Alegra ya no trae, salvo que salte
 * la guardia anti-vacío (< 50 % de la corrida anterior).
 */
import { normalizeProductName } from "@/features/inventory/alegra-import";
import { sameBarcode } from "@/features/products/barcode-match";
import { itemToDraft, displayNameFor, type ItemDraft } from "./map-item";
import type { AlegraItem } from "./types";

export interface ExistingProduct { id: string; name: string; alegraId: string | null; barcode: string | null; cost: number; price: number; active: boolean; }
export interface UpdatePatch { alegra_id: string; cost?: number; price?: number; active?: boolean; name?: string; barcode?: string; }
export type ProductAction =
  | { kind: "create"; draft: ItemDraft }
  | { kind: "update"; productId: string; draft: ItemDraft; patch: UpdatePatch; barcodeConflict?: { stored: string; alegra: string } }
  | { kind: "deactivate"; productId: string; name: string }
  | { kind: "skip"; productId: string };
export interface ProductPlan { actions: ProductAction[]; matchedByName: number; priceChanged: number; guardTripped: boolean; }

export const EMPTY_GUARD_RATIO = 0.5;

export function planProducts(items: AlegraItem[], existing: ExistingProduct[], previousCount: number | null): ProductPlan {
  const byAlegraId = new Map(existing.filter((e) => e.alegraId).map((e) => [e.alegraId!, e]));
  const byName = new Map<string, ExistingProduct[]>();
  for (const e of existing) {
    if (e.alegraId) continue;
    const k = normalizeProductName(e.name);
    byName.set(k, [...(byName.get(k) ?? []), e]);
  }
  const libres = existing.filter((e) => !e.alegraId);
  const tomados = new Set<string>();
  const actions: ProductAction[] = [];
  let matchedByName = 0;
  let priceChanged = 0;

  for (const item of items) {
    const draft = itemToDraft(item);
    let e = byAlegraId.get(draft.alegraId);
    if (!e) {
      const hits = (byName.get(normalizeProductName(draft.alegraName)) ?? []).filter((x) => !tomados.has(x.id));
      if (hits.length === 1) { e = hits[0]; matchedByName++; }
    }
    if (!e && draft.barcode) {
      const hits = libres.filter((x) => !tomados.has(x.id) && sameBarcode(x.barcode, draft.barcode));
      if (hits.length === 1) e = hits[0];
    }
    if (!e) { actions.push({ kind: "create", draft }); continue; }
    tomados.add(e.id);

    const patch: UpdatePatch = { alegra_id: draft.alegraId };
    if (e.cost !== draft.cost) patch.cost = draft.cost;
    if (e.price !== draft.price) { patch.price = draft.price; priceChanged++; }
    if (e.active !== draft.active) patch.active = draft.active;
    if (normalizeProductName(e.name) !== normalizeProductName(draft.alegraName)) patch.name = displayNameFor(draft.alegraName);
    let barcodeConflict: { stored: string; alegra: string } | undefined;
    if (draft.barcode) {
      if (!e.barcode) patch.barcode = draft.barcode;
      else if (!sameBarcode(e.barcode, draft.barcode)) barcodeConflict = { stored: e.barcode, alegra: draft.barcode };
    }
    actions.push({ kind: "update", productId: e.id, draft, patch, ...(barcodeConflict ? { barcodeConflict } : {}) });
  }

  const guardTripped = previousCount !== null && previousCount > 0 && items.length < previousCount * EMPTY_GUARD_RATIO;
  if (!guardTripped) {
    const vistos = new Set(items.map((i) => String(i.id)));
    for (const e of existing) {
      if (e.alegraId && e.active && !vistos.has(e.alegraId)) actions.push({ kind: "deactivate", productId: e.id, name: e.name });
    }
  }
  return { actions, matchedByName, priceChanged, guardTripped };
}
```

- [ ] **Step 8: Ver pasar** — `npx vitest run src/features/alegra/` → todos passed; typecheck limpio.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/alegra/map-item.ts apps/web/src/features/alegra/map-item.test.ts apps/web/src/features/alegra/plan-products.ts apps/web/src/features/alegra/plan-products.test.ts
git commit -m "feat(alegra): mapeo de ítems y diff del catálogo (precio con ITBIS, código de barras, guardia anti-vacío)"
```

---

### Task 6: Filas de stock por almacén y mapeo de facturas

**Files:**
- Create: `apps/web/src/features/alegra/stock-rows.ts`
- Create: `apps/web/src/features/alegra/map-invoice.ts`
- Test: `apps/web/src/features/alegra/stock-rows.test.ts`
- Test: `apps/web/src/features/alegra/map-invoice.test.ts`

**Interfaces:**
- Consumes: `AlegraRow` (`@/features/inventory/alegra-import`), `AlegraItem`, `AlegraInvoice`.
- Produces:
  ```ts
  export const ALEGRA_WAREHOUSE_PRINCIPAL = "1"; export const ALEGRA_WAREHOUSE_SEGUNDA = "2";
  export function stockRowsFromItems(items: AlegraItem[], nameForAlegraId: (alegraId: string) => string | undefined): AlegraRow[];
  export interface InvoiceRow { alegra_id: string; alegra_client_id: string | null; client_name: string | null; client_document: string | null; client_document_type: "cedula" | "rnc" | "passport" | null; ncf: string | null; ncf_prefix: string | null; date: string; issued_at: string | null; status: "open" | "closed" | "void" | "draft"; payment_method: string | null; seller_name: string | null; station: string | null; warehouse_id: string | null; subtotal: number; discount: number; itbis: number; total: number; total_paid: number; balance: number; payments: unknown[]; raw: Record<string, unknown>; }
  export interface InvoiceItemRow { line_no: number; alegra_item_id: string | null; name: string; quantity: number; unit_price: number; discount: number; itbis: number; total: number; }
  export function invoiceToRows(inv: AlegraInvoice): { invoice: InvoiceRow; items: InvoiceItemRow[] };
  ```

- [ ] **Step 1: Tests (fallan)**

```ts
// stock-rows.test.ts
import { describe, it, expect } from "vitest";
import item from "./__fixtures__/item-elta-uv-sport.json";
import { stockRowsFromItems } from "./stock-rows";
import type { AlegraItem } from "./types";

describe("stockRowsFromItems", () => {
  it("usa el nombre de DermaLand del producto emparejado y las cantidades por almacén (1 = Principal, total = 1 + 2)", () => {
    const rows = stockRowsFromItems([item as AlegraItem], (id) => (id === "1288" ? "Elta MD UV Sport Broad Spectrum SPF 50" : undefined));
    expect(rows).toEqual([{ rowNumber: 1, name: "Elta MD UV Sport Broad Spectrum SPF 50", qtyPrincipal: 1, qtyTotal: 1 }]);
  });
  it("suma Villa Olga en el total y omite ítems sin inventario o sin producto emparejado", () => {
    const conCutis = { ...(item as AlegraItem), inventory: { warehouses: [{ id: "1", name: "Principal", availableQuantity: 3 }, { id: "2", name: "CUTIS", availableQuantity: 4 }] } };
    expect(stockRowsFromItems([conCutis], () => "X")[0]).toMatchObject({ qtyPrincipal: 3, qtyTotal: 7 });
    expect(stockRowsFromItems([{ ...(item as AlegraItem), inventory: null }], () => "X")).toEqual([]);
    expect(stockRowsFromItems([item as AlegraItem], () => undefined)).toEqual([]);
  });
  it("cantidades negativas o decimales se truncan a entero ≥ 0 (el motor rechaza negativos)", () => {
    const raro = { ...(item as AlegraItem), inventory: { warehouses: [{ id: "1", name: "Principal", availableQuantity: -2 }, { id: "2", name: "CUTIS", availableQuantity: 2.7 }] } };
    expect(stockRowsFromItems([raro], () => "X")[0]).toMatchObject({ qtyPrincipal: 0, qtyTotal: 2 });
  });
});
```
```ts
// map-invoice.test.ts
import { describe, it, expect } from "vitest";
import inv from "./__fixtures__/invoice-b02.json";
import { invoiceToRows } from "./map-invoice";
import type { AlegraInvoice } from "./types";

describe("invoiceToRows", () => {
  it("cabecera: NCF, prefijo, cliente con cédula, almacén, montos, pagos tal cual y raw sin items", () => {
    const { invoice, items } = invoiceToRows(inv as AlegraInvoice);
    expect(invoice).toMatchObject({ alegra_id: "14970", ncf: "B0200014482", ncf_prefix: "B02", date: "2026-09-05", issued_at: "2026-09-05T12:50:18-04:00", status: "closed", alegra_client_id: "6529", client_name: "Cliente Prueba", client_document: "40200000002", client_document_type: "cedula", warehouse_id: "2", payment_method: "cash", seller_name: "VENDEDORA", station: "VILLA OLGA", subtotal: 4233.05, itbis: 761.95, total: 4995, total_paid: 4995, balance: 0 });
    expect(invoice.payments).toHaveLength(1);
    expect(invoice.raw).not.toHaveProperty("items");
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ line_no: 1, alegra_item_id: "1095", name: "GLISODIN SKIN BRIGHTENING 60 CAPSULAS", quantity: 1, unit_price: 2911.02, discount: 0, itbis: 523.98, total: 3435 });
  });
  it("RNC → rnc; sin cliente → nulos; sin numberTemplate → ncf null; sin datetime → issued_at null", () => {
    const { invoice } = invoiceToRows({ ...(inv as AlegraInvoice), client: { id: "1", name: "Empresa", identification: "130984395", identificationType: "RNC" }, numberTemplate: null, datetime: undefined });
    expect(invoice).toMatchObject({ client_document_type: "rnc", ncf: null, ncf_prefix: null, issued_at: null });
    expect(invoiceToRows({ ...(inv as AlegraInvoice), client: null }).invoice.alegra_client_id).toBeNull();
  });
});
```

- [ ] **Step 2: Ver fallar** — `npx vitest run src/features/alegra/stock-rows.test.ts src/features/alegra/map-invoice.test.ts`.

- [ ] **Step 3: Implementar**

```ts
// stock-rows.ts
/**
 * Convierte el inventario por almacén de Alegra en las filas que entiende el
 * motor del importador (`buildImportPlan`): `qtyPrincipal` = almacén "1",
 * `qtyTotal` = "1" + "2". Se usa el NOMBRE DE DERMALAND del producto ya
 * emparejado (por eso recibe `nameForAlegraId`): el motor empareja por nombre
 * normalizado y así no depende de que Alegra y DermaLand escriban igual.
 */
import type { AlegraRow } from "@/features/inventory/alegra-import";
import type { AlegraItem } from "./types";

export const ALEGRA_WAREHOUSE_PRINCIPAL = "1";
export const ALEGRA_WAREHOUSE_SEGUNDA = "2";
const entero = (n: unknown) => Math.max(0, Math.trunc(Number(n) || 0));

export function stockRowsFromItems(items: AlegraItem[], nameForAlegraId: (alegraId: string) => string | undefined): AlegraRow[] {
  const rows: AlegraRow[] = [];
  for (const item of items) {
    const name = nameForAlegraId(String(item.id));
    const bodegas = item.inventory?.warehouses;
    if (!name || !bodegas) continue;
    const principal = entero(bodegas.find((w) => String(w.id) === ALEGRA_WAREHOUSE_PRINCIPAL)?.availableQuantity);
    const segunda = entero(bodegas.find((w) => String(w.id) === ALEGRA_WAREHOUSE_SEGUNDA)?.availableQuantity);
    rows.push({ rowNumber: rows.length + 1, name, qtyPrincipal: principal, qtyTotal: principal + segunda });
  }
  return rows;
}
```
```ts
// map-invoice.ts
/** Factura de Alegra → fila de `alegra_invoices` + líneas. PURO. */
import { documentOf } from "./map-contact";
import type { AlegraContact, AlegraInvoice } from "./types";

export interface InvoiceRow {
  alegra_id: string; alegra_client_id: string | null; client_name: string | null; client_document: string | null;
  client_document_type: "cedula" | "rnc" | "passport" | null; ncf: string | null; ncf_prefix: string | null;
  date: string; issued_at: string | null; status: AlegraInvoice["status"]; payment_method: string | null;
  seller_name: string | null; station: string | null; warehouse_id: string | null;
  subtotal: number; discount: number; itbis: number; total: number; total_paid: number; balance: number;
  payments: unknown[]; raw: Record<string, unknown>;
}
export interface InvoiceItemRow { line_no: number; alegra_item_id: string | null; name: string; quantity: number; unit_price: number; discount: number; itbis: number; total: number; }
const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

/** "2026-09-05 12:50:18" (hora de RD) → ISO con -04:00. */
export function issuedAtFrom(datetime: string | undefined): string | null {
  const m = (datetime ?? "").match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/);
  return m ? `${m[1]}T${m[2]}-04:00` : null;
}

export function invoiceToRows(inv: AlegraInvoice): { invoice: InvoiceRow; items: InvoiceItemRow[] } {
  const { items: lineas, ...resto } = inv;
  const doc = inv.client ? documentOf({ id: inv.client.id, name: inv.client.name, identification: inv.client.identification ?? null, status: "active", type: ["client"] } as AlegraContact) : { type: null, number: null };
  const invoice: InvoiceRow = {
    alegra_id: String(inv.id),
    alegra_client_id: inv.client ? String(inv.client.id) : null,
    client_name: inv.client?.name?.trim() || null,
    client_document: doc.number, client_document_type: doc.type,
    ncf: inv.numberTemplate?.fullNumber || null, ncf_prefix: inv.numberTemplate?.prefix || null,
    date: inv.date, issued_at: issuedAtFrom(inv.datetime), status: inv.status,
    payment_method: inv.paymentMethod ?? null, seller_name: inv.seller?.name ?? null, station: inv.station?.name ?? null,
    warehouse_id: inv.warehouse ? String(inv.warehouse.id) : null,
    subtotal: r2(inv.subtotal), discount: r2(inv.discount), itbis: r2(inv.tax), total: r2(inv.total), total_paid: r2(inv.totalPaid), balance: r2(inv.balance),
    payments: inv.payments ?? [], raw: resto as unknown as Record<string, unknown>,
  };
  const items = (lineas ?? []).map((l, i): InvoiceItemRow => ({
    line_no: i + 1, alegra_item_id: l.id ? String(l.id) : null, name: l.name,
    quantity: Number(l.quantity) || 0, unit_price: Number(l.price) || 0,
    discount: r2(l.discountAmount ?? 0), itbis: r2((l.tax ?? []).reduce((a, t) => a + (Number(t.amount) || 0), 0)), total: r2(l.total),
  }));
  return { invoice, items };
}
```

- [ ] **Step 4: Ver pasar** y typecheck. **Step 5: Commit**

```bash
git add apps/web/src/features/alegra/stock-rows.ts apps/web/src/features/alegra/stock-rows.test.ts apps/web/src/features/alegra/map-invoice.ts apps/web/src/features/alegra/map-invoice.test.ts
git commit -m "feat(alegra): filas de stock por almacén y mapeo de facturas"
```

---

### Task 7: Compartir la escritura de stock entre el script de migración y el sincronizador

**Files:**
- Create: `scripts/lib/supabase-rest.mts` (getAll / insert / patch / upsert, lectura de `.env.local`)
- Create: `scripts/lib/stock-apply.mts` (`aplicarAjuste`, `correr`, `fuentesPlan`, `verificar`, `loadDb` movidos tal cual desde `scripts/migrar-inventario-alegra.mts`)
- Modify: `scripts/migrar-inventario-alegra.mts` (importa de los dos módulos nuevos; sin cambio de comportamiento)

**Interfaces:**
- Produces:
  ```ts
  // supabase-rest.mts
  export function loadEnv(root: string): Record<string, string>;
  export function makeRest(url: string, key: string): { getAll<T>(pathQ: string): Promise<T[]>; insert<T>(table: string, row: Record<string, unknown>): Promise<T>; patch(table: string, filter: string, body: Record<string, unknown>): Promise<void>; upsert<T>(table: string, rows: Record<string, unknown>[], onConflict: string): Promise<T[]>; };
  // stock-apply.mts
  export const BUSINESS_ID: string;
  export function loadDb(rest): Promise<DbState>;               // { principal, segunda, whPrincipal, whSegunda, products, lots, brands, labs, cats }
  export function fuentesPlan(db: DbState): { products: PlanProduct[]; principalLots: PlanLot[]; cutisLots: PlanLot[] };
  export function aplicarPlan(rest, db: DbState, plan: ImportPlan, reference: string, userId: string, userName: string): Promise<Resultado>;
  export function verificar(rows: AlegraRow[], db: DbState): { comparados: number; cuadran: number; noCuadran: Array<...>; sinProducto: AlegraRow[] };
  ```
- `upsert` usa `Prefer: resolution=merge-duplicates,return=representation` y `?on_conflict=<cols>`.

- [ ] **Step 1: Crear `scripts/lib/supabase-rest.mts`** con `loadEnv` (misma lectura de `apps/web/.env.local` que hoy) y `makeRest` (mismas `getAll`/`insert`/`patch` de `migrar-inventario-alegra.mts` + `upsert`).
- [ ] **Step 2: Crear `scripts/lib/stock-apply.mts`** moviendo, sin cambiar lógica, `loadDb`, `fuentesPlan`, `aplicarAjuste`+`correr` (envueltos en `aplicarPlan`) y `verificar`. `aplicarPlan` recibe `userId/userName` en vez de constantes.
- [ ] **Step 3: Hacer que `migrar-inventario-alegra.mts` importe de ahí** y borrar las copias locales.
- [ ] **Step 4: Verificar que el dry-run del script de migración sigue dando el mismo resultado**

Run: `apps/web/node_modules/.bin/tsx scripts/migrar-inventario-alegra.mts "/Users/willianrodriguez/Downloads/Alegra - Valor de inventario - DermaLand - 05-09-2026..xlsx" | tail -8`
Expected: «Productos nuevos: 0», «No emparejados: 0», y el plan con 0 ajustes (ya está aplicado) salvo ventas del día.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/supabase-rest.mts scripts/lib/stock-apply.mts scripts/migrar-inventario-alegra.mts
git commit -m "refactor(scripts): escritura REST y aplicación de stock compartidas entre migración y sincronizador"
```

---

### Task 8: El script `alegra-sync.mts` (dry-run, apply, full, entities) y el registro de corridas

**Files:**
- Create: `scripts/alegra-sync.mts`
- Create: `scripts/test/alegra-live-test.mjs`

**Interfaces:**
- Consumes: Tasks 2–7. `AlegraClient` se importa desde `apps/web/src/server/services/alegra/client.ts` (tsx ignora `server-only`; si no, importar con `?raw`-free: mover `import "server-only"` bajo un `if (typeof window !== "undefined")` NO es válido; en su lugar, el script define `globalThis.__NEXT_SERVER_ONLY_OK` no existe… → **decisión:** el cliente NO lleva `import "server-only"` (es un módulo de red puro sin secretos embebidos; las credenciales entran por constructor). Quitar esa línea en Task 2 si se puso.)
- Produces: CLI
  ```
  tsx scripts/alegra-sync.mts                       # dry-run incremental, todas las entidades
  tsx scripts/alegra-sync.mts --apply               # escribe
  tsx scripts/alegra-sync.mts --apply --full        # carga inicial (todo el histórico de facturas)
  tsx scripts/alegra-sync.mts --entities=contacts,items,stock,invoices
  tsx scripts/alegra-sync.mts --since=2026-09-01    # facturas desde esa fecha (incremental)
  tsx scripts/alegra-sync.mts --trigger=cron|manual|cli
  ```
  Salida: consola + `backups/alegra-sync-<stamp>/reporte.json` + fila en `alegra_sync_runs` (siempre).

- [ ] **Step 1: Escribir el script**

```ts
#!/usr/bin/env -S npx tsx
/**
 * Sincronizador diario Alegra → DermaLand. Alegra manda; aquí solo se LEE de
 * Alegra y se escribe en DermaLand. Spec: docs/superpowers/specs/2026-09-05-alegra-sync-design.md
 * Orden: contactos → ítems (catálogo) → stock → facturas → registro de la corrida.
 * Un fallo en una entidad se anota y no detiene las demás. Dry-run por defecto.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AlegraClient, AlegraAuthError } from "../apps/web/src/server/services/alegra/client";
import type { AlegraContact, AlegraInvoice, AlegraItem } from "../apps/web/src/features/alegra/types";
import { planContacts, type ExistingClient } from "../apps/web/src/features/alegra/plan-contacts";
import { contactToSupplierDraft, isProvider } from "../apps/web/src/features/alegra/map-contact";
import { planProducts, type ExistingProduct } from "../apps/web/src/features/alegra/plan-products";
import { stockRowsFromItems } from "../apps/web/src/features/alegra/stock-rows";
import { invoiceToRows } from "../apps/web/src/features/alegra/map-invoice";
import { buildImportPlan } from "../apps/web/src/features/inventory/alegra-import";
import { normalizeDocument, normalizeEmail, normalizePhone } from "../apps/web/src/features/customers/customer-normalization";
import { nextSkuAfter, nextSkuFromSkus } from "../apps/web/src/features/products/product-sku";
import { parseProductName } from "../apps/web/src/lib/import/product-parser";
import { loadEnv, makeRest } from "./lib/supabase-rest";
import { BUSINESS_ID, loadDb, fuentesPlan, aplicarPlan, verificar } from "./lib/stock-apply";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OWNER_USER_ID = "2f707d5c-65c2-4388-b2b9-592693414b9f";
const USER_NAME = "Sincronizador Alegra";
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const APPLY = flag("apply");
const FULL = flag("full");
const ENTITIES = new Set((opt("entities") ?? "contacts,items,stock,invoices").split(","));
const TRIGGER = (opt("trigger") ?? "cli") as "cron" | "manual" | "cli";
const SINCE = opt("since");

const env = loadEnv(ROOT);
const rest = makeRest(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
if (!env.ALEGRA_EMAIL || !env.ALEGRA_TOKEN) throw new Error("Faltan ALEGRA_EMAIL / ALEGRA_TOKEN");
const alegra = new AlegraClient({ email: env.ALEGRA_EMAIL, token: env.ALEGRA_TOKEN });
const B = `business_id=eq.${BUSINESS_ID}`;
const pad = (n: number) => String(n).padStart(2, "0");
const now = new Date();
const reference = `ALEGRA-SYNC-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
const todayRD = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
const diasAtras = (n: number) => { const d = new Date(`${todayRD()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

type Counts = Record<string, Record<string, number>>;
const counts: Counts = {};
const errors: Array<{ entity: string; message: string }> = [];
const bump = (e: string, k: string, n = 1) => { counts[e] = counts[e] ?? {}; counts[e]![k] = (counts[e]![k] ?? 0) + n; };
const fail = (entity: string, e: unknown) => { const m = e instanceof Error ? e.message : String(e); errors.push({ entity, message: m }); console.error(`  ✗ ${entity}: ${m}`); };

console.log(APPLY ? "\n⚠️  MODO APLICAR" : "\n🔍 SIMULACIÓN (dry-run)", `· ${FULL ? "carga completa" : "incremental"} · entidades: ${[...ENTITIES].join(",")} · referencia ${reference}\n`);
const runId = await abrirCorrida();

// ── 1) Contactos ─────────────────────────────────────────────────────────
let contactos: AlegraContact[] = [];
if (ENTITIES.has("contacts")) {
  try {
    contactos = await alegra.listAll<AlegraContact>("contacts", { mode: "simple" });
    bump("contacts", "read", contactos.length);
    const existentes = await rest.getAll<Record<string, unknown>>(`clients?select=id,first_name,last_name,phone,whatsapp,email,document_number,phone_digits,whatsapp_digits,email_normalized,alegra_id,created_at,notes&${B}&deleted_at=is.null`);
    const existing: ExistingClient[] = existentes.map((r) => ({
      id: String(r.id), firstName: (r.first_name as string) ?? null, lastName: (r.last_name as string) ?? null,
      phoneDigits: (r.phone_digits as string) ?? null, whatsappDigits: (r.whatsapp_digits as string) ?? null, emailNormalized: (r.email_normalized as string) ?? null,
      createdAt: String(r.created_at), alegraId: (r.alegra_id as string) ?? null, alegraUpdatedAt: null,
      documentNormalized: r.document_number ? normalizeDocument(String(r.document_number)) : null,
      phone: (r.phone as string) ?? null, email: (r.email as string) ?? null, documentNumber: (r.document_number as string) ?? null,
    }));
    const acciones = planContacts(contactos, existing);
    for (const a of acciones) bump("contacts", a.kind);
    console.log(`Contactos: ${contactos.length} leídos · crear ${counts.contacts?.create ?? 0} · enlazar ${counts.contacts?.link ?? 0} · sin cambios ${counts.contacts?.skip ?? 0}`);
    if (APPLY) {
      for (const a of acciones) {
        try {
          if (a.kind === "create") {
            await insertarClienteConReintento(a.draft);
          } else if (a.kind === "link") {
            await rest.patch("clients", `id=eq.${a.clientId}&${B}`, { alegra_id: a.draft.alegraId, ...camposCliente(a.fill), updated_at: new Date().toISOString() });
          }
        } catch (e) { fail("contacts", e); }
      }
    }
    // Proveedores
    const proveedores = contactos.filter(isProvider).map(contactToSupplierDraft);
    bump("suppliers", "read", proveedores.length);
    if (APPLY && proveedores.length) {
      const actuales = await rest.getAll<{ id: string; name: string; rnc: string | null; alegra_id: string | null }>(`suppliers?select=id,name,rnc,alegra_id&${B}&deleted_at=is.null`);
      for (const p of proveedores) {
        const ya = actuales.find((s) => s.alegra_id === p.alegraId) ?? actuales.find((s) => !s.alegra_id && ((p.rnc && s.rnc === p.rnc) || s.name.trim().toLowerCase() === p.name.toLowerCase()));
        try {
          if (ya) { await rest.patch("suppliers", `id=eq.${ya.id}&${B}`, { alegra_id: p.alegraId, phone: p.phone, email: p.email, rnc: p.rnc ?? ya.rnc, updated_at: new Date().toISOString() }); bump("suppliers", "link"); }
          else { await rest.insert("suppliers", { business_id: BUSINESS_ID, name: p.name, rnc: p.rnc, phone: p.phone, email: p.email, alegra_id: p.alegraId }); bump("suppliers", "create"); }
        } catch (e) { fail("suppliers", e); }
      }
    }
  } catch (e) { fail("contacts", e); }
}

// ── 2) Ítems (catálogo) ─────────────────────────────────────────────────
let items: AlegraItem[] = [];
if (ENTITIES.has("items") || ENTITIES.has("stock")) {
  try {
    items = await alegra.listAll<AlegraItem>("items", { fields: "customFields" });
    bump("items", "read", items.length);
  } catch (e) { fail("items", e); }
}
if (ENTITIES.has("items") && items.length) {
  try {
    const productos = await rest.getAll<Record<string, unknown>>(`products?select=id,name,alegra_id,barcode,cost,price,active,sku&${B}&deleted_at=is.null`);
    const existing: ExistingProduct[] = productos.map((p) => ({ id: String(p.id), name: String(p.name), alegraId: (p.alegra_id as string) ?? null, barcode: (p.barcode as string) ?? null, cost: Number(p.cost) || 0, price: Number(p.price) || 0, active: Boolean(p.active) }));
    const previa = await ultimaCuenta("items");
    const plan = planProducts(items, existing, previa);
    for (const a of plan.actions) bump("items", a.kind);
    bump("items", "priceChanged", plan.priceChanged); bump("items", "matchedByName", plan.matchedByName);
    const conflictos = plan.actions.filter((a) => a.kind === "update" && a.barcodeConflict);
    console.log(`Productos: ${items.length} leídos · crear ${counts.items?.create ?? 0} · actualizar ${counts.items?.update ?? 0} (precio cambia en ${plan.priceChanged}) · desactivar ${counts.items?.deactivate ?? 0} · conflictos de código ${conflictos.length}${plan.guardTripped ? " · ⚠️ GUARDIA ANTI-VACÍO: no se desactiva nada" : ""}`);
    if (plan.guardTripped) errors.push({ entity: "items", message: `Alegra devolvió ${items.length} ítems, menos del 50 % de la corrida anterior (${previa}); no se desactivó nada.` });
    if (APPLY) {
      let sku = nextSkuFromSkus(productos.map((p) => p.sku as string));
      for (const a of plan.actions) {
        try {
          if (a.kind === "create") {
            const parsed = parseProductName(a.draft.alegraName);
            for (let intento = 0; intento < 10; intento++) {
              try {
                await rest.insert("products", { business_id: BUSINESS_ID, sku, name: a.draft.displayName, barcode: a.draft.barcode, description: null, unit: "unidad", pharmaceutical_form: parsed.pharmaceuticalForm ?? null, presentation: parsed.content?.toLowerCase() ?? null, requires_prescription: false, controlled: false, cost: a.draft.cost, price: a.draft.price, itbis_rate: 18, min_stock: 0, max_stock: 0, active: a.draft.active, sellable: true, alegra_id: a.draft.alegraId });
                sku = nextSkuAfter(sku); break;
              } catch (e) { if ((e as { code?: string }).code === "23505" && /sku/i.test((e as Error).message)) { sku = nextSkuAfter(sku); continue; } throw e; }
            }
          } else if (a.kind === "update") {
            await rest.patch("products", `id=eq.${a.productId}&${B}`, { ...a.patch, updated_at: new Date().toISOString() });
          } else if (a.kind === "deactivate") {
            await rest.patch("products", `id=eq.${a.productId}&${B}`, { active: false, updated_at: new Date().toISOString() });
          }
        } catch (e) { fail("items", e); }
      }
    }
    writeReport("productos-conflictos-codigo.json", conflictos);
  } catch (e) { fail("items", e); }
}

// ── 3) Stock ─────────────────────────────────────────────────────────────
if (ENTITIES.has("stock") && items.length) {
  try {
    const db = await loadDb(rest);
    const nombrePorAlegraId = new Map(db.products.filter((p) => p.alegra_id).map((p) => [String(p.alegra_id), p.name]));
    const rows = stockRowsFromItems(items, (id) => nombrePorAlegraId.get(id));
    const plan = buildImportPlan({ rows, ...fuentesPlan(db), cutisWarehouseId: db.whSegunda, zeroMissing: false, today: todayRD() });
    bump("stock", "rows", rows.length); bump("stock", "principal", plan.principal.length); bump("stock", "segunda", plan.cutis.length); bump("stock", "skipped", plan.skipped.length); bump("stock", "unmatched", plan.unmatched.length);
    console.log(`Stock: ${rows.length} productos · Principal ${plan.totals.principalBefore}→${plan.totals.principalAfter} (${plan.principal.length} ajustes) · Villa Olga ${plan.totals.cutisBefore}→${plan.totals.cutisAfter} (${plan.cutis.length} ajustes) · omitidos ${plan.skipped.length}`);
    for (const s of plan.skipped.slice(0, 20)) console.log(`    · omitido: ${s.name} — ${s.error}`);
    if (APPLY) {
      const res = await aplicarPlan(rest, db, plan, reference, OWNER_USER_ID, USER_NAME);
      bump("stock", "movements", res.movements); bump("stock", "failures", res.failures.length);
      for (const f of res.failures) fail("stock", `${f.productName}: ${f.error}`);
      const v = verificar(rows, await loadDb(rest));
      bump("stock", "verifiedOk", v.cuadran); bump("stock", "verifiedBad", v.noCuadran.length);
      console.log(`  Verificación: ${v.cuadran}/${v.comparados} cuadran`);
    }
  } catch (e) { fail("stock", e); }
}

// ── 4) Facturas ──────────────────────────────────────────────────────────
if (ENTITIES.has("invoices")) {
  try {
    const branchPorAlmacen = await mapaSucursales();
    const clientePorAlegraId = new Map((await rest.getAll<{ id: string; alegra_id: string }>(`clients?select=id,alegra_id&${B}&alegra_id=not.is.null`)).map((c) => [c.alegra_id, c.id]));
    const productoPorAlegraId = new Map((await rest.getAll<{ id: string; alegra_id: string }>(`products?select=id,alegra_id&${B}&alegra_id=not.is.null`)).map((p) => [p.alegra_id, p.id]));
    const query: Record<string, string> = { order_field: "date", order_direction: "ASC" };
    const lotes: Array<Record<string, string>> = FULL ? [query] : [{ ...query, date_afterOrNow: SINCE ?? diasAtras(3) }, { ...query, status: "open" }, { ...query, status: "void", date_afterOrNow: diasAtras(30) }];
    const vistas = new Set<string>();
    for (const q of lotes) {
      await alegra.listAll<AlegraInvoice>("invoices", q, async (page) => {
        const filas = page.filter((i) => !vistas.has(String(i.id)));
        for (const i of filas) vistas.add(String(i.id));
        bump("invoices", "read", filas.length);
        if (!APPLY || filas.length === 0) return;
        const cab = filas.map((i) => { const { invoice } = invoiceToRows(i); return { ...invoice, business_id: BUSINESS_ID, branch_id: invoice.warehouse_id ? branchPorAlmacen.get(invoice.warehouse_id) ?? null : null, client_id: invoice.alegra_client_id ? clientePorAlegraId.get(invoice.alegra_client_id) ?? null : null, synced_at: new Date().toISOString(), updated_at: new Date().toISOString(), warehouse_id: undefined }; });
        const guardadas = await rest.upsert<{ id: string; alegra_id: string }>("alegra_invoices", cab, "business_id,alegra_id");
        const idPorAlegra = new Map(guardadas.map((g) => [g.alegra_id, g.id]));
        const lineas = filas.flatMap((i) => invoiceToRows(i).items.map((l) => ({ ...l, business_id: BUSINESS_ID, invoice_id: idPorAlegra.get(String(i.id)), product_id: l.alegra_item_id ? productoPorAlegraId.get(l.alegra_item_id) ?? null : null })));
        if (lineas.length) await rest.upsert("alegra_invoice_items", lineas, "invoice_id,line_no");
        bump("invoices", "upserted", filas.length); bump("invoices", "lines", lineas.length);
      });
    }
    console.log(`Facturas: ${counts.invoices?.read ?? 0} leídas · ${counts.invoices?.upserted ?? 0} guardadas · ${counts.invoices?.lines ?? 0} líneas`);
  } catch (e) { fail("invoices", e); }
}

await cerrarCorrida(runId);

// ── helpers ──────────────────────────────────────────────────────────────
function camposCliente(f: Partial<{ phone: string | null; whatsapp: string | null; email: string | null; documentType: string | null; documentNumber: string | null }>) {
  const out: Record<string, unknown> = {};
  if (f.phone !== undefined) out.phone = f.phone; if (f.whatsapp !== undefined) out.whatsapp = f.whatsapp; if (f.email !== undefined) out.email = f.email;
  if (f.documentType !== undefined) out.document_type = f.documentType; if (f.documentNumber !== undefined) out.document_number = f.documentNumber;
  return out;
}
async function insertarClienteConReintento(d: import("../apps/web/src/features/alegra/map-contact").ClientDraft) {
  for (let intento = 0; intento < 3; intento++) {
    try {
      await rest.insert("clients", { business_id: BUSINESS_ID, customer_number: `CLI-${Math.floor(100000 + Math.random() * 900000)}`, first_name: d.firstName, last_name: d.lastName, phone: d.phone, whatsapp: d.whatsapp, email: d.email, document_type: d.documentType, document_number: d.documentNumber, source: "alegra", alegra_id: d.alegraId, tags: d.active ? [] : ["alegra-inactivo"] });
      return;
    } catch (e) { if ((e as { code?: string }).code !== "23505") throw e; }
  }
  throw new Error(`No se pudo asignar customer_number único para ${d.firstName} ${d.lastName}`);
}
async function mapaSucursales(): Promise<Map<string, string>> {
  const db = await loadDb(rest);
  return new Map([["1", db.principal.id], ["2", db.segunda.id]]);
}
async function ultimaCuenta(entity: string): Promise<number | null> {
  const runs = await rest.getAll<{ counts: Record<string, Record<string, number>> }>(`alegra_sync_runs?select=counts&${B}&ok=eq.true&dry_run=eq.false&order=started_at.desc&limit=1`);
  return runs[0]?.counts?.[entity]?.read ?? null;
}
async function abrirCorrida(): Promise<string | null> {
  try {
    const r = await rest.insert<{ id: string }>("alegra_sync_runs", { business_id: BUSINESS_ID, trigger: TRIGGER, mode: FULL ? "full" : "incremental", dry_run: !APPLY, reference, log_url: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null });
    return r.id;
  } catch (e) { fail("run", e); return null; }
}
async function cerrarCorrida(id: string | null) {
  const ok = errors.length === 0;
  const dir = path.join(ROOT, "backups", `alegra-sync-${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "reporte.json"), JSON.stringify({ apply: APPLY, full: FULL, reference, counts, errors, requests: alegra.requests }, null, 2));
  console.log(`\n${ok ? "✓" : "✗"} corrida ${APPLY ? "aplicada" : "simulada"} · ${alegra.requests} peticiones a Alegra · errores ${errors.length} · reporte en ${dir}`);
  if (id) { try { await rest.patch("alegra_sync_runs", `id=eq.${id}`, { finished_at: new Date().toISOString(), ok, counts, errors }); } catch (e) { fail("run", e); } }
  if (errors.some((e) => /credenciales|401/.test(e.message))) process.exit(2);
  process.exit(ok ? 0 : 1);
}
function writeReport(name: string, data: unknown) {
  const dir = path.join(ROOT, "backups", `alegra-sync-${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2));
}
```
Notas de implementación: (a) `loadDb` debe incluir `alegra_id` en el `select` de productos (ajustar en Task 7); (b) `rest.upsert` con `Prefer: resolution=merge-duplicates` sobre `alegra_invoices` requiere el `unique (business_id, alegra_id)` de Task 1; (c) el `onPage` de `listAll` puede ser `async` — el cliente debe `await`-lo (cambiar la firma a `onPage?: (rows, start) => void | Promise<void>` y `await onPage?.(…)` en Task 2 si no se hizo); (d) el catch de `AlegraAuthError` en contactos/ítems debe abortar toda la corrida: en `fail`, si `e instanceof AlegraAuthError`, llamar `cerrarCorrida` inmediatamente.

- [ ] **Step 2: Escribir la prueba en vivo de solo lectura**

```js
#!/usr/bin/env node
/** Comprueba credenciales y esquema esperado de Alegra sin escribir nada. */
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync("apps/web/.env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const auth = "Basic " + Buffer.from(`${env.ALEGRA_EMAIL}:${env.ALEGRA_TOKEN}`).toString("base64");
const g = async (p) => { const r = await fetch(`https://api.alegra.com/api/v1/${p}`, { headers: { Authorization: auth } }); if (!r.ok) throw new Error(`${p} → ${r.status}`); return r.json(); };
const fallos = [];
const check = (c, m) => { if (!c) fallos.push(m); };
const company = await g("company"); check(company.name === "DermaLand", `empresa inesperada: ${company.name}`);
const wh = await g("warehouses"); check(wh.some((w) => w.id === "1") && wh.some((w) => w.id === "2"), "faltan almacenes 1/2");
const [item] = await g("items?limit=1&fields=customFields"); check(item && "inventory" in item && Array.isArray(item.price), "ítem sin inventory/price");
const [contact] = await g("contacts?limit=1"); check(contact && "type" in contact, "contacto sin type");
const [inv] = await g("invoices?limit=1"); check(inv && inv.numberTemplate && Array.isArray(inv.items) && "balance" in inv, "factura sin numberTemplate/items/balance");
console.log(fallos.length ? `✗ ${fallos.join(" · ")}` : `✓ Alegra OK: ${company.name}, almacenes ${wh.map((w) => w.name).join("/")}`);
process.exit(fallos.length ? 1 : 0);
```

- [ ] **Step 3: Correr la prueba en vivo y el dry-run completo**

Run: `node scripts/test/alegra-live-test.mjs` → `✓ Alegra OK: DermaLand, almacenes Principal/CUTIS`.
Run: `apps/web/node_modules/.bin/tsx scripts/alegra-sync.mts --full 2>&1 | tee backups/alegra-sync-dryrun.log | tail -30`
Expected (orden de magnitud): contactos ~6 478 leídos, crear ~6 470, enlazar 2–4; productos ~1 487 leídos, actualizar ~1 400 (emparejados por nombre ≥ 1 380), crear < 60, desactivar 0–20; stock con pocos ajustes (hoy ya cuadra); facturas ~15 000 leídas; 0 errores; fila en `alegra_sync_runs` con `dry_run=true`.

- [ ] **Step 4: Revisar el dry-run con el dueño** (enseñar conteos, la lista de productos a crear/desactivar y los conflictos de código de barras). No aplicar sin su «ok».

- [ ] **Step 5: Commit**

```bash
git add scripts/alegra-sync.mts scripts/test/alegra-live-test.mjs
git commit -m "feat(alegra): script de sincronización (dry-run, apply, full, entidades) y prueba en vivo"
```

---

### Task 9: Carga inicial en producción y verificación

**Files:**
- Modify: `docs/estado-actual.md`, `CHANGELOG.md`, `package.json` (bump a `0.141.0`)
- Create: `docs/alegra-sync.md` (qué hace, cómo correrlo, qué NO hace, cómo revisar una corrida)

- [ ] **Step 1: Respaldo** — `node scripts/backup/rest-json-backup.mjs` → `✅ 57/57 tablas` (o más, por las 3 nuevas).
- [ ] **Step 2: Aplicar** — `apps/web/node_modules/.bin/tsx scripts/alegra-sync.mts --apply --full --trigger=cli 2>&1 | tee backups/alegra-sync-full.log | tail -40`
  Expected: `✓ corrida aplicada`, 0 errores (o solo conflictos de código reportados), verificación de stock N/N.
- [ ] **Step 3: Verificar releyendo la base** (conteos independientes):
```bash
node -e '
const fs=require("fs");const env=Object.fromEntries(fs.readFileSync("apps/web/.env.local","utf8").split("\n").filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,"")]}));
const H={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,Prefer:"count=exact"};const B="business_id=eq.00000000-0000-0000-0000-00000000d001";
const n=async q=>(await fetch(env.NEXT_PUBLIC_SUPABASE_URL+"/rest/v1/"+q+"&limit=1",{headers:H})).headers.get("content-range").split("/")[1];
(async()=>{console.log("clientes con alegra_id:",await n(`clients?select=id&${B}&alegra_id=not.is.null`),"| productos con alegra_id:",await n(`products?select=id&${B}&alegra_id=not.is.null`),"| facturas:",await n(`alegra_invoices?select=id&${B}`),"| líneas:",await n(`alegra_invoice_items?select=id&${B}`),"| facturas sin cliente:",await n(`alegra_invoices?select=id&${B}&client_id=is.null&alegra_client_id=not.is.null`),"| líneas sin producto:",await n(`alegra_invoice_items?select=id&${B}&product_id=is.null&alegra_item_id=not.is.null`))})();'
```
  Expected: clientes con alegra_id ≈ 6 478; productos con alegra_id ≈ 1 487; facturas ≈ 15 000; facturas sin cliente y líneas sin producto = 0 (o pocas, por contactos/ítems borrados en Alegra — listar en docs).
- [ ] **Step 4: Segunda corrida incremental en dry-run** — `tsx scripts/alegra-sync.mts` → todo «sin cambios»/0 ajustes de stock, salvo ventas del día. Prueba de idempotencia.
- [ ] **Step 5: Documentar y commitear**

CHANGELOG `## [0.141.0] - <fecha>` → «Agregado: Sincronizador Alegra → DermaLand (motor)…» con conteos reales de la carga; `docs/estado-actual.md` entrada con referencia `ALEGRA-SYNC-…`, conteos, conflictos y lo que quedó pendiente (Plan 2: workflow y pantallas). `docs/alegra-sync.md` con uso y reglas.
```bash
git add CHANGELOG.md package.json docs/estado-actual.md docs/alegra-sync.md
git commit -m "feat(alegra): carga inicial desde Alegra aplicada y documentada (v0.141.0)"
git push gitea main
```

---

## Self-review (hecho al escribir el plan)

- **Cobertura de la spec:** §4 cliente (T2), mapeos (T4–T6), planificadores (T4, T5), escritura reutilizando el motor de stock (T7, T8), `alegra_sync_runs` (T1, T8), orden y alcance de la corrida incl. guardia anti-vacío y 401 (T8), pruebas unitarias y en vivo (T2–T8), carga inicial verificada (T9). **Fuera de este plan:** §4 workflow + disparo manual y §6 pantallas → plan 2.
- **Placeholders:** ninguno; el único punto abierto es el nombre del campo `id` que devuelve `pickClientMatch` (nota en T4 paso 7) y el `await` del `onPage` (nota en T8).
- **Consistencia de tipos:** `ExistingClient` incluye `alegraUpdatedAt` (usado en T4 test y T8); `ItemDraft.displayName`/`alegraName` iguales en T5 y T8; `stockRowsFromItems` devuelve `AlegraRow` con `rowNumber` (T6) que `buildImportPlan` exige; `InvoiceRow.warehouse_id` se elimina antes del upsert (T8) porque la tabla usa `branch_id`.
