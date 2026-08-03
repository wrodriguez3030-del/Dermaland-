# Conteo físico: cerrar la persistencia — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un conteo físico no se pierda si se limpia el navegador o se cambia de equipo.

**Architecture:** La sesión local sigue mandando (nada del flujo actual cambia). Se añaden tres cosas: la cabecera del conteo se crea en Supabase al iniciar la sesión, cada escaneo se encola con el cliente de sync que ya existe, y la creación de cabecera+ítems deja de poder quedar a medias. Toda la persistencia es best-effort: si la nube falla, el módulo se comporta exactamente como hoy.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript estricto · Supabase (PostgREST) · Vitest · pnpm

## Global Constraints

- Nunca romper el flujo local: todo fallo de red o 409 cae al comportamiento actual y solo muestra el aviso de sincronización pendiente.
- Sin DDL. No se crean ni alteran tablas, columnas, funciones ni políticas.
- `difference_quantity` en `inventory_count_items` es `GENERATED ALWAYS`: **nunca** incluirla en un INSERT.
- Toda escritura filtra por `business_id = ctx.businessId` además de RLS.
- Un UPDATE de 0 filas NO es éxito.
- Idioma del código y los mensajes: español, como el resto del módulo.
- Comandos de verificación: `pnpm --filter web typecheck` y `pnpm --filter web test`.

---

### Task 1: Creación atómica de cabecera + ítems

Hoy `create()` hace dos INSERT sin transacción (`inventory-counts.ts:108` y `:148`). Si el segundo falla, la cabecera queda escrita con un `item_count` que miente. Los conteos `224ce535`, `c76a2627` y `57aa1089` son exactamente eso.

La corrección es compensatoria: si fallan los ítems, se borra la cabecera. Para poder probarlo sin una base real, la lógica se extrae a un módulo con una costura de cliente.

**Files:**
- Create: `apps/web/src/server/repositories/supabase/inventory-counts-create.ts`
- Modify: `apps/web/src/server/repositories/supabase/inventory-counts.ts:99-157` (el cuerpo de `create` pasa a delegar)
- Test: `apps/web/src/server/repositories/supabase/inventory-counts-create.test.ts`

**Interfaces:**
- Consumes: `NewInventoryCount`, `RepoContext` de `../types`; `inventoryCountRowToTs` de `./mappers`.
- Produces: `createCountWithItems(sb: CountWriteClient, ctx: RepoContext, input: NewInventoryCount, warehouseId: string): Promise<InventoryCount>` y el tipo `CountWriteClient`.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// apps/web/src/server/repositories/supabase/inventory-counts-create.test.ts
import { describe, it, expect, vi } from "vitest";
import { createCountWithItems } from "./inventory-counts-create";

const ctx = { businessId: "biz1", branchId: "br1", userId: "u1" } as never;

const input = {
  countNumber: "CONT-9",
  branchId: "br1",
  countType: "full",
  status: "approved",
  items: [
    {
      productId: "p1",
      productSku: "SKU-1",
      productName: "Producto 1",
      expectedQuantity: 5,
      countedQuantity: 4,
      status: "shortage",
    },
  ],
} as never;

/** Cliente falso: la cabecera inserta bien, los ítems fallan. */
function fakeClient(opts: { itemsFail: boolean }) {
  const deleted: Array<Record<string, string>> = [];
  const client = {
    from(table: string) {
      if (table === "inventory_counts") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: { id: "c-nuevo", business_id: "biz1", branch_id: "br1", warehouse_id: "wh1", count_number: "CONT-9", count_type: "full", status: "approved", assigned_to: [], started_at: "2026-08-03T00:00:00Z", notes: null, scan_count: 0, item_count: 1, created_at: "2026-08-03T00:00:00Z", updated_at: "2026-08-03T00:00:00Z" },
                error: null,
              }),
            }),
          }),
          delete: () => ({
            eq: (col: string, val: string) => {
              deleted.push({ [col]: val });
              return { eq: (c2: string, v2: string) => { deleted.push({ [c2]: v2 }); return Promise.resolve({ error: null }); } };
            },
          }),
        };
      }
      return {
        insert: async () => ({ error: opts.itemsFail ? { message: "boom" } : null }),
      };
    },
    deleted,
  };
  return client as never;
}

describe("createCountWithItems", () => {
  it("borra la cabecera si falla el insert de ítems", async () => {
    const sb = fakeClient({ itemsFail: true });
    await expect(createCountWithItems(sb, ctx, input, "wh1")).rejects.toThrow();
    expect((sb as unknown as { deleted: unknown[] }).deleted).toEqual([{ id: "c-nuevo" }, { business_id: "biz1" }]);
  });

  it("no borra nada cuando los ítems entran bien", async () => {
    const sb = fakeClient({ itemsFail: false });
    const out = await createCountWithItems(sb, ctx, input, "wh1");
    expect(out.id).toBe("c-nuevo");
    expect((sb as unknown as { deleted: unknown[] }).deleted).toEqual([]);
  });

  it("nunca envía difference_quantity, que es GENERATED ALWAYS", async () => {
    const enviados: Array<Record<string, unknown>> = [];
    const sb = {
      from(table: string) {
        if (table === "inventory_counts") {
          return {
            insert: () => ({ select: () => ({ single: async () => ({ data: { id: "c1", business_id: "biz1", branch_id: "br1", warehouse_id: "wh1", count_number: "C", count_type: "full", status: "approved", assigned_to: [], started_at: "2026-08-03T00:00:00Z", notes: null, scan_count: 0, item_count: 1, created_at: "2026-08-03T00:00:00Z", updated_at: "2026-08-03T00:00:00Z" }, error: null }) }) }),
            delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
          };
        }
        return { insert: async (rows: Array<Record<string, unknown>>) => { enviados.push(...rows); return { error: null }; } };
      },
    } as never;
    await createCountWithItems(sb, ctx, input, "wh1");
    expect(enviados[0]).not.toHaveProperty("difference_quantity");
  });
});
```

- [ ] **Step 2: Ejecutar la prueba y verificar que falla**

Run: `pnpm --filter web test -- inventory-counts-create`
Expected: FAIL — "Failed to resolve import ./inventory-counts-create"

- [ ] **Step 3: Escribir la implementación mínima**

```ts
// apps/web/src/server/repositories/supabase/inventory-counts-create.ts
import type { InventoryCount } from "@/types";
import type { NewInventoryCount, RepoContext } from "../types";
import { SupabaseRepositoryError } from "./client";
import { inventoryCountRowToTs } from "./mappers";

/**
 * Costura mínima del cliente de Supabase que necesita esta operación. Existe
 * para poder probar la compensación sin una base real.
 */
export interface CountWriteClient {
  from(table: string): {
    insert: (rows?: unknown) => never;
    delete?: () => never;
  };
}

/**
 * Crea la cabecera del conteo y sus ítems. NO hay transacción en PostgREST, así
 * que si los ítems fallan se borra la cabecera recién creada: es preferible no
 * dejar rastro a dejar una cabecera con `item_count` mintiendo.
 */
export async function createCountWithItems(
  sb: CountWriteClient,
  ctx: RepoContext,
  input: NewInventoryCount,
  warehouseId: string,
): Promise<InventoryCount> {
  const anySb = sb as never as {
    from: (t: string) => {
      insert: (rows?: unknown) => {
        select?: (c: string) => { single: () => Promise<{ data: never; error: unknown }> };
      } & Promise<{ error: unknown }>;
      delete: () => { eq: (c: string, v: string) => { eq: (c2: string, v2: string) => Promise<{ error: unknown }> } };
    };
  };

  const { data: countRow, error: countErr } = await anySb
    .from("inventory_counts")
    .insert({
      business_id: ctx.businessId,
      branch_id: input.branchId,
      warehouse_id: warehouseId,
      count_number: input.countNumber,
      count_type: input.countType,
      status: input.status ?? "in_progress",
      assigned_to: input.assignedTo ?? [],
      started_at: input.startedAt ?? new Date().toISOString(),
      notes: input.notes ?? null,
      scan_count: 0,
      item_count: input.items.length,
    })
    .select!("*")
    .single();
  if (countErr) throw new SupabaseRepositoryError("inventoryCount.create", countErr as never);

  if (input.items.length === 0) return inventoryCountRowToTs(countRow);

  const itemRows = input.items.map((it) => ({
    business_id: ctx.businessId,
    inventory_count_id: (countRow as { id: string }).id,
    product_id: it.productId,
    product_sku: it.productSku,
    product_name: it.productName,
    product_lot_id: it.productLotId ?? null,
    lot_number: it.lotNumber ?? null,
    expires_at: it.expiresAt ?? null,
    warehouse_id: it.warehouseId || warehouseId,
    expected_quantity: it.expectedQuantity,
    counted_quantity: it.countedQuantity,
    // `difference_quantity` es GENERATED ALWAYS: la calcula la base.
    status: it.status,
    last_scan_at: it.lastScanAt ?? null,
  }));

  const { error: itemsErr } = await anySb.from("inventory_count_items").insert(itemRows);
  if (itemsErr) {
    // Compensación: sin ítems el conteo no sirve, y una cabecera huérfana
    // envenena los informes. Se borra y se propaga el error real.
    await anySb
      .from("inventory_counts")
      .delete()
      .eq("id", (countRow as { id: string }).id)
      .eq("business_id", ctx.businessId);
    throw new SupabaseRepositoryError("inventoryCount.create.items", itemsErr as never);
  }

  return inventoryCountRowToTs(countRow);
}
```

- [ ] **Step 4: Ejecutar la prueba y verificar que pasa**

Run: `pnpm --filter web test -- inventory-counts-create`
Expected: PASS (3 pruebas)

- [ ] **Step 5: Delegar desde el repositorio**

En `apps/web/src/server/repositories/supabase/inventory-counts.ts`, sustituir el cuerpo de `create` (desde el primer `const { data: countRow` hasta el `return inventoryCountRowToTs(countRow);` final) por:

```ts
    return createCountWithItems(sb as never, ctx, input, warehouseId);
```

y añadir el import junto a los existentes:

```ts
import { createCountWithItems } from "./inventory-counts-create";
```

- [ ] **Step 6: Verificar que no se rompió nada**

Run: `pnpm --filter web typecheck && pnpm --filter web test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/server/repositories/supabase/inventory-counts-create.ts apps/web/src/server/repositories/supabase/inventory-counts-create.test.ts apps/web/src/server/repositories/supabase/inventory-counts.ts
git commit -m "fix(conteo): la creación de un conteo ya no puede quedar a medias

Eran dos INSERT sin transacción: si fallaban los ítems, la cabecera quedaba
escrita con un item_count que mentía. Ahora se compensa borrándola."
```

---

### Task 2: La sesión conoce su conteo en la nube

`queueScan` necesita un `inventoryCountId` que exista en el servidor, y hoy la sesión solo tiene un id local. Se añade `serverId` a la sesión y se crea la cabecera al iniciar.

**Files:**
- Modify: `apps/web/src/features/inventory-counts/scan-session-store.ts:60-80` (campo `serverId`), `:143-180` (`createSession`)
- Create: `apps/web/src/features/inventory-counts/ensure-server-count.ts`
- Test: `apps/web/src/features/inventory-counts/ensure-server-count.test.ts`

**Interfaces:**
- Consumes: `CountSession` de `./scan-session-store`; `persistCountToSupabase` de `./persist`.
- Produces: `ensureServerCount(session: CountSession): Promise<string | null>` — devuelve el id del servidor, o `null` si el backend está en mock o no hay red. Y `setSessionServerId(id: string, serverId: string): void`.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// apps/web/src/features/inventory-counts/ensure-server-count.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ensureServerCount } from "./ensure-server-count";

const sesion = {
  id: "loc-1", code: "CONT-1", name: "Conteo", branchId: "br1", type: "full",
  status: "in_progress", startedAt: "2026-08-03T00:00:00Z", items: [], scans: [],
  createdAt: "2026-08-03T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z",
} as never;

beforeEach(() => { vi.restoreAllMocks(); });

describe("ensureServerCount", () => {
  it("crea la cabecera y devuelve el id del servidor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "srv-1" }), { status: 201 })));
    expect(await ensureServerCount(sesion)).toBe("srv-1");
  });

  it("devuelve null cuando el backend está en modo mock (409)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 409 })));
    expect(await ensureServerCount(sesion)).toBeNull();
  });

  it("devuelve null si la red falla, sin lanzar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sin red"); }));
    expect(await ensureServerCount(sesion)).toBeNull();
  });

  it("no vuelve a crear si la sesión ya tiene serverId", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await ensureServerCount({ ...(sesion as object), serverId: "srv-9" } as never)).toBe("srv-9");
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Ejecutar la prueba y verificar que falla**

Run: `pnpm --filter web test -- ensure-server-count`
Expected: FAIL — no existe el módulo

- [ ] **Step 3: Añadir `serverId` al tipo y al store**

En `scan-session-store.ts`, dentro de `interface CountSession`, después de `closedAt?: string;`:

```ts
  /** Id del conteo en Supabase. Ausente si nunca se pudo crear (mock o sin red). */
  serverId?: string;
```

Y al final del archivo, junto a las demás mutaciones:

```ts
export function setSessionServerId(id: string, serverId: string): void {
  const list = listSessions();
  const ix = list.findIndex((s) => s.id === id);
  if (ix < 0) return;
  list[ix] = { ...list[ix]!, serverId, updatedAt: new Date().toISOString() };
  writeAll(list);
}
```

> Nota: `writeAll` es el helper interno que ya usa el resto del store para guardar y emitir el `CustomEvent`. Reutilízalo tal cual; no crees otro.

- [ ] **Step 4: Escribir `ensureServerCount`**

```ts
// apps/web/src/features/inventory-counts/ensure-server-count.ts
import type { CountSession } from "./scan-session-store";
import { buildCountCreatePayload, persistCountToSupabase } from "./persist";

/**
 * Garantiza que la sesión tenga una cabecera en Supabase para poder colgar de
 * ella los escaneos. Es best-effort a propósito: sin red o con el backend en
 * modo mock devuelve null y el conteo sigue funcionando en local.
 */
export async function ensureServerCount(session: CountSession): Promise<string | null> {
  if (session.serverId) return session.serverId;
  // `CountCreatePayload.status` es `FinalCountStatus`, que NO admite
  // "in_progress": se usa "submitted" como estado de cabecera abierta. El
  // estado real del conteo lo lleva la sesión local hasta que se apruebe.
  const payload = buildCountCreatePayload(session, () => 0, "submitted");
  // Al iniciar aún no hay nada contado: la cabecera nace sin ítems.
  const res = await persistCountToSupabase({ ...payload, items: [] });
  return res.ok && res.id ? res.id : null;
}
```

- [ ] **Step 5: Ejecutar la prueba y verificar que pasa**

Run: `pnpm --filter web test -- ensure-server-count`
Expected: PASS (4 pruebas)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/inventory-counts/ensure-server-count.ts apps/web/src/features/inventory-counts/ensure-server-count.test.ts apps/web/src/features/inventory-counts/scan-session-store.ts
git commit -m "feat(conteo): la sesión de escaneo conoce su conteo en la nube

Añade serverId a la sesión y ensureServerCount, para que los escaneos puedan
colgar de una cabecera real. Best-effort: sin red devuelve null y el conteo
sigue igual en local."
```

---

### Task 3: Los escaneos se persisten

`queueScan` ya existe en `sync/sync.ts:47`: encola en IndexedDB, sincroniza al momento si hay red y reintenta con backoff. Nadie lo llama. Se cablea en la pantalla de escaneo.

**Files:**
- Modify: `apps/web/src/app/(app)/conteo-fisico/[id]/escanear/page.tsx:179-260` (dentro de `scanCode`, tras un escaneo con éxito)
- Test: `apps/web/src/features/inventory-counts/scan-session-store.test.ts` (añadir describe nuevo)

**Interfaces:**
- Consumes: `queueScan(input: ScanInput): Promise<string>` de `@/features/inventory-counts/sync/sync`; `ensureServerCount` y `setSessionServerId` de la Task 2.
- Produces: nada nuevo.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// añadir al final de apps/web/src/features/inventory-counts/scan-session-store.test.ts
import { buildScanInput } from "./build-scan-input";

describe("buildScanInput", () => {
  it("arma el payload de escaneo con el id del servidor", () => {
    const out = buildScanInput({
      serverCountId: "srv-1", productId: "p1", productLotId: null,
      branchId: "br1", warehouseId: "wh1", barcode: "7460082500233",
      source: "reader", quantity: 2, userName: "Willian",
    });
    expect(out).toEqual({
      inventoryCountId: "srv-1", productId: "p1", productLotId: null,
      branchId: "br1", warehouseId: "wh1", barcode: "7460082500233",
      scanSource: "bluetooth_scanner", scannedQuantity: 2,
      scannedBy: null, scannedByName: "Willian", notes: null,
    });
  });

  it("traduce el origen de cámara y manual", () => {
    expect(buildScanInput({ serverCountId: "s", productId: "p", productLotId: null, branchId: "b", warehouseId: "w", barcode: null, source: "camera", quantity: 1, userName: null }).scanSource).toBe("camera");
    expect(buildScanInput({ serverCountId: "s", productId: "p", productLotId: null, branchId: "b", warehouseId: "w", barcode: null, source: "manual", quantity: 1, userName: null }).scanSource).toBe("manual");
  });
});
```

- [ ] **Step 2: Ejecutar la prueba y verificar que falla**

Run: `pnpm --filter web test -- scan-session-store`
Expected: FAIL — no existe `./build-scan-input`

- [ ] **Step 3: Escribir el traductor puro**

```ts
// apps/web/src/features/inventory-counts/build-scan-input.ts
import type { ScanInput } from "./sync/sync";

/** Orígenes de la UI → los que acepta la ruta de sync. */
const ORIGEN: Record<"reader" | "camera" | "manual", ScanInput["scanSource"]> = {
  reader: "bluetooth_scanner",
  camera: "camera",
  manual: "manual",
};

export function buildScanInput(args: {
  serverCountId: string;
  productId: string;
  productLotId: string | null;
  branchId: string;
  warehouseId: string;
  barcode: string | null;
  source: "reader" | "camera" | "manual";
  quantity: number;
  userName: string | null;
}): ScanInput {
  return {
    inventoryCountId: args.serverCountId,
    productId: args.productId,
    productLotId: args.productLotId,
    branchId: args.branchId,
    warehouseId: args.warehouseId,
    barcode: args.barcode,
    scanSource: ORIGEN[args.source],
    scannedQuantity: args.quantity,
    scannedBy: null,
    scannedByName: args.userName,
    notes: null,
  };
}
```

- [ ] **Step 4: Ejecutar la prueba y verificar que pasa**

Run: `pnpm --filter web test -- scan-session-store`
Expected: PASS

- [ ] **Step 5: Cablear en la pantalla de escaneo**

En `escanear/page.tsx`, añadir los imports:

```ts
import { queueScan } from "@/features/inventory-counts/sync/sync";
import { buildScanInput } from "@/features/inventory-counts/build-scan-input";
import { ensureServerCount } from "@/features/inventory-counts/ensure-server-count";
import { setSessionServerId } from "@/features/inventory-counts/scan-session-store";
```

Dentro de `scanCode`, justo después de que `applyScan` devuelva un resultado con producto reconocido (es decir, donde hoy se muestra el toast de éxito), añadir:

```ts
    // Persistencia best-effort: si falla, el conteo sigue vivo en local.
    void (async () => {
      try {
        let srv = session.serverId ?? null;
        if (!srv) {
          srv = await ensureServerCount(session);
          if (srv) setSessionServerId(session.id, srv);
        }
        if (!srv || !producto) return;
        await queueScan(
          buildScanInput({
            serverCountId: srv,
            productId: producto.id,
            productLotId: null,
            branchId: session.branchId,
            warehouseId: warehouseId,
            barcode: raw,
            source: source === "reader" ? "reader" : "camera",
            quantity: 1,
            userName: session.startedByName ?? null,
          }),
        );
      } catch {
        /* la cola reintenta sola; nunca romper el escaneo */
      }
    })();
```

> `producto` es la variable local que ya resuelve `scanCode` antes de aplicar el escaneo, y `warehouseId` el del almacén de la sesión que la página ya calcula para el resumen. Si en el archivo tienen otro nombre, usa los existentes: no introduzcas variables nuevas.

- [ ] **Step 6: Verificar que no se rompió nada**

Run: `pnpm --filter web typecheck && pnpm --filter web test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/inventory-counts/build-scan-input.ts apps/web/src/features/inventory-counts/scan-session-store.test.ts "apps/web/src/app/(app)/conteo-fisico/[id]/escanear/page.tsx"
git commit -m "feat(conteo): los escaneos se guardan en la nube mientras se cuenta

queueScan ya existía con cola IndexedDB, sync inmediato y reintentos; solo
faltaba llamarlo. Ahora cada escaneo se encola contra la cabecera del conteo."
```

---

### Task 4: Recuperar un conteo sin sesión local

Si abres un conteo en otro equipo, hoy no ves nada. Se hidrata desde el servidor.

**Files:**
- Create: `apps/web/src/features/inventory-counts/hydrate-session.ts`
- Modify: `apps/web/src/app/(app)/conteo-fisico/[id]/escanear/page.tsx` (donde hoy retorna si `!session`)
- Test: `apps/web/src/features/inventory-counts/hydrate-session.test.ts`

**Interfaces:**
- Consumes: `GET /api/inventory-counts/[id]` (ya existe, devuelve `{ count, items, scans }`).
- Produces: `hydrateSessionFromServer(countId: string): Promise<CountSession | null>`.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// apps/web/src/features/inventory-counts/hydrate-session.test.ts
import { describe, it, expect, vi } from "vitest";
import { hydrateSessionFromServer } from "./hydrate-session";

describe("hydrateSessionFromServer", () => {
  it("convierte la respuesta del servidor en una sesión local", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      count: { id: "srv-1", countNumber: "CONT-7", branchId: "br1", countType: "full", status: "in_progress", startedAt: "2026-08-03T00:00:00Z", notes: null },
      items: [{ productId: "p1", productSku: "SKU-1", productName: "Producto 1", countedQuantity: 3, lastScanAt: "2026-08-03T01:00:00Z" }],
      scans: [],
    }), { status: 200 })));

    const s = await hydrateSessionFromServer("srv-1");
    expect(s?.serverId).toBe("srv-1");
    expect(s?.code).toBe("CONT-7");
    expect(s?.items).toEqual([
      { productId: "p1", sku: "SKU-1", productName: "Producto 1", countedQuantity: 3, lastScannedAt: "2026-08-03T01:00:00Z" },
    ]);
  });

  it("devuelve null si el conteo no existe", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    expect(await hydrateSessionFromServer("nope")).toBeNull();
  });

  it("devuelve null sin lanzar si la red falla", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sin red"); }));
    expect(await hydrateSessionFromServer("x")).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar la prueba y verificar que falla**

Run: `pnpm --filter web test -- hydrate-session`
Expected: FAIL — no existe el módulo

- [ ] **Step 3: Escribir la implementación**

```ts
// apps/web/src/features/inventory-counts/hydrate-session.ts
import type { CountSession } from "./scan-session-store";

/**
 * Reconstruye una sesión local desde el conteo guardado en Supabase. Sirve para
 * continuar un conteo empezado en otro dispositivo o recuperado tras limpiar el
 * navegador. Nunca lanza: sin red devuelve null y la pantalla decide qué mostrar.
 */
export async function hydrateSessionFromServer(countId: string): Promise<CountSession | null> {
  try {
    const res = await fetch(`/api/inventory-counts/${countId}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      count: { id: string; countNumber: string; branchId: string; countType: CountSession["type"]; status: string; startedAt: string; notes: string | null };
      items: Array<{ productId: string; productSku: string; productName: string; countedQuantity: number; lastScanAt: string | null }>;
    };
    const ahora = new Date().toISOString();
    return {
      id: data.count.id,
      serverId: data.count.id,
      code: data.count.countNumber,
      name: data.count.countNumber,
      branchId: data.count.branchId,
      type: data.count.countType,
      status: data.count.status === "approved" ? "approved" : "in_progress",
      notes: data.count.notes ?? undefined,
      startedAt: data.count.startedAt,
      items: data.items.map((it) => ({
        productId: it.productId,
        sku: it.productSku,
        productName: it.productName,
        countedQuantity: it.countedQuantity,
        lastScannedAt: it.lastScanAt ?? data.count.startedAt,
      })),
      scans: [],
      createdAt: data.count.startedAt,
      updatedAt: ahora,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Ejecutar la prueba y verificar que pasa**

Run: `pnpm --filter web test -- hydrate-session`
Expected: PASS (3 pruebas)

- [ ] **Step 5: Usarlo en la pantalla**

En `escanear/page.tsx`, añadir el import y el estado de recuperación, y usar la sesión recuperada donde hoy se usa `session`:

```ts
import { hydrateSessionFromServer } from "@/features/inventory-counts/hydrate-session";

// junto a los demás useState de la página
const [recuperada, setRecuperada] = React.useState<CountSession | null>(null);
const [recuperando, setRecuperando] = React.useState(false);

// tras el hook que obtiene la sesión local
React.useEffect(() => {
  const local = useScanSessionResult; // la sesión local que ya calcula la página
  if (local || !id) return;
  let vivo = true;
  setRecuperando(true);
  void hydrateSessionFromServer(id).then((s) => {
    if (!vivo) return;
    setRecuperada(s);
    setRecuperando(false);
  });
  return () => { vivo = false; };
}, [id]);
```

y sustituir la guarda actual de "no hay sesión" por:

```ts
const session = sesionLocal ?? recuperada;
if (!session) {
  return recuperando
    ? <EmptyState title="Recuperando el conteo…" description="Buscando este inventario en la nube." />
    : <EmptyState title="Conteo no encontrado" description="No existe ni en este dispositivo ni en la nube." />;
}
```

> `sesionLocal` es el nombre que le des al resultado de `useScanSession(id)` en la línea donde hoy se llama `session`. Renombra esa variable y deja `session` como la combinación de ambas: así el resto del render no cambia ni una línea.

- [ ] **Step 6: Verificar**

Run: `pnpm --filter web typecheck && pnpm --filter web test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/inventory-counts/hydrate-session.ts apps/web/src/features/inventory-counts/hydrate-session.test.ts "apps/web/src/app/(app)/conteo-fisico/[id]/escanear/page.tsx"
git commit -m "feat(conteo): un conteo se puede continuar desde otro dispositivo

Si no hay sesión local, la pantalla se hidrata desde el conteo guardado en
Supabase en vez de mostrarse vacía."
```

---

### Task 5: Limpiar los 3 conteos huérfanos

`224ce535`, `c76a2627` y `57aa1089` (13-jul) declaran `item_count = 1` y no tienen ítems. Son de prueba y envenenan cualquier informe.

**Files:**
- Create: `scripts/clean-orphan-counts.mjs`

- [ ] **Step 1: Escribir el script**

```js
#!/usr/bin/env node
/**
 * Borra conteos físicos huérfanos: cabeceras que declaran ítems pero no tienen
 * ninguna fila en `inventory_count_items`. DRY-RUN por defecto; respalda antes.
 *
 * Uso: node scripts/clean-orphan-counts.mjs [--apply]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");
const env = {};
for (const l of readFileSync(path.join(root, "apps/web/.env.local"), "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const U = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const K = env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };

const counts = await (await fetch(`${U}/rest/v1/inventory_counts?select=*`, { headers: h })).json();
const huerfanos = [];
for (const c of counts) {
  const items = await (await fetch(`${U}/rest/v1/inventory_count_items?inventory_count_id=eq.${c.id}&select=id`, { headers: h })).json();
  if (items.length === 0 && (c.item_count ?? 0) > 0) huerfanos.push(c);
}
console.log(`conteos: ${counts.length} · huérfanos: ${huerfanos.length}`);
for (const c of huerfanos) console.log(`  ${c.id} · ${c.status} · item_count=${c.item_count}`);

const outDir = path.join(root, "data/orphan-counts");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "antes.json"), JSON.stringify(huerfanos, null, 2));

if (!APPLY) { console.log("\nDRY-RUN: nada borrado. Agrega --apply."); process.exit(0); }
let ok = 0;
for (const c of huerfanos) {
  const r = await fetch(`${U}/rest/v1/inventory_counts?id=eq.${c.id}`, { method: "DELETE", headers: h });
  if (r.ok) ok++;
}
console.log(`\n=== BORRADOS: ${ok}/${huerfanos.length}. Respaldo en ${outDir}/antes.json ===`);
```

- [ ] **Step 2: Ejecutar la simulación**

Run: `node scripts/clean-orphan-counts.mjs`
Expected: lista los 3 huérfanos y no borra nada

- [ ] **Step 3: Pedir autorización antes de borrar**

Los datos son reales aunque sean de prueba. **No ejecutar `--apply` sin que el usuario lo confirme explícitamente.**

- [ ] **Step 4: Commit**

```bash
git add scripts/clean-orphan-counts.mjs
git commit -m "chore(conteo): script para limpiar cabeceras de conteo huérfanas"
```

---

## Cierre

- [ ] Actualizar `CHANGELOG.md` con una entrada `## [0.110.0]` describiendo: creación atómica, escaneos persistidos, recuperación entre dispositivos y limpieza de huérfanos.
- [ ] Subir la versión en `package.json` a `0.110.0`.
- [ ] `git push gitea main && git push origin main`.

## Verificación manual antes de dar por cerrado

1. Iniciar un conteo, escanear 3 productos y comprobar en Supabase que `inventory_count_scans` tiene 3 filas.
2. Limpiar el `localStorage` del navegador, recargar y comprobar que el conteo se recupera con sus ítems.
3. Poner el navegador en modo sin conexión, escanear 2 productos, volver a conectar y comprobar que suben solos sin duplicarse.
4. Aprobar un conteo y comprobar que `inventory_count_items` recibe las filas y que `item_count` coincide con el número real de ítems.
