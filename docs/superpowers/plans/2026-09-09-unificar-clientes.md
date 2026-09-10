# Unificar clientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin fuse two duplicate client records (`clients` table) into one — reassigning their 7 dependent tables, filling blank fields on the survivor, and soft-deleting the loser — from a new `/clientes/unificar` screen, per the approved design in `docs/superpowers/specs/2026-09-09-unificar-clientes-design.md`.

**Architecture:** A pure bulk-duplicate scanner (buckets by document/phone/WhatsApp, reuses the existing pairwise matcher) backs `GET /api/customers/duplicates`. A new `merge_clients` Postgres function (SECURITY INVOKER, same style as `emit_sale_atomic`) does the atomic reassignment + soft-delete; `POST /api/customers/merge` wraps it with a `dryRun` mode (plain `count` queries, no writes) for the confirmation screen. Both routes are gated to `super_admin`/`admin` only. A client component renders the pair list → comparison → confirm flow.

**Tech Stack:** Next.js 15 App Router (Server Component page + Client Component view), Supabase Postgres (plpgsql RPC), Vitest + Testing Library.

## Global Constraints

- Multi-tenant: every query/RPC filters by `business_id` from the JWT (`auth_business_id()` in SQL, `ctx.businessId` in TS) — never from client input.
- Server-side role gate on every mutation: `authorizeRole` (or equivalent), independent of any UI hiding — per `riesgo-operativo.ts`'s own stated rule.
- Soft-delete only (`deleted_at = now()`), same as "Eliminar cliente" — no physical deletes of real client rows, ever.
- No new dependency. Reuse `ConfirmDialog`, `PageHeader`, `EmptyState`, `Badge`, `Card`, `useToast`, `fetchAllPages`, `authorizeRole`, `SupabaseRepositoryError`/`UserFacingRepositoryError`.
- One pair at a time (no batch merges), no field-by-field editing during merge, no undo beyond what "Eliminar cliente" already has — all explicitly out of scope in the approved spec.
- `CHANGELOG.md`/`package.json` version bump required before this ships (project's stated "regla de oro") — root `package.json` is currently `0.146.0`.
- Migration filename must sort after the last applied one: `supabase/migrations/20260909160000_businesses_account_number.sql` → this feature is `20260909170000_merge_clients.sql`.

---

### Task 1: `scanAllDuplicates` — bulk pairwise duplicate scan (pure logic)

**Files:**
- Modify: `apps/web/src/features/customers/utils/duplicate-detection.ts`
- Test: `apps/web/src/features/customers/utils/duplicate-detection.test.ts`

**Interfaces:**
- Consumes: `findPotentialDuplicateClients(candidate, existing, opts)`, `normalizeDocument`, `normalizePhone` (already in this file).
- Produces: `export interface DuplicatePair { a: Customer; b: Customer; confidence: DuplicateConfidence; reasons: string[] }` and `export function scanAllDuplicates(clients: Customer[]): DuplicatePair[]` — consumed by Task 4's API route.

- [ ] **Step 1: Write the failing tests**

Append to `duplicate-detection.test.ts` (reuses the existing `stubCustomer` helper already in this file):

```ts
import { scanAllDuplicates } from "./duplicate-detection";

describe("scanAllDuplicates — escaneo masivo (Unificar clientes)", () => {
  it("detecta un par por documento compartido", () => {
    const a = stubCustomer({ id: "a", documentNumber: "001-1111111-1" });
    const b = stubCustomer({ id: "b", documentNumber: "0011111111" });
    const pairs = scanAllDuplicates([a, b]);
    expect(pairs).toHaveLength(1);
    expect([pairs[0].a.id, pairs[0].b.id].sort()).toEqual(["a", "b"]);
    expect(pairs[0].confidence).toBe("high");
    expect(pairs[0].reasons).toContain("documento");
  });

  it("reporta cada par UNA sola vez, sin importar el orden de entrada", () => {
    const a = stubCustomer({ id: "a", phone: "8095550000" });
    const b = stubCustomer({ id: "b", phone: "8095550000" });
    expect(scanAllDuplicates([a, b])).toHaveLength(1);
    expect(scanAllDuplicates([b, a])).toHaveLength(1);
  });

  it("un cubo de 3 clientes con el mismo teléfono da 3 pares (todas las combinaciones)", () => {
    const a = stubCustomer({ id: "a", phone: "8095550000" });
    const b = stubCustomer({ id: "b", phone: "8095550000" });
    const c = stubCustomer({ id: "c", phone: "8095550000" });
    const pairs = scanAllDuplicates([a, b, c]);
    expect(pairs).toHaveLength(3);
    const keys = new Set(pairs.map((p) => [p.a.id, p.b.id].sort().join("|")));
    expect(keys).toEqual(new Set(["a|b", "a|c", "b|c"]));
  });

  it("cruza teléfono de uno contra WhatsApp del otro (mismo cubo)", () => {
    const a = stubCustomer({ id: "a", phone: "8095550000", whatsapp: "" });
    const b = stubCustomer({ id: "b", phone: "", whatsapp: "8095550000" });
    const pairs = scanAllDuplicates([a, b]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].reasons.join(",")).toContain("teléfono/WhatsApp");
  });

  it("NO cruza clientes de negocios distintos aunque compartan documento", () => {
    const a = stubCustomer({ id: "a", businessId: "biz_1", documentNumber: "00111111111" });
    const b = stubCustomer({ id: "b", businessId: "biz_2", documentNumber: "00111111111" });
    expect(scanAllDuplicates([a, b])).toHaveLength(0);
  });

  it("clientes sin documento/teléfono/WhatsApp no generan pares aunque compartan nombre", () => {
    const a = stubCustomer({ id: "a", firstName: "Ana", lastName: "Perez" });
    const b = stubCustomer({ id: "b", firstName: "Ana", lastName: "Perez" });
    expect(scanAllDuplicates([a, b])).toHaveLength(0);
  });

  it("clientes sin nada en común no generan pares", () => {
    const a = stubCustomer({ id: "a", documentNumber: "001", phone: "1", whatsapp: "" });
    const b = stubCustomer({ id: "b", documentNumber: "002", phone: "2", whatsapp: "" });
    expect(scanAllDuplicates([a, b])).toHaveLength(0);
  });

  it("ordena los pares por confianza descendente", () => {
    const high1 = stubCustomer({ id: "h1", documentNumber: "11111111111" });
    const high2 = stubCustomer({ id: "h2", documentNumber: "11111111111" });
    const med1 = stubCustomer({ id: "m1", firstName: "Juan", lastName: "Diaz" });
    const med2 = stubCustomer({ id: "m2", firstName: "Juan", lastName: "Diaz", phone: "8095551111" });
    const med3 = stubCustomer({ id: "m3", phone: "8095551111" });
    const pairs = scanAllDuplicates([med1, high1, med2, high2, med3]);
    expect(pairs[0].confidence).toBe("high");
    expect(pairs.every((p, i) => i === 0 || rank(pairs[i - 1].confidence) >= rank(p.confidence))).toBe(true);
    function rank(c: string) {
      return { high: 3, medium: 2, low: 1 }[c as "high" | "medium" | "low"];
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm vitest run src/features/customers/utils/duplicate-detection.test.ts`
Expected: FAIL — `scanAllDuplicates is not a function` / not exported.

- [ ] **Step 3: Implement `scanAllDuplicates`**

Add to `duplicate-detection.ts`, after `describeMatch`/`duplicateMessage`:

```ts
// ─── Escaneo masivo (Unificar clientes) ─────────────────────────────────────

export interface DuplicatePair {
  a: Customer;
  b: Customer;
  confidence: DuplicateConfidence;
  reasons: string[];
}

/**
 * Escanea TODA la base entre sí sin O(n²): agrupa en "cubos" por documento
 * normalizado y teléfono/WhatsApp normalizado (mismo cubo para ambos campos,
 * así se detecta el cruce teléfono↔WhatsApp), y dentro de cada cubo (2-5
 * fichas en la práctica) corre `findPotentialDuplicateClients` — mismas
 * reglas de confianza, sin reinventar el criterio.
 *
 * 🔴 A propósito NO hay cubo por nombre ni por email (el diseño aprobado solo
 * pide documento/teléfono/WhatsApp): un duplicado que solo comparta nombre o
 * solo email no aparece aquí, aunque `findPotentialDuplicateClients` sí lo
 * detectaría comparando UN candidato a la vez (como al crear un cliente).
 */
export function scanAllDuplicates(clients: Customer[]): DuplicatePair[] {
  const buckets = new Map<string, Customer[]>();
  const addToBucket = (key: string, c: Customer) => {
    if (!key) return;
    const list = buckets.get(key);
    if (list) list.push(c);
    else buckets.set(key, [c]);
  };

  for (const c of clients) {
    const doc = normalizeDocument(c.documentNumber);
    const phone = normalizePhone(c.phone);
    const wa = normalizePhone(c.whatsapp);
    if (doc) addToBucket(`doc:${doc}`, c);
    if (phone) addToBucket(`phone:${phone}`, c);
    if (wa) addToBucket(`phone:${wa}`, c);
  }

  const seen = new Set<string>();
  const pairs: DuplicatePair[] = [];

  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    for (const candidate of bucket) {
      const input: CustomerFormCandidate = {
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        phone: candidate.phone,
        whatsapp: candidate.whatsapp,
        email: candidate.email,
        documentNumber: candidate.documentNumber,
        birthDate: candidate.birthDate,
        businessId: candidate.businessId,
      };
      const { matches } = findPotentialDuplicateClients(input, bucket, {
        excludeClientId: candidate.id,
      });
      for (const match of matches) {
        const [idA, idB] = [candidate.id, match.customer.id].sort();
        const key = `${idA}|${idB}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const a = idA === candidate.id ? candidate : match.customer;
        const b = idA === candidate.id ? match.customer : candidate;
        pairs.push({ a, b, confidence: match.confidence, reasons: match.reasons });
      }
    }
  }

  const rank: Record<DuplicateConfidence, number> = { high: 3, medium: 2, low: 1 };
  pairs.sort((x, y) => rank[y.confidence] - rank[x.confidence]);
  return pairs;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run src/features/customers/utils/duplicate-detection.test.ts`
Expected: PASS (all new + existing tests in this file).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/customers/utils/duplicate-detection.ts apps/web/src/features/customers/utils/duplicate-detection.test.ts
git commit -m "feat(clientes): escaneo masivo de duplicados (scanAllDuplicates)"
```

---

### Task 2: `merge_clients` SQL function + content guard test

**Files:**
- Create: `supabase/migrations/20260909170000_merge_clients.sql`
- Test: `apps/web/src/server/services/customers/merge-clients-migration.test.ts`

**Interfaces:**
- Consumes: nothing new (references existing tables `clients`, `alegra_invoices`, `ar_promises`, `client_auth_links`, `electronic_invoices`, `electronic_invoices_legacy_20260906`, `proformas`, `web_orders`, all confirmed to have `business_id` and none with a unique index on the reassigned column, verified live 2026-09-09).
- Produces: Postgres function `public.merge_clients(p_primary_id uuid, p_duplicate_id uuid) returns jsonb`, called by Task 3's `mergeClients()`. The `MERGE_IMPACT_TABLES` constant this test imports is created in Task 3 — do Task 3's Step 3 (constant only) first if running tasks out of order, or just write this test file after Task 3 exists.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260909170000_merge_clients.sql`:

```sql
-- Unificar clientes (diseño aprobado 09/09/2026,
-- docs/superpowers/specs/2026-09-09-unificar-clientes-design.md).
--
-- `merge_clients` fusiona `p_duplicate_id` DENTRO de `p_primary_id`: reasigna
-- las 7 tablas con FK a `clients`, rellena los huecos del sobreviviente con
-- los datos del duplicado (coalesce, NUNCA sobreescribe lo que ya tenía) y
-- deja el duplicado con `deleted_at` (mismo soft-delete que "Eliminar
-- cliente" — no se borra físicamente).
--
-- SECURITY INVOKER (mismo patrón que emit_sale_atomic/void_sale_atomic,
-- 0029): corre con privilegios del invocador, RLS aplica, el tenant sale de
-- `auth_business_id()` (JWT), nunca de un parámetro. `search_path` fijado
-- desde el día uno (mismo endurecimiento que 0035_dl14_function_search_path).
--
-- Ninguna de las 7 columnas reasignadas tiene índice único (verificado
-- contra la base real 09/09/2026: solo hay uniques compuestos sobre OTRAS
-- columnas de esas tablas) — reasignar en bloque no puede chocar con
-- unique_violation.
create or replace function public.merge_clients(
  p_primary_id uuid,
  p_duplicate_id uuid
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_biz uuid := auth_business_id();
  v_primary public.clients%rowtype;
  v_duplicate public.clients%rowtype;
  v_moved jsonb := '{}'::jsonb;
  v_n int;
begin
  if v_biz is null then
    raise exception 'No autenticado (sin business_id)' using errcode = '28000';
  end if;
  if p_primary_id = p_duplicate_id then
    raise exception 'No se puede unificar un cliente consigo mismo' using errcode = 'P0003';
  end if;

  select * into v_primary from public.clients
    where id = p_primary_id and business_id = v_biz and deleted_at is null
    for update;
  if not found then
    raise exception 'Cliente sobreviviente no encontrado o no pertenece al negocio' using errcode = 'P0002';
  end if;

  select * into v_duplicate from public.clients
    where id = p_duplicate_id and business_id = v_biz and deleted_at is null
    for update;
  if not found then
    raise exception 'Cliente duplicado no encontrado, no pertenece al negocio o ya fue unificado' using errcode = 'P0002';
  end if;

  update public.alegra_invoices set client_id = p_primary_id
    where client_id = p_duplicate_id and business_id = v_biz;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('alegra_invoices', v_n);

  update public.ar_promises set client_id = p_primary_id
    where client_id = p_duplicate_id and business_id = v_biz;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('ar_promises', v_n);

  update public.client_auth_links set client_id = p_primary_id
    where client_id = p_duplicate_id and business_id = v_biz;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('client_auth_links', v_n);

  update public.electronic_invoices set customer_id = p_primary_id
    where customer_id = p_duplicate_id and business_id = v_biz;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('electronic_invoices', v_n);

  update public.electronic_invoices_legacy_20260906 set customer_id = p_primary_id
    where customer_id = p_duplicate_id and business_id = v_biz;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('electronic_invoices_legacy_20260906', v_n);

  update public.proformas set customer_id = p_primary_id
    where customer_id = p_duplicate_id and business_id = v_biz;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('proformas', v_n);

  update public.web_orders set client_id = p_primary_id
    where client_id = p_duplicate_id and business_id = v_biz;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('web_orders', v_n);

  -- Rellenar huecos del sobreviviente con el duplicado — nunca sobreescribe.
  -- Documento y tipo de documento viajan JUNTOS (un tipo no debe quedar
  -- huérfano de un número que vino de la otra ficha).
  update public.clients set
    phone = coalesce(v_primary.phone, v_duplicate.phone),
    whatsapp = coalesce(v_primary.whatsapp, v_duplicate.whatsapp),
    email = coalesce(v_primary.email, v_duplicate.email),
    birth_date = coalesce(v_primary.birth_date, v_duplicate.birth_date),
    address = coalesce(v_primary.address, v_duplicate.address),
    document_number = coalesce(v_primary.document_number, v_duplicate.document_number),
    document_type = case
      when v_primary.document_number is null then coalesce(v_primary.document_type, v_duplicate.document_type)
      else v_primary.document_type
    end,
    updated_at = now()
  where id = p_primary_id and business_id = v_biz;

  update public.clients set deleted_at = now(), updated_at = now()
    where id = p_duplicate_id and business_id = v_biz;

  return jsonb_build_object(
    'primaryId', p_primary_id,
    'duplicateId', p_duplicate_id,
    'moved', v_moved
  );
end;
$$;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Write the guard test (before applying the migration anywhere)**

Create `apps/web/src/server/services/customers/merge-clients-migration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MERGE_IMPACT_TABLES } from "./merge-clients";

/**
 * `merge_clients` no se puede aplicar desde aquí —la aplica el dueño o se
 * aplica vía MCP, nunca en un test— así que se prueba como se prueban las
 * migraciones en esta casa (`migracion-desglose.test.ts`): leyendo el SQL y
 * atándolo a `MERGE_IMPACT_TABLES`, la MISMA lista que usa el dry-run
 * (Task 3). Si alguien agrega una tabla a la lista TypeScript y olvida
 * tocar el SQL —o viceversa— esta prueba lo dice; un grep manual no lo
 * habría notado.
 */
const MIGRACIONES = resolve(process.cwd(), "..", "..", "supabase", "migrations");
const SQL = readFileSync(resolve(MIGRACIONES, "20260909170000_merge_clients.sql"), "utf8");

const sinComentarios = (sql: string) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
const unaLinea = (sql: string) => sinComentarios(sql).replace(/\s+/g, " ");

describe("merge_clients — el SQL cubre EXACTAMENTE las 7 tablas de MERGE_IMPACT_TABLES", () => {
  const contenido = unaLinea(SQL);

  it("define la función con el nombre y la firma esperados", () => {
    expect(contenido).toContain(
      "create or replace function public.merge_clients( p_primary_id uuid, p_duplicate_id uuid ) returns jsonb",
    );
  });

  it.each(MERGE_IMPACT_TABLES)(
    "reasigna $table.$column de duplicado a primario, filtrado por negocio",
    ({ table, column }) => {
      expect(contenido).toContain(
        `update public.${table} set ${column} = p_primary_id where ${column} = p_duplicate_id and business_id = v_biz;`,
      );
    },
  );

  it("no reasigna ninguna tabla que no esté en MERGE_IMPACT_TABLES", () => {
    const asignaciones = [...contenido.matchAll(/update public\.(\w+) set \w+ = p_primary_id/g)].map(
      (m) => m[1],
    );
    expect(new Set(asignaciones)).toEqual(new Set(MERGE_IMPACT_TABLES.map((t) => t.table)));
  });

  it("es SECURITY INVOKER (no declara `security definer`) y fija search_path", () => {
    expect(contenido).not.toContain("security definer");
    expect(contenido).toContain("set search_path = public");
  });

  it("deja el duplicado con soft-delete, no borrado físico", () => {
    expect(contenido).toContain(
      "update public.clients set deleted_at = now(), updated_at = now() where id = p_duplicate_id and business_id = v_biz;",
    );
    expect(contenido).not.toMatch(/delete from public\.clients/);
  });

  it("rellena teléfono/whatsapp/email/fecha de nacimiento/dirección/documento con coalesce", () => {
    for (const campo of ["phone", "whatsapp", "email", "birth_date", "address", "document_number"]) {
      expect(contenido).toContain(`${campo} = coalesce(v_primary.${campo}, v_duplicate.${campo})`);
    }
  });
});
```

Run: `cd apps/web && pnpm vitest run src/server/services/customers/merge-clients-migration.test.ts`
Expected: FAIL — `Cannot find module './merge-clients'` (Task 3 not done yet). This is expected; proceed to Task 3, then return and re-run.

- [ ] **Step 3: Commit** (after Task 3 makes this pass — see Task 3 Step 5)

```bash
git add supabase/migrations/20260909170000_merge_clients.sql apps/web/src/server/services/customers/merge-clients-migration.test.ts
git commit -m "feat(clientes): migración merge_clients (SQL) + guardián de contenido"
```

---

### Task 3: `server/services/customers/merge-clients.ts` — dry-run counts + RPC wrapper

**Files:**
- Create: `apps/web/src/server/services/customers/merge-clients.ts`
- Test: `apps/web/src/server/services/customers/merge-clients.test.ts`

**Interfaces:**
- Consumes: `AnySupabase`, `SupabaseRepositoryError`, `UserFacingRepositoryError` from `@/server/repositories/supabase/client`.
- Produces:
  - `export const MERGE_IMPACT_TABLES: ReadonlyArray<{ table: string; column: string }>` (consumed by Task 2's guard test and Task 6's UI labels).
  - `export interface MergeImpact { table: string; count: number }`
  - `export async function dryRunMergeImpact(sb: AnySupabase, businessId: string, duplicateId: string): Promise<MergeImpact[]>`
  - `export interface MergeClientsResult { primaryId: string; duplicateId: string; moved: MergeImpact[] }`
  - `export async function mergeClients(sb: AnySupabase, primaryId: string, duplicateId: string): Promise<MergeClientsResult>` — consumed by Task 5's `POST /api/customers/merge`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/server/services/customers/merge-clients.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { dryRunMergeImpact, mergeClients, MERGE_IMPACT_TABLES } from "./merge-clients";

function fakeCountBuilder(countsByTable: Record<string, number>) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () =>
            Promise.resolve({ count: countsByTable[table] ?? 0, error: null }),
        }),
      }),
    }),
  };
}

describe("dryRunMergeImpact", () => {
  it("cuenta las 7 tablas y devuelve una fila por tabla, en el orden de MERGE_IMPACT_TABLES", async () => {
    const sb = fakeCountBuilder({
      alegra_invoices: 14,
      ar_promises: 3,
      client_auth_links: 0,
      electronic_invoices: 0,
      electronic_invoices_legacy_20260906: 0,
      proformas: 0,
      web_orders: 1,
    });
    const impacts = await dryRunMergeImpact(sb, "biz-1", "dup-1");
    expect(impacts).toEqual(
      MERGE_IMPACT_TABLES.map(({ table }) => ({
        table,
        count: { alegra_invoices: 14, ar_promises: 3, web_orders: 1 }[table] ?? 0,
      })),
    );
  });

  it("propaga un error de Supabase como SupabaseRepositoryError", async () => {
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ count: null, error: { message: "boom" } }),
          }),
        }),
      }),
    };
    await expect(dryRunMergeImpact(sb, "biz-1", "dup-1")).rejects.toThrow();
  });
});

describe("mergeClients", () => {
  it("llama al RPC con los ids y mapea `moved` al mismo shape que el dry run", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { primaryId: "p1", duplicateId: "d1", moved: { alegra_invoices: 14, ar_promises: 3 } },
      error: null,
    });
    const sb = { rpc };
    const result = await mergeClients(sb, "p1", "d1");
    expect(rpc).toHaveBeenCalledWith("merge_clients", { p_primary_id: "p1", p_duplicate_id: "d1" });
    expect(result.moved.find((m) => m.table === "alegra_invoices")?.count).toBe(14);
    expect(result.moved.find((m) => m.table === "web_orders")?.count).toBe(0);
  });

  it("P0002 (no encontrado / ya unificado) se traduce a mensaje de usuario", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "P0002: no encontrado" } }) };
    await expect(mergeClients(sb, "p1", "d1")).rejects.toThrow(/no encontrado|pertenece|unificado/i);
  });

  it("P0003 (mismo cliente) se traduce a mensaje de usuario", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "P0003: no se puede" } }) };
    await expect(mergeClients(sb, "p1", "p1")).rejects.toThrow(/consigo mismo/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm vitest run src/server/services/customers/merge-clients.test.ts`
Expected: FAIL — module `./merge-clients` doesn't exist yet.

- [ ] **Step 3: Implement**

Create `apps/web/src/server/services/customers/merge-clients.ts`:

```ts
import "server-only";
import {
  SupabaseRepositoryError,
  UserFacingRepositoryError,
  type AnySupabase,
} from "@/server/repositories/supabase/client";

/**
 * Las 7 tablas con FK a `clients` que "Unificar clientes" reasigna. ÚNICA
 * lista — la usan tanto el dry-run (conteos de lectura) como el guardián de
 * contenido de la migración SQL (`merge-clients-migration.test.ts`): si se
 * agrega una tabla aquí sin tocar el SQL, ese test lo dice.
 */
export const MERGE_IMPACT_TABLES: ReadonlyArray<{ table: string; column: string }> = [
  { table: "alegra_invoices", column: "client_id" },
  { table: "ar_promises", column: "client_id" },
  { table: "client_auth_links", column: "client_id" },
  { table: "electronic_invoices", column: "customer_id" },
  { table: "electronic_invoices_legacy_20260906", column: "customer_id" },
  { table: "proformas", column: "customer_id" },
  { table: "web_orders", column: "client_id" },
];

export interface MergeImpact {
  table: string;
  count: number;
}

/** Cuenta, SIN escribir, cuántas filas de cada tabla se moverían. */
export async function dryRunMergeImpact(
  sb: AnySupabase,
  businessId: string,
  duplicateId: string,
): Promise<MergeImpact[]> {
  const impacts: MergeImpact[] = [];
  for (const { table, column } of MERGE_IMPACT_TABLES) {
    const { count, error } = await sb
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(column, duplicateId)
      .eq("business_id", businessId);
    if (error) throw new SupabaseRepositoryError(`customer.mergeDryRun:${table}`, error);
    impacts.push({ table, count: count ?? 0 });
  }
  return impacts;
}

export interface MergeClientsResult {
  primaryId: string;
  duplicateId: string;
  moved: MergeImpact[];
}

/** Fusiona `duplicateId` dentro de `primaryId` vía el RPC atómico `merge_clients`. */
export async function mergeClients(
  sb: AnySupabase,
  primaryId: string,
  duplicateId: string,
): Promise<MergeClientsResult> {
  const { data, error } = await sb.rpc("merge_clients", {
    p_primary_id: primaryId,
    p_duplicate_id: duplicateId,
  });
  if (error) {
    if (/no se puede unificar|P0003/i.test(error.message)) {
      throw new UserFacingRepositoryError("No se puede unificar un cliente consigo mismo.");
    }
    if (/no encontrado|P0002/i.test(error.message)) {
      throw new UserFacingRepositoryError(
        "Cliente no encontrado, no pertenece al negocio o ya fue unificado.",
      );
    }
    throw new SupabaseRepositoryError("customer.merge", error);
  }
  const movedRaw = (data?.moved ?? {}) as Record<string, number>;
  const moved: MergeImpact[] = MERGE_IMPACT_TABLES.map(({ table }) => ({
    table,
    count: Number(movedRaw[table] ?? 0),
  }));
  return { primaryId, duplicateId, moved };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run src/server/services/customers/merge-clients.test.ts src/server/services/customers/merge-clients-migration.test.ts`
Expected: PASS — both this task's tests AND Task 2's guard test (which only needed this file's `MERGE_IMPACT_TABLES` to exist).

- [ ] **Step 5: Commit** (this closes out Task 2 as well)

```bash
git add apps/web/src/server/services/customers/merge-clients.ts apps/web/src/server/services/customers/merge-clients.test.ts supabase/migrations/20260909170000_merge_clients.sql apps/web/src/server/services/customers/merge-clients-migration.test.ts
git commit -m "feat(clientes): servicio de fusión de clientes (dry-run + RPC merge_clients)"
```

---

### Task 4: `GET /api/customers/duplicates` + export `ROLES_CON_RIESGO`

**Files:**
- Modify: `apps/web/src/features/auth/riesgo-operativo.ts`
- Create: `apps/web/src/app/api/customers/duplicates/route.ts`
- Test: `apps/web/src/app/api/customers/duplicates/route.test.ts`

**Interfaces:**
- Consumes: `scanAllDuplicates` (Task 1), `authorizeRole` (`@/server/auth/require-role`), `fetchAllPages` (`@/server/repositories/supabase/pagination`), `clientRowToTs` (`@/server/repositories/supabase/mappers`), `getClient`/`toUserFacingMessage`/`SupabaseRepositoryError` (`@/server/repositories/supabase/client`), `env` (`@/lib/env`).
- Produces: `GET /api/customers/duplicates` → `200 { pairs: DuplicatePair[] }` (admin-only); consumed by Task 6's client fetch helper. Also exports `ROLES_CON_RIESGO` from `riesgo-operativo.ts`, consumed by Task 5.

- [ ] **Step 1: Export `ROLES_CON_RIESGO`**

In `apps/web/src/features/auth/riesgo-operativo.ts`, change:
```ts
const ROLES_CON_RIESGO: ReadonlyArray<UserRole> = ["super_admin", "admin"];
```
to:
```ts
export const ROLES_CON_RIESGO: ReadonlyArray<UserRole> = ["super_admin", "admin"];
```
(No test change needed — `riesgo-operativo.test.ts` only imports `puedeAccionDeRiesgo`, still exported unchanged.)

- [ ] **Step 2: Write the failing route test**

Create `apps/web/src/app/api/customers/duplicates/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authorizeRole = vi.fn();
const env = { DATA_SOURCE: "supabase" };

function fakeClientsBuilder(rows: unknown[]) {
  const q = {
    select: () => q,
    eq: () => q,
    is: () => q,
    order: () => q,
    range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
  };
  return q;
}

vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/server/auth/require-role", () => ({ authorizeRole }));

const ROW = (over: Record<string, unknown>) => ({
  id: "id",
  business_id: "biz-1",
  customer_number: "CLI-1",
  first_name: "Ana",
  last_name: "Perez",
  document_type: null,
  document_number: null,
  phone: null,
  whatsapp: null,
  email: null,
  birth_date: null,
  address: null,
  city: null,
  province: null,
  source: "manual",
  tags: [],
  default_billing_type: "consumo",
  skin_type: "not_specified",
  total_spent: 0,
  total_orders: 0,
  last_visit_at: null,
  notes: null,
  consents: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  deleted_at: null,
  ...over,
});

let rows: unknown[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createServer: async () => fakeClientsBuilder(rows),
}));

const { GET } = await import("./route");
const pedir = () => GET(new NextRequest("http://localhost/api/customers/duplicates"));

beforeEach(() => {
  env.DATA_SOURCE = "supabase";
  authorizeRole.mockReset().mockResolvedValue({ ok: true, session: { businessId: "biz-1" } });
  rows = [];
});

describe("GET /api/customers/duplicates", () => {
  it("403 si el rol no puede (authorizeRole se llama con roles de riesgo)", async () => {
    authorizeRole.mockResolvedValue({
      ok: false,
      res: new Response(JSON.stringify({ error: "no" }), { status: 403 }),
    });
    const res = await pedir();
    expect(res.status).toBe(403);
  });

  it("devuelve los pares detectados entre TODOS los clientes activos del negocio", async () => {
    rows = [
      ROW({ id: "a", document_number: "00111111111" }),
      ROW({ id: "b", document_number: "00111111111" }),
      ROW({ id: "c", document_number: "00222222222" }),
    ];
    const res = await pedir();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pairs).toHaveLength(1);
    expect([body.pairs[0].a.id, body.pairs[0].b.id].sort()).toEqual(["a", "b"]);
  });

  it("409 en modo mock (solo disponible con Supabase)", async () => {
    env.DATA_SOURCE = "mock";
    const res = await pedir();
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run src/app/api/customers/duplicates/route.test.ts`
Expected: FAIL — route file doesn't exist.

- [ ] **Step 4: Implement the route**

Create `apps/web/src/app/api/customers/duplicates/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import type { Customer } from "@/types";
import { authorizeRole } from "@/server/auth/require-role";
import { ROLES_CON_RIESGO } from "@/features/auth/riesgo-operativo";
import { createServer } from "@/lib/supabase/server";
import { clientRowToTs } from "@/server/repositories/supabase/mappers";
import { fetchAllPages } from "@/server/repositories/supabase/pagination";
import { scanAllDuplicates } from "@/features/customers/utils/duplicate-detection";

/**
 * GET /api/customers/duplicates — escaneo COMPLETO de posibles duplicados
 * del negocio, para la pantalla `/clientes/unificar`. Admin-only: barre
 * TODA la base (6 525 clientes hoy — sin caché v1, YAGNI, ver diseño
 * aprobado) así que no es algo para pedir en cada render de un listado.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Unificar clientes solo está disponible en modo Supabase." },
      { status: 409 },
    );
  }
  const auth = await authorizeRole(ROLES_CON_RIESGO);
  if (!auth.ok) return auth.res;

  const businessId = auth.session.businessId;
  const sb = await createServer();
  if (!sb) {
    return NextResponse.json({ error: "No se pudo conectar con la base." }, { status: 502 });
  }

  const rows = await fetchAllPages(async (from, to) => {
    const { data, error } = await sb
      .from("clients")
      .select("*")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return data ?? [];
  });

  const clients: Customer[] = rows.map(clientRowToTs);
  const pairs = scanAllDuplicates(clients);

  return NextResponse.json({ pairs }, { headers: { "Cache-Control": "no-store" } });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run src/app/api/customers/duplicates/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/auth/riesgo-operativo.ts apps/web/src/app/api/customers/duplicates/
git commit -m "feat(clientes): GET /api/customers/duplicates (escaneo admin-only)"
```

---

### Task 5: `POST /api/customers/merge` (dry-run + real merge + auditoría)

**Files:**
- Create: `apps/web/src/app/api/customers/merge/route.ts`
- Test: `apps/web/src/app/api/customers/merge/route.test.ts`
- Modify: `apps/web/src/features/admin/audit-labels.ts`

**Interfaces:**
- Consumes: `dryRunMergeImpact`, `mergeClients` (Task 3), `authorizeRole`, `ROLES_CON_RIESGO` (Task 4), `isUuid` (`@/server/repositories/supabase/sanitize`), `getRepositories().audit.log` (`@/server/repositories`), `getRepoContext`/`sessionToRepoContext`, `createServer`.
- Produces: `POST /api/customers/merge` body `{ primaryId, duplicateId, dryRun?: boolean }` → `200 { moved: MergeImpact[] }`; consumed by Task 6.

- [ ] **Step 1: Add the audit label**

In `apps/web/src/features/admin/audit-labels.ts`, add to `ACTION_LABELS` (alphabetical among the `c`s):
```ts
  "customer.merge": "Clientes unificados",
```

- [ ] **Step 2: Write the failing route test**

Create `apps/web/src/app/api/customers/merge/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authorizeRole = vi.fn();
const getRepoContext = vi.fn(async () => ({ businessId: "biz-1", userId: "u1", userName: "Ana Admin" }));
const dryRunMergeImpact = vi.fn();
const mergeClients = vi.fn();
const auditLog = vi.fn();
const env = { DATA_SOURCE: "supabase" };

vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/server/auth/require-role", () => ({ authorizeRole }));
vi.mock("@/server/auth/context", () => ({ getRepoContext }));
vi.mock("@/lib/supabase/server", () => ({ createServer: async () => ({}) }));
vi.mock("@/server/services/customers/merge-clients", () => ({ dryRunMergeImpact, mergeClients }));
vi.mock("@/server/repositories", () => ({ getRepositories: () => ({ audit: { log: auditLog } }) }));

const { POST } = await import("./route");
const PRIMARY = "11111111-1111-4111-8111-111111111111";
const DUP = "22222222-2222-4222-8222-222222222222";
const pedir = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/customers/merge", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  env.DATA_SOURCE = "supabase";
  authorizeRole.mockReset().mockResolvedValue({ ok: true, session: {} });
  dryRunMergeImpact.mockReset().mockResolvedValue([{ table: "ar_promises", count: 3 }]);
  mergeClients.mockReset().mockResolvedValue({
    primaryId: PRIMARY,
    duplicateId: DUP,
    moved: [{ table: "ar_promises", count: 3 }],
  });
  auditLog.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/customers/merge", () => {
  it("400 si falta primaryId o duplicateId, o no son UUID", async () => {
    expect((await pedir({ primaryId: PRIMARY })).status).toBe(400);
    expect((await pedir({ primaryId: "no-uuid", duplicateId: DUP })).status).toBe(400);
  });

  it("400 si primaryId === duplicateId", async () => {
    expect((await pedir({ primaryId: PRIMARY, duplicateId: PRIMARY })).status).toBe(400);
  });

  it("dryRun:true cuenta el impacto y NO llama a mergeClients ni registra auditoría", async () => {
    const res = await pedir({ primaryId: PRIMARY, duplicateId: DUP, dryRun: true });
    expect(res.status).toBe(200);
    expect((await res.json()).moved).toEqual([{ table: "ar_promises", count: 3 }]);
    expect(mergeClients).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("sin dryRun fusiona de verdad y registra auditoría customer.merge", async () => {
    const res = await pedir({ primaryId: PRIMARY, duplicateId: DUP });
    expect(res.status).toBe(200);
    expect(mergeClients).toHaveBeenCalledWith(expect.anything(), PRIMARY, DUP);
    expect(auditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "customer.merge", entityId: PRIMARY }),
    );
  });

  it("403 si el rol no puede", async () => {
    authorizeRole.mockResolvedValue({ ok: false, res: new Response(null, { status: 403 }) });
    expect((await pedir({ primaryId: PRIMARY, duplicateId: DUP })).status).toBe(403);
  });

  it("409 en modo mock", async () => {
    env.DATA_SOURCE = "mock";
    expect((await pedir({ primaryId: PRIMARY, duplicateId: DUP })).status).toBe(409);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run src/app/api/customers/merge/route.test.ts`
Expected: FAIL — route file doesn't exist.

- [ ] **Step 4: Implement the route**

Create `apps/web/src/app/api/customers/merge/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { authorizeRole } from "@/server/auth/require-role";
import { getRepoContext } from "@/server/auth/context";
import { ROLES_CON_RIESGO } from "@/features/auth/riesgo-operativo";
import { createServer } from "@/lib/supabase/server";
import { isUuid } from "@/server/repositories/supabase/sanitize";
import { getRepositories } from "@/server/repositories";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { dryRunMergeImpact, mergeClients } from "@/server/services/customers/merge-clients";

/**
 * POST /api/customers/merge — body `{ primaryId, duplicateId, dryRun? }`.
 * Admin-only (`ROLES_CON_RIESGO`, mismo criterio que "Eliminar cliente" — la
 * guarda de INTERFAZ de la pantalla NO es la única barrera).
 *
 * `dryRun: true` solo CUENTA (sin escribir, sin auditoría) — alimenta el
 * resumen de la pantalla de comparación. Sin `dryRun`, fusiona de verdad vía
 * `merge_clients` y deja rastro en `audit_logs` (`customer.merge`).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Unificar clientes solo está disponible en modo Supabase." },
      { status: 409 },
    );
  }
  const auth = await authorizeRole(ROLES_CON_RIESGO);
  if (!auth.ok) return auth.res;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      primaryId?: string;
      duplicateId?: string;
      dryRun?: boolean;
    };
    const { primaryId, duplicateId, dryRun } = body;
    if (!isUuid(primaryId) || !isUuid(duplicateId)) {
      return NextResponse.json({ error: "primaryId y duplicateId deben ser ids válidos." }, { status: 400 });
    }
    if (primaryId === duplicateId) {
      return NextResponse.json({ error: "No se puede unificar un cliente consigo mismo." }, { status: 400 });
    }

    const ctx = await getRepoContext();
    const sb = await createServer();
    if (!sb) {
      return NextResponse.json({ error: "No se pudo conectar con la base." }, { status: 502 });
    }

    if (dryRun) {
      const moved = await dryRunMergeImpact(sb, ctx.businessId, duplicateId);
      return NextResponse.json({ moved });
    }

    const result = await mergeClients(sb, primaryId, duplicateId);

    try {
      await getRepositories().audit.log(ctx, {
        businessId: ctx.businessId,
        userId: ctx.userId ?? "",
        userName: ctx.userName ?? "",
        action: "customer.merge",
        entity: "client",
        entityId: primaryId,
        metadata: { duplicateId, moved: result.moved },
      });
    } catch {
      /* la auditoría no debe romper la unificación */
    }

    return NextResponse.json({ moved: result.moved });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo unificar los clientes. Intenta nuevamente.") },
      { status: 400 },
    );
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run src/app/api/customers/merge/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/customers/merge/ apps/web/src/features/admin/audit-labels.ts
git commit -m "feat(clientes): POST /api/customers/merge (dry-run + fusion + auditoria)"
```

---

### Task 6: Client-side data helpers (`customer-merge-client.ts`)

**Files:**
- Create: `apps/web/src/features/customers/customer-merge-client.ts`
- Test: `apps/web/src/features/customers/customer-merge-client.test.ts`

**Interfaces:**
- Consumes: `DuplicatePair` (Task 1, re-exported type shape), global `fetch`.
- Produces: `fetchDuplicatePairs()`, `mergeCustomersDryRun(primaryId, duplicateId)`, `mergeCustomers(primaryId, duplicateId)`, `describeMergeImpact(moved)` — all consumed by Task 7's `MergeClientsView`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/features/customers/customer-merge-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  fetchDuplicatePairs,
  mergeCustomersDryRun,
  mergeCustomers,
  describeMergeImpact,
} from "./customer-merge-client";

describe("fetchDuplicatePairs", () => {
  it("pide GET /api/customers/duplicates y devuelve los pares", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pairs: [{ a: { id: "a" }, b: { id: "b" }, confidence: "high", reasons: ["documento"] }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchDuplicatePairs();
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/customers/duplicates");
    expect(r).toEqual({ ok: true, pairs: [{ a: { id: "a" }, b: { id: "b" }, confidence: "high", reasons: ["documento"] }] });
  });

  it("error de red → { ok: false }", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const r = await fetchDuplicatePairs();
    expect(r.ok).toBe(false);
  });
});

describe("mergeCustomersDryRun / mergeCustomers", () => {
  it("dry run manda dryRun:true en el body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ moved: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    await mergeCustomersDryRun("p1", "d1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/customers/merge");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      primaryId: "p1",
      duplicateId: "d1",
      dryRun: true,
    });
  });

  it("la fusión real NO manda dryRun", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ moved: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    await mergeCustomers("p1", "d1");
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ primaryId: "p1", duplicateId: "d1" });
  });

  it("respuesta no-ok → { ok: false, error }", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "No tienes permiso." }) }),
    );
    const r = await mergeCustomers("p1", "d1");
    expect(r).toEqual({ ok: false, error: "No tienes permiso." });
  });
});

describe("describeMergeImpact", () => {
  it("lista solo las tablas con conteo > 0, en español", () => {
    const texto = describeMergeImpact([
      { table: "alegra_invoices", count: 14 },
      { table: "ar_promises", count: 3 },
      { table: "client_auth_links", count: 0 },
      { table: "electronic_invoices", count: 0 },
      { table: "electronic_invoices_legacy_20260906", count: 0 },
      { table: "proformas", count: 0 },
      { table: "web_orders", count: 1 },
    ]);
    expect(texto).toBe("14 facturas migradas, 3 promesas de pago, 1 pedido web");
  });

  it("sin nada que mover, lo dice", () => {
    expect(describeMergeImpact([{ table: "proformas", count: 0 }])).toBe("Sin historial que mover.");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm vitest run src/features/customers/customer-merge-client.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `apps/web/src/features/customers/customer-merge-client.ts`:

```ts
"use client";

import type { Customer } from "@/types";
import type { DuplicateConfidence } from "./utils/duplicate-detection";
import type { MergeImpact } from "@/server/services/customers/merge-clients";

export interface DuplicatePairDto {
  a: Customer;
  b: Customer;
  confidence: DuplicateConfidence;
  reasons: string[];
}

export type DuplicatePairsResult =
  | { ok: true; pairs: DuplicatePairDto[] }
  | { ok: false; error: string };

export async function fetchDuplicatePairs(): Promise<DuplicatePairsResult> {
  try {
    const res = await fetch("/api/customers/duplicates");
    const data = (await res.json().catch(() => ({}))) as { pairs?: DuplicatePairDto[]; error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? "No se pudo cargar la lista de duplicados." };
    return { ok: true, pairs: data.pairs ?? [] };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." };
  }
}

export type MergeResult = { ok: true; moved: MergeImpact[] } | { ok: false; error: string };

async function postMerge(primaryId: string, duplicateId: string, dryRun: boolean): Promise<MergeResult> {
  try {
    const res = await fetch("/api/customers/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dryRun ? { primaryId, duplicateId, dryRun: true } : { primaryId, duplicateId }),
    });
    const data = (await res.json().catch(() => ({}))) as { moved?: MergeImpact[]; error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? "No se pudo completar la operación." };
    return { ok: true, moved: data.moved ?? [] };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." };
  }
}

export const mergeCustomersDryRun = (primaryId: string, duplicateId: string) =>
  postMerge(primaryId, duplicateId, true);

export const mergeCustomers = (primaryId: string, duplicateId: string) =>
  postMerge(primaryId, duplicateId, false);

const IMPACT_LABELS: Record<string, string> = {
  alegra_invoices: "facturas migradas",
  ar_promises: "promesas de pago",
  client_auth_links: "vínculos de acceso a la tienda",
  electronic_invoices: "comprobantes electrónicos",
  electronic_invoices_legacy_20260906: "comprobantes electrónicos (histórico)",
  proformas: "ventas del sistema",
  web_orders: "pedidos web",
};

/** "14 facturas migradas, 3 promesas de pago, 1 pedido web" — solo lo que de verdad se mueve. */
export function describeMergeImpact(moved: MergeImpact[]): string {
  const partes = moved
    .filter((m) => m.count > 0)
    .map((m) => `${m.count} ${IMPACT_LABELS[m.table] ?? m.table}`);
  return partes.length > 0 ? partes.join(", ") : "Sin historial que mover.";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run src/features/customers/customer-merge-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/customers/customer-merge-client.ts apps/web/src/features/customers/customer-merge-client.test.ts
git commit -m "feat(clientes): helpers de cliente para Unificar clientes (fetch + resumen)"
```

---

### Task 7: `/clientes/unificar` page + `MergeClientsView`

**Files:**
- Create: `apps/web/src/app/(app)/clientes/unificar/page.tsx`
- Create: `apps/web/src/features/customers/components/merge-clients-view.tsx`
- Test: `apps/web/src/features/customers/components/merge-clients-view.test.tsx`

**Interfaces:**
- Consumes: `getSession` (`@/server/auth/context`), `puedeAccionDeRiesgo` (`@/features/auth/riesgo-operativo`), `fetchDuplicatePairs`/`mergeCustomersDryRun`/`mergeCustomers`/`describeMergeImpact` (Task 6), `ConfirmDialog`, `PageHeader`, `EmptyState`, `Badge`, `Card`/`CardContent`, `useToast`, `formatDate`.
- Produces: route `/clientes/unificar`; `MergeClientsView` consumed by Task 8's entry-point button (as a `Link`, not a direct import).

- [ ] **Step 1: Write the failing component test**

Create `apps/web/src/features/customers/components/merge-clients-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { MergeClientsView } from "./merge-clients-view";
import type { Customer } from "@/types";

afterEach(cleanup);

const cliente = (over: Partial<Customer>): Customer =>
  ({
    id: "id",
    businessId: "b",
    customerNumber: "CLI-1",
    firstName: "Ana",
    lastName: "Perez",
    source: "manual",
    tags: [],
    defaultBillingType: "consumo",
    skinType: "not_specified",
    totalSpent: 0,
    totalOrders: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    consents: [],
    ...over,
  }) as Customer;

const PAR = {
  a: cliente({ id: "a", firstName: "Ana", lastName: "Perez", totalOrders: 5 }),
  b: cliente({ id: "b", firstName: "Ana", lastName: "Perez", totalOrders: 1 }),
  confidence: "high" as const,
  reasons: ["documento"],
};

function mockFetchSequence(responses: Array<{ url: string; body: unknown }>) {
  const fetchMock = vi.fn((url: string) => {
    const hit = responses.find((r) => url.includes(r.url));
    return Promise.resolve({ ok: true, json: async () => hit?.body ?? {} });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("MergeClientsView", () => {
  it("muestra los pares detectados", async () => {
    mockFetchSequence([{ url: "/api/customers/duplicates", body: { pairs: [PAR] } }]);
    render(<MergeClientsView />);
    await waitFor(() => expect(screen.getByText(/Ana Perez/i)).toBeInTheDocument());
  });

  it("sin pares, muestra el estado vacío", async () => {
    mockFetchSequence([{ url: "/api/customers/duplicates", body: { pairs: [] } }]);
    render(<MergeClientsView />);
    await waitFor(() => expect(screen.getByText(/no se encontraron posibles duplicados/i)).toBeInTheDocument());
  });

  it("al abrir un par, pide el dry-run y muestra el resumen de impacto", async () => {
    mockFetchSequence([
      { url: "/api/customers/duplicates", body: { pairs: [PAR] } },
      { url: "/api/customers/merge", body: { moved: [{ table: "ar_promises", count: 3 }] } },
    ]);
    render(<MergeClientsView />);
    await waitFor(() => screen.getByText(/Ana Perez/i));
    fireEvent.click(screen.getByRole("button", { name: /comparar/i }));
    await waitFor(() => expect(screen.getByText(/3 promesas de pago/i)).toBeInTheDocument());
  });

  it("al confirmar, fusiona y el par desaparece de la lista", async () => {
    let mergePosts = 0;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("/api/customers/duplicates")) {
        return Promise.resolve({ ok: true, json: async () => ({ pairs: [PAR] }) });
      }
      if (url.includes("/api/customers/merge")) {
        const body = JSON.parse((init?.body as string) ?? "{}");
        if (body.dryRun) return Promise.resolve({ ok: true, json: async () => ({ moved: [{ table: "ar_promises", count: 3 }] }) });
        mergePosts++;
        return Promise.resolve({ ok: true, json: async () => ({ moved: [{ table: "ar_promises", count: 3 }] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MergeClientsView />);
    await waitFor(() => screen.getByText(/Ana Perez/i));
    fireEvent.click(screen.getByRole("button", { name: /comparar/i }));
    await waitFor(() => screen.getByText(/3 promesas de pago/i));
    fireEvent.click(screen.getByRole("button", { name: /unificar/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /confirmar|unificar/i })).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /unificar/i }).slice(-1)[0]!);
    await waitFor(() => expect(mergePosts).toBe(1));
    await waitFor(() => expect(screen.queryByText(/Ana Perez/i)).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run src/features/customers/components/merge-clients-view.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `MergeClientsView`**

Create `apps/web/src/features/customers/components/merge-clients-view.tsx`:

```tsx
"use client";

import * as React from "react";
import { Users, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Button, Card, CardContent } from "@/components/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import type { Customer } from "@/types";
import {
  fetchDuplicatePairs,
  mergeCustomersDryRun,
  mergeCustomers,
  describeMergeImpact,
  type DuplicatePairDto,
} from "@/features/customers/customer-merge-client";
import type { MergeImpact } from "@/server/services/customers/merge-clients";

const nombreCompleto = (c: Customer) => `${c.firstName} ${c.lastName}`.trim();

/** Preselección: el que tiene más compras registradas; empate → el primero. */
function sobrevivientePorDefecto(par: DuplicatePairDto): Customer {
  return par.b.totalOrders > par.a.totalOrders ? par.b : par.a;
}

const CONFIDENCE_LABEL: Record<DuplicatePairDto["confidence"], string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};
const CONFIDENCE_TONE: Record<DuplicatePairDto["confidence"], "danger" | "warning" | "neutral"> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

function PairDetail({
  par,
  onDone,
  onCancel,
}: {
  par: DuplicatePairDto;
  onDone: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [survivorId, setSurvivorId] = React.useState(sobrevivientePorDefecto(par).id);
  const [impacto, setImpacto] = React.useState<MergeImpact[] | null>(null);
  const [cargandoImpacto, setCargandoImpacto] = React.useState(true);
  const [confirmando, setConfirmando] = React.useState(false);
  const [fusionando, setFusionando] = React.useState(false);

  const survivor = survivorId === par.a.id ? par.a : par.b;
  const loser = survivorId === par.a.id ? par.b : par.a;

  React.useEffect(() => {
    let vivo = true;
    setCargandoImpacto(true);
    mergeCustomersDryRun(survivor.id, loser.id).then((r) => {
      if (!vivo) return;
      setCargandoImpacto(false);
      if (r.ok) setImpacto(r.moved);
      else toast.error(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [survivor.id, loser.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmarFusion = async () => {
    setFusionando(true);
    const r = await mergeCustomers(survivor.id, loser.id);
    setFusionando(false);
    setConfirmando(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(`Clientes unificados. ${nombreCompleto(loser)} pasó a ${nombreCompleto(survivor)}.`);
    onDone();
  };

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {[par.a, par.b].map((c) => (
            <label
              key={c.id}
              className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-sm ${
                survivorId === c.id ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5" : "border-black/10"
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name={`survivor-${par.a.id}-${par.b.id}`}
                  checked={survivorId === c.id}
                  onChange={() => setSurvivorId(c.id)}
                />
                {nombreCompleto(c)} {survivorId === c.id && <Badge tone="success">Sobrevive</Badge>}
              </span>
              <span className="opacity-70">Documento: {c.documentNumber || "—"}</span>
              <span className="opacity-70">Teléfono: {c.phone || "—"} · WhatsApp: {c.whatsapp || "—"}</span>
              <span className="opacity-70">Email: {c.email || "—"}</span>
              <span className="opacity-70">Compras: {c.totalOrders}</span>
            </label>
          ))}
        </div>

        <div className="rounded-lg bg-black/[0.03] p-3 text-sm">
          {cargandoImpacto ? "Calculando cuánto se mueve…" : impacto ? describeMergeImpact(impacto) : "—"}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button size="sm" disabled={cargandoImpacto} onClick={() => setConfirmando(true)}>
            Unificar
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmando}
        title="Unificar clientes"
        message={
          <>
            <strong>{nombreCompleto(loser)}</strong> se traspasa a{" "}
            <strong>{nombreCompleto(survivor)}</strong> y queda eliminado.
            {impacto && <div className="mt-2">{describeMergeImpact(impacto)}</div>}
          </>
        }
        confirmLabel={fusionando ? "Unificando…" : "Unificar"}
        onConfirm={confirmarFusion}
        onCancel={() => setConfirmando(false)}
      />
    </Card>
  );
}

export function MergeClientsView() {
  const toast = useToast();
  const [pairs, setPairs] = React.useState<DuplicatePairDto[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [abierto, setAbierto] = React.useState<string | null>(null);

  const cargar = React.useCallback(async () => {
    setError(null);
    const r = await fetchDuplicatePairs();
    if (r.ok) setPairs(r.pairs);
    else setError(r.error);
  }, []);

  React.useEffect(() => {
    cargar();
  }, [cargar]);

  const parKey = (p: DuplicatePairDto) => `${p.a.id}|${p.b.id}`;

  const quitarPar = (key: string) => {
    setPairs((prev) => (prev ?? []).filter((p) => parKey(p) !== key));
    setAbierto(null);
  };

  return (
    <>
      <PageHeader
        title="Unificar clientes"
        description="Posibles duplicados detectados en toda la base — comparar y fusionar de a un par."
        breadcrumbs={[{ label: "Clientes", href: "/clientes" }, { label: "Unificar" }]}
      />
      <toast.Toast />

      {error && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {pairs === null && !error && <p className="opacity-70">Escaneando la base…</p>}

      {pairs !== null && pairs.length === 0 && (
        <EmptyState icon={Users} title="No se encontraron posibles duplicados" />
      )}

      <div className="space-y-3">
        {(pairs ?? []).map((par) => {
          const key = parKey(par);
          return (
            <div key={key}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{nombreCompleto(par.a)}</span>
                    <ArrowRight className="h-4 w-4 opacity-40" />
                    <span className="font-medium">{nombreCompleto(par.b)}</span>
                    <Badge tone={CONFIDENCE_TONE[par.confidence]}>{CONFIDENCE_LABEL[par.confidence]}</Badge>
                    <span className="opacity-60">Coincide por: {par.reasons.join(", ")}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAbierto(abierto === key ? null : key)}
                  >
                    Comparar
                  </Button>
                </CardContent>
              </Card>
              {abierto === key && (
                <div className="mt-2">
                  <PairDetail par={par} onDone={() => quitarPar(key)} onCancel={() => setAbierto(null)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Create the gated Server Component page**

Create `apps/web/src/app/(app)/clientes/unificar/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getSession } from "@/server/auth/context";
import { puedeAccionDeRiesgo } from "@/features/auth/riesgo-operativo";
import { MergeClientsView } from "@/features/customers/components/merge-clients-view";

export default async function UnificarClientesPage() {
  const session = await getSession();
  const permitido = !!session && (session.isPlatformAdmin || puedeAccionDeRiesgo(session.user.role));
  if (!permitido) notFound();

  return <MergeClientsView />;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run src/features/customers/components/merge-clients-view.test.tsx`
Expected: PASS. If `Badge`/`Button`/`Card`/`CardContent` named exports differ slightly from `@/components/ui`'s barrel, fix the import to match (check `src/components/ui/index.ts`).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(app)/clientes/unificar/" apps/web/src/features/customers/components/
git commit -m "feat(clientes): pantalla /clientes/unificar (comparar y fusionar duplicados)"
```

---

### Task 8: Entry point button + docs/version

**Files:**
- Modify: `apps/web/src/app/(app)/clientes/page.tsx`
- Modify: `apps/web/src/app/(app)/clientes/page.test.tsx`
- Modify: `package.json` (root)
- Modify: `CHANGELOG.md`
- Modify: `docs/proximos-pasos.md`

**Interfaces:**
- Consumes: `Merge` icon from `lucide-react`, existing `puedeRiesgo` variable already computed in `page.tsx` (`const puedeRiesgo = puedeAccionDeRiesgo(useCurrentRole());`).
- Produces: nothing new consumed elsewhere — this is the UI entry point and release bookkeeping.

- [ ] **Step 1: Write the failing test**

In `apps/web/src/app/(app)/clientes/page.test.tsx`, add (this file already mocks `useCurrentRole` → `"admin"`, so `puedeRiesgo` is `true`):

```tsx
it("el botón «Unificar clientes» aparece para un admin y enlaza a /clientes/unificar", () => {
  render(<ClientesPage />);
  const link = screen.getByRole("link", { name: /unificar clientes/i });
  expect(link).toHaveAttribute("href", "/clientes/unificar");
});
```

(Match the existing import name for the page component in this file — check the top of `page.test.tsx` for how it imports/renders the page, e.g. `import ClientesPage from "./page";`, and reuse that exact identifier.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run "src/app/(app)/clientes/page.test.tsx"`
Expected: FAIL — no link with that accessible name yet.

- [ ] **Step 3: Add the button**

In `apps/web/src/app/(app)/clientes/page.tsx`, add `Merge` to the `lucide-react` import (currently `import { Plus, X } from "lucide-react";` → `import { Merge, Plus, X } from "lucide-react";`), then add a link next to "Nuevo cliente" inside the `actions` block (around line 176-182):

```tsx
            {puedeRiesgo && (
              <Link href="/clientes/unificar">
                <Button size="sm" variant="outline">
                  <Merge className="h-4 w-4" />
                  Unificar clientes
                </Button>
              </Link>
            )}
            <Link href="/clientes/nuevo">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Nuevo cliente
              </Button>
            </Link>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run "src/app/(app)/clientes/page.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Bump version + CHANGELOG**

In root `package.json`, change `"version": "0.146.0"` → `"version": "0.147.0"`.

In `CHANGELOG.md`, insert right after `## [Unreleased]` and before `## [0.146.0] - 2026-09-06`:

```markdown
## [0.147.0] - 2026-09-09

### Agregado

- **Unificar clientes.** Botón admin-only en `/clientes` → pantalla
  `/clientes/unificar`: escanea TODA la base (documento, teléfono y
  WhatsApp normalizados) y muestra los pares sospechosos, ordenados por
  confianza. Al abrir un par, un dry-run cuenta cuánto se movería (facturas
  migradas, promesas de pago, ventas del sistema, pedidos web…) antes de
  confirmar. Al unificar: las 7 tablas con historial del cliente se
  reasignan al sobreviviente en una transacción (`merge_clients`), los
  campos vacíos del sobreviviente se rellenan con los del duplicado sin
  sobreescribir nada, y el duplicado queda eliminado (soft-delete, igual
  que "Eliminar cliente"). Queda auditado (`customer.merge`).
```

- [ ] **Step 6: Update `docs/proximos-pasos.md`**

Add a row to the "Hecho recientemente" table at the top (after the header row):

```markdown
| 2026-09-09 | **Unificar clientes.** Pantalla admin-only para fusionar duplicados detectados en los 6 525 clientes migrados: escaneo masivo, comparación con dry-run de impacto, fusión atómica de 7 tablas + soft-delete del duplicado. |
```

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/(app)/clientes/page.tsx" "apps/web/src/app/(app)/clientes/page.test.tsx" package.json CHANGELOG.md docs/proximos-pasos.md
git commit -m "chore: bump 0.147.0 + CHANGELOG (Unificar clientes) + botón de entrada"
```

---

### Task 9: Apply migration, run full suite, live verification, push

**Files:** none new — this task runs commands and, if the live script finds a real bug, loops back to fix it in the files above.

- [ ] **Step 1: Apply the migration to production via the Supabase MCP tool**

Use `mcp__supabase-dermaland__apply_migration` with the exact SQL from Task 2's `20260909170000_merge_clients.sql` (name: `merge_clients`). This registers it in Supabase's own migration history (matching how `20260909150000_desglose_ventas_cliente_comprobante.sql` was applied the same day) — do NOT run it by hand through `execute_sql`, which would leave it unregistered (the drift problem `docs/migration-audit-20260805.md` already closed once).

- [ ] **Step 2: Run typecheck + full test suite + build**

Run: `cd apps/web && pnpm typecheck && pnpm test && pnpm build`
Expected: all three exit 0. Fix any failure in the relevant task's files before continuing — do not weaken a test to make it pass.

- [ ] **Step 3: Write and run the live verification script**

Create `scripts/test/customer-merge-test.mjs`, modeled exactly on `scripts/test/count-adjustment-test.mjs` (temp business + admin user signed in with the real JWT, so RLS applies for real):

```js
#!/usr/bin/env node
/**
 * PRUEBA EN VIVO de `merge_clients`.
 *
 * Crea empresa de prueba, 2 clientes (primario+duplicado) con datos que se
 * complementan (uno tiene teléfono, el otro email), una `ar_promises` y un
 * `client_auth_links` colgando del DUPLICADO, y verifica que `merge_clients`:
 *   1. Reasigna ambas filas al primario.
 *   2. Rellena en el primario el campo que le faltaba (coalesce, sin pisar).
 *   3. Deja el duplicado con `deleted_at` (no lo borra físicamente).
 *   4. El dry-run (conteo directo, sin RPC) cuenta lo mismo ANTES de fusionar.
 *   5. Fusionar dos veces el mismo par en la 2ª tira P0002 (ya no existe activo).
 *   6. Unificar un cliente consigo mismo tira P0003.
 * Borra todos los datos de prueba al final.
 *
 * Uso: node scripts/test/customer-merge-test.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

const env = {};
for (const line of readFileSync(path.join(root, "apps/web/.env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRK = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SRK) { console.error("Faltan env vars"); process.exit(1); }

const PLAN_ID = "00000000-0000-0000-0000-000000000001";
const admin = createClient(URL_, SRK, { auth: { persistSession: false } });
const stamp = Math.random().toString(36).slice(2, 8);
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  ✅ ${n}`); };
const bad = (n, extra = "") => { fail++; console.log(`  ❌ ${n} ${extra}`); };

async function run() {
  const c = {};
  try {
    console.log("── Setup ──");
    c.biz = (await admin.from("businesses").insert({ legal_name: `ZZTMERGE ${stamp}`, commercial_name: `ZZTMERGE ${stamp}`, rnc: `ZM${stamp}`, plan_id: PLAN_ID, status: "trial" }).select("id").single()).data.id;
    c.primary = (await admin.from("clients").insert({ business_id: c.biz, customer_number: `CLI-${stamp}-1`, first_name: "ZZT", last_name: "Primario", phone: "8095550001", source: "manual", default_billing_type: "consumo", skin_type: "not_specified" }).select("id").single()).data.id;
    c.dup = (await admin.from("clients").insert({ business_id: c.biz, customer_number: `CLI-${stamp}-2`, first_name: "ZZT", last_name: "Duplicado", email: "zzt-dup@example.com", source: "manual", default_billing_type: "consumo", skin_type: "not_specified" }).select("id").single()).data.id;
    await admin.from("ar_promises").insert({ business_id: c.biz, client_id: c.dup, client_name: "ZZT Duplicado", promised_date: "2026-12-31", amount: 100 });
    const email = `zztmerge-${stamp}@example.com`, password = `Zm!${stamp}${stamp}`;
    c.user = (await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { business_id: c.biz, role: "admin", is_platform_admin: false, full_name: "Admin ZZT" } })).data.user.id;
    await admin.from("users").insert({ id: c.user, business_id: c.biz, email, full_name: "Admin ZZT" });
    await admin.from("client_auth_links").insert({ auth_user_id: c.user, client_id: c.dup, business_id: c.biz });
    const cU = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    if ((await cU.auth.signInWithPassword({ email, password })).error) throw new Error("login falló");
    console.log(`  empresa=${c.biz.slice(0, 8)} primario=${c.primary.slice(0, 8)} duplicado=${c.dup.slice(0, 8)}`);

    console.log("\n── 1. Dry-run cuenta ANTES de escribir ──");
    const antesAr = (await admin.from("ar_promises").select("id", { count: "exact", head: true }).eq("client_id", c.dup).eq("business_id", c.biz)).count;
    antesAr === 1 ? ok("ar_promises del duplicado = 1 antes de fusionar") : bad("conteo inicial incorrecto", String(antesAr));

    console.log("\n── 2. Fusionar consigo mismo → P0003 ──");
    const rSelf = await cU.rpc("merge_clients", { p_primary_id: c.primary, p_duplicate_id: c.primary });
    rSelf.error && /P0003/.test(rSelf.error.message) ? ok("rechaza fusionar un cliente consigo mismo") : bad("no rechazó", JSON.stringify(rSelf));

    console.log("\n── 3. Fusión real ──");
    const r1 = await cU.rpc("merge_clients", { p_primary_id: c.primary, p_duplicate_id: c.dup });
    r1.error ? bad("RPC falló", r1.error.message) : ok("RPC merge_clients OK");
    r1.data?.moved?.ar_promises === 1 ? ok("moved.ar_promises = 1") : bad("moved incorrecto", JSON.stringify(r1.data));

    const ap = (await admin.from("ar_promises").select("client_id").eq("id", (await admin.from("ar_promises").select("id").eq("business_id", c.biz).single()).data.id).single()).data;
    ap?.client_id === c.primary ? ok("ar_promises reasignada al primario") : bad("no se reasignó", JSON.stringify(ap));

    const cal = (await admin.from("client_auth_links").select("client_id").eq("auth_user_id", c.user).single()).data;
    cal?.client_id === c.primary ? ok("client_auth_links reasignado al primario") : bad("no se reasignó", JSON.stringify(cal));

    const primarioFinal = (await admin.from("clients").select("email,phone,deleted_at").eq("id", c.primary).single()).data;
    primarioFinal?.email === "zzt-dup@example.com" ? ok("email relleno desde el duplicado (coalesce)") : bad("no rellenó email", JSON.stringify(primarioFinal));
    primarioFinal?.phone === "8095550001" ? ok("teléfono del primario NO se sobreescribió") : bad("sobreescribió un dato que ya tenía", JSON.stringify(primarioFinal));

    const dupFinal = (await admin.from("clients").select("deleted_at").eq("id", c.dup).single()).data;
    dupFinal?.deleted_at ? ok("duplicado con soft-delete (deleted_at set)") : bad("no quedó soft-deleted", JSON.stringify(dupFinal));

    console.log("\n── 4. Repetir la misma fusión → P0002 (duplicado ya no está activo) ──");
    const r2 = await cU.rpc("merge_clients", { p_primary_id: c.primary, p_duplicate_id: c.dup });
    r2.error && /P0002/.test(r2.error.message) ? ok("2ª fusión del mismo par rechazada (P0002)") : bad("no rechazó", JSON.stringify(r2));

    console.log(`\n── Resultado: ${pass} OK, ${fail} FALLOS ──`);
  } finally {
    console.log("\n── Cleanup ──");
    if (c.biz) {
      for (const t of ["client_auth_links", "ar_promises", "clients", "users"]) {
        await admin.from(t).delete().eq("business_id", c.biz);
      }
      if (c.user) await admin.auth.admin.deleteUser(c.user).catch(() => {});
      await admin.from("businesses").delete().eq("id", c.biz);
    }
    console.log("  datos de prueba eliminados");
  }
  process.exit(fail === 0 ? 0 : 1);
}
run().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
```

Run: `node scripts/test/customer-merge-test.mjs`
Expected: all ✅, exits 0, "datos de prueba eliminados" printed. If anything ❌, fix the migration (Task 2) or service (Task 3) — do not edit the script to hide a real failure.

- [ ] **Step 4: Push**

```bash
git push origin main && git push gitea main
```
(`gitea main` may fail with "Authentication failed" on the first attempt — retry once before treating it as a real failure, per this project's established pattern.) Verify the Vercel auto-deploy reaches Ready and `/clientes` still loads for an authenticated admin.

---

## Self-Review

- **Spec coverage:** detection (bucket scan, §1) → Task 1; screen + gate (§2) → Task 7 + Task 4's role gate; `POST /api/customers/merge` with dry-run (§3) → Tasks 3+5; out-of-scope items (§4: one pair at a time, no field editing, no undo, no cache) → none of the tasks build those, by design.
- **Placeholder scan:** no TBD/"add error handling"/"similar to Task N" — every step has real code.
- **Type consistency checked:** `DuplicatePair` (Task 1) → `DuplicatePairDto` (Task 6, same shape, re-typed at the API boundary) → consumed identically in Task 7. `MergeImpact { table, count }` is the SAME shape from Task 3 (dry run) through Task 5 (route) to Task 6 (`describeMergeImpact`) to Task 7 (rendering) — verified no field renames across tasks. `MERGE_IMPACT_TABLES` defined once in Task 3, consumed by Task 2's guard test and Task 6's label map (by table name).
