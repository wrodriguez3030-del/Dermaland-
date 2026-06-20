# Productos + catálogos Supabase — Implementation Plan (gaps restantes)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar las 4 brechas reales que quedan entre el spec `docs/superpowers/specs/2026-06-18-productos-catalogos-supabase-design.md` y el código ya en árbol, para que Productos + catálogos (categorías/marcas/laboratorios) funcionen como fuente única Supabase, gated, sin regresiones en modo mock.

**Architecture:** Tres capas ya construidas (repos servidor con CRUD, API routes `/api/{products,brands,categories,laboratories}` + `[id]`, stores cliente `product-store.ts`/`catalog-store.ts` con gate `*_BACKEND` y fallback local). Este plan NO reconstruye nada de eso: solo añade (1) traducción de errores Postgres a mensajes accionables, (2) wiring async correcto de las acciones de fila en la lista de productos + banner de modo, y cierra con (3) verificación (seed idempotente 2×, typecheck/build/suite, Preview gated).

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase (`@supabase/ssr`), vitest, Tailwind. Proyecto Supabase Cloud `sntcvyozbhrgicwmtcoh`.

## Estado verificado (2026-06-20) — NO reimplementar

Confirmado por lectura directa del árbol. Estos componentes del spec **ya existen y están completos**; trátalos como verificación, no como trabajo:

- Repos servidor: `server/repositories/supabase/product.ts` (`create`/`update`/`softDelete`) y `catalog.ts` (`brand`/`category`/`laboratory` `create`/`update`/`delete`). Interfaces en `server/repositories/types.ts`. Paridad mock en `server/repositories/mock/index.ts`.
- API routes: `app/api/products/route.ts` + `[id]/route.ts`, e idéntico para `brands`, `categories`, `laboratories`. Todas: `dynamic = "force-dynamic"`, 409 si `env.DATA_SOURCE !== "supabase"`, `getRepoContext()` para RLS.
- Cliente productos: `features/products/product-store.ts` — `PRODUCT_BACKEND`, `fetchProductsFromServer`, `saveProduct`, `deleteProductAnywhere`, hooks `useProducts`/`useProduct` con fetch+fallback.
- Cliente catálogos: `features/products/catalog-store.ts` — `CATALOG_BACKEND`, `useBrandsList`/`useCategoriesList`/`useLaboratoriesList`, `saveBrand`/`saveCategory`/`saveLaboratory`, `deleteXAnywhere`.
- UI catálogos: `features/products/catalog-form-dialog.tsx` + páginas `productos/{categorias,marcas,laboratorios}/page.tsx` con modales create/edit, delete con toast, y **banner de modo** (ámbar demo / verde compartido). Sin `editHref` roto.
- Formulario producto: `product-form.tsx`/`new-product-form.tsx` usan `saveProduct(...)` y dropdowns desde `useBrandsList/useCategoriesList/useLaboratoriesList`.
- Páginas producto: `productos/page.tsx`, `[id]/page.tsx`, `[id]/editar/page.tsx`, `nuevo/page.tsx` usan hooks reactivos.
- Seed: `scripts/seed-catalog-supabase.mjs` (idempotente, dry-run, mapas mock-id→uuid). `scripts/verify-catalog-branches.mjs`.
- Tests: `product-store.test.ts`, `catalog-store.test.ts` (modo local).

## Global Constraints

- **Gate único:** todo el camino Supabase queda detrás de `NEXT_PUBLIC_DATA_SOURCE=supabase` (cliente, inlined en build) + `DATA_SOURCE=supabase` (servidor). En modo `mock` (default, incl. producción) **nada cambia de comportamiento**.
- **NO TOCAR:** Production, Vercel Production env, deploy a producción (`--prod`), DNS, DGII/`testecf`/producción fiscal, certificados, secuencias reales. No borrar datos reales, no `reset`/`truncate`, no imprimir secretos.
- **Sin migraciones nuevas.** El esquema (`products` con `deleted_at`; `brands`/`laboratories`/`product_categories` con FK `RESTRICT`) ya soporta todo.
- **La suite actual debe seguir verde** (línea base: correr `pnpm --filter web exec vitest run` ANTES de empezar y anotar el conteo; ningún test existente puede romperse).
- **Borrado:** productos = soft-delete (`deleted_at`). Catálogos = hard-delete protegido por FK `RESTRICT` (borrar uno en uso falla en DB → se traduce a mensaje accionable).
- Wrappers cliente devuelven `{ ok: true, ... } | { ok: false, error }`; cada callsite hace toast.
- Patrón de molde = `branches` (`features/tenancy/branch-store.ts`, `app/api/branches/*`). Replicar su estilo, no inventar abstracciones nuevas.

---

## File Structure

- **Modificar** `apps/web/src/server/repositories/supabase/client.ts` — añadir clase `UserFacingRepositoryError` (sin prefijo) + helper `failRepo(method, error)` que traduce códigos Postgres (23505/23503) a mensajes accionables o reenvía el error original.
- **Modificar** `apps/web/src/server/repositories/supabase/catalog.ts` — en `create`/`update`/`delete` de brand/category/laboratory, lanzar vía `failRepo(...)` en vez de `throw new SupabaseRepositoryError(...)`.
- **Modificar** `apps/web/src/server/repositories/supabase/product.ts` — en `create`/`update` de `productRepository`, lanzar vía `failRepo(...)` (duplicado de SKU/barcode).
- **Crear** `apps/web/src/server/repositories/supabase/errors.test.ts` — unit test puro de la traducción (sin red).
- **Modificar** `apps/web/src/features/products/product-store.ts` — añadir wrapper `setProductActiveAnywhere(id, active)` (paralelo a `setBranchActiveAnywhere`).
- **Modificar** `apps/web/src/features/products/product-store.test.ts` — cubrir `setProductActiveAnywhere` en modo local.
- **Modificar** `apps/web/src/app/(app)/productos/page.tsx` — acciones de fila usan `deleteProductAnywhere` + `setProductActiveAnywhere` (async, con toast de error); añadir banner de modo `PRODUCT_BACKEND`.

---

## Task 1: Traducción de errores Postgres (repo layer)

El spec exige: violación `unique` → mensaje de duplicado; FK en delete de catálogo → "en uso, no se puede eliminar". Hoy los repos lanzan `SupabaseRepositoryError` con el mensaje crudo de PostgREST (prefijado `SupabaseRepository:`), que llega tal cual al toast. Esta tarea traduce los dos códigos relevantes a texto accionable y limpio, sin prefijo.

**Files:**
- Modify: `apps/web/src/server/repositories/supabase/client.ts`
- Test: `apps/web/src/server/repositories/supabase/errors.test.ts` (create)
- Modify: `apps/web/src/server/repositories/supabase/catalog.ts`
- Modify: `apps/web/src/server/repositories/supabase/product.ts`

**Interfaces:**
- Consumes: `SupabaseRepositoryError` (ya existe en `client.ts`).
- Produces: `class UserFacingRepositoryError extends Error`; `function failRepo(method: string, error: unknown): never`. `failRepo` SIEMPRE lanza: si el `error.code` es 23505 → `UserFacingRepositoryError("Ya existe un registro con ese valor (duplicado).")`; si es 23503 → `UserFacingRepositoryError("No se puede eliminar: está en uso por otros registros.")`; en cualquier otro caso → `SupabaseRepositoryError(method, error)` (comportamiento actual).

- [ ] **Step 1: Escribir el test que falla** (`apps/web/src/server/repositories/supabase/errors.test.ts`)

```typescript
import { describe, expect, it } from "vitest";
import {
  failRepo,
  SupabaseRepositoryError,
  UserFacingRepositoryError,
} from "./client";

function callFail(code: string | undefined) {
  try {
    failRepo("brand.delete", code ? { code, message: "pg error" } : { message: "boom" });
  } catch (e) {
    return e as Error;
  }
  throw new Error("failRepo no lanzó");
}

describe("failRepo", () => {
  it("traduce 23505 (unique violation) a mensaje de duplicado", () => {
    const e = callFail("23505");
    expect(e).toBeInstanceOf(UserFacingRepositoryError);
    expect(e.message).toMatch(/duplicad/i);
    // El mensaje NO debe llevar el prefijo técnico.
    expect(e.message).not.toMatch(/SupabaseRepository:/);
  });

  it("traduce 23503 (FK violation) a 'en uso'", () => {
    const e = callFail("23503");
    expect(e).toBeInstanceOf(UserFacingRepositoryError);
    expect(e.message).toMatch(/en uso/i);
  });

  it("reenvía cualquier otro error como SupabaseRepositoryError", () => {
    const e = callFail(undefined);
    expect(e).toBeInstanceOf(SupabaseRepositoryError);
    expect(e.message).toMatch(/SupabaseRepository: brand\.delete/);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm --filter web exec vitest run src/server/repositories/supabase/errors.test.ts`
Expected: FAIL — `failRepo` y `UserFacingRepositoryError` no existen aún.

- [ ] **Step 3: Implementar en `client.ts`** (añadir DESPUÉS de la clase `SupabaseRepositoryError` existente; no tocar `getClient` ni `AnySupabase`)

```typescript
/**
 * Error con mensaje ya apto para mostrar al usuario (sin prefijo técnico).
 * Las rutas API devuelven `(e as Error).message` directo al cliente, así que
 * este mensaje termina en el toast tal cual.
 */
export class UserFacingRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingRepositoryError";
  }
}

/** Códigos Postgres que sabemos traducir a lenguaje de usuario. */
function pgErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * Lanza SIEMPRE. Traduce las violaciones de restricción Postgres más comunes a
 * un mensaje accionable; el resto se reenvía como `SupabaseRepositoryError`
 * (comportamiento actual, con prefijo técnico para logs).
 *
 *  - 23505 unique_violation → "duplicado"
 *  - 23503 foreign_key_violation (delete de catálogo en uso) → "en uso"
 */
export function failRepo(method: string, error: unknown): never {
  const code = pgErrorCode(error);
  if (code === "23505") {
    throw new UserFacingRepositoryError(
      "Ya existe un registro con ese valor (duplicado).",
    );
  }
  if (code === "23503") {
    throw new UserFacingRepositoryError(
      "No se puede eliminar: está en uso por otros registros.",
    );
  }
  throw new SupabaseRepositoryError(method, error);
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm --filter web exec vitest run src/server/repositories/supabase/errors.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Aplicar `failRepo` en `catalog.ts`**

En `catalog.ts`, importar `failRepo` junto a lo existente:

```typescript
import { SupabaseRepositoryError, failRepo, getClient } from "./client";
```

Y en CADA `create`, `update` y `delete` de `brandRepository`, `categoryRepository`, `laboratoryRepository`, reemplazar la línea de throw. Ejemplo (brand.create):

```typescript
    if (error) throw failRepo("brand.create", error);
```

Aplicar el mismo reemplazo (`throw new SupabaseRepositoryError("X", error)` → `throw failRepo("X", error)`) en los 9 sitios: `{brand,category,laboratory}.{create,update,delete}`. **No** tocar los `list`/`byId` (lectura: dejarlos con `SupabaseRepositoryError`).

- [ ] **Step 6: Aplicar `failRepo` en `product.ts`**

En `product.ts`, importar `failRepo`:

```typescript
import { SupabaseRepositoryError, failRepo, getClient } from "./client";
```

Reemplazar el throw en `productRepository.create` y `productRepository.update` (duplicado de SKU/barcode):

```typescript
    if (error) throw failRepo("product.create", error);
```
```typescript
    if (error) throw failRepo("product.update", error);
```

**No** tocar `list`/`byId`/`byBarcode`/`totalStock`/`softDelete` ni nada de `productLotRepository`.

- [ ] **Step 7: Typecheck + suite afectada**

Run: `pnpm --filter web typecheck`
Expected: 0 errores.
Run: `pnpm --filter web exec vitest run src/server/repositories`
Expected: PASS (incluye `errors.test.ts` + repos existentes).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/server/repositories/supabase/client.ts apps/web/src/server/repositories/supabase/errors.test.ts apps/web/src/server/repositories/supabase/catalog.ts apps/web/src/server/repositories/supabase/product.ts
git commit -m "feat(productos): traducir errores Postgres (duplicado/FK en uso) a mensaje accionable"
```

---

## Task 2: Acciones de fila de Productos en modo Supabase + banner

`productos/page.tsx` es la única página del módulo que aún llama a las mutaciones **síncronas locales** (`deleteProduct`, `updateProduct`) en las acciones de fila. En modo `supabase` esas escriben a overlays de localStorage que `useProducts` ignora (lee del servidor) → eliminar/inactivar/reactivar desde la lista **no persiste**. Además es la única página del módulo **sin banner de modo**. Esta tarea la alinea con el resto.

**Files:**
- Modify: `apps/web/src/features/products/product-store.ts`
- Test: `apps/web/src/features/products/product-store.test.ts`
- Modify: `apps/web/src/app/(app)/productos/page.tsx`

**Interfaces:**
- Consumes: `PRODUCT_BACKEND`, `deleteProductAnywhere`, `updateProduct`, `updateProductOnServer` (ya en `product-store.ts`).
- Produces: `async function setProductActiveAnywhere(id: string, active: boolean): Promise<{ ok: boolean; error?: string }>` — en supabase hace `PATCH /api/products/:id { active }`; en local llama a `updateProduct(id, { active })`. Mismo shape que `deleteProductAnywhere`.

- [ ] **Step 1: Escribir el test que falla** (añadir a `apps/web/src/features/products/product-store.test.ts`)

```typescript
import { setProductActiveAnywhere } from "./product-store";

describe("setProductActiveAnywhere (modo local)", () => {
  it("inactiva un producto del seed vía override local", async () => {
    const all = listAllProducts();
    const target = all[0]!;
    const res = await setProductActiveAnywhere(target.id, false);
    expect(res.ok).toBe(true);
    const after = listAllProducts().find((p) => p.id === target.id);
    expect(after?.active).toBe(false);
  });
});
```

> Nota: respeta los imports/helpers de limpieza de localStorage que ya usa el archivo de test (mismo patrón `beforeEach`). Si `listAllProducts` no está importado en el test, añádelo al import existente de `./product-store`.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm --filter web exec vitest run src/features/products/product-store.test.ts`
Expected: FAIL — `setProductActiveAnywhere` no existe.

- [ ] **Step 3: Implementar `setProductActiveAnywhere`** en `product-store.ts` (junto a `deleteProductAnywhere`)

```typescript
/**
 * Activa/inactiva un producto, despachando local vs servidor según el backend.
 * Paralelo a `setBranchActiveAnywhere`. En supabase hace PATCH parcial.
 */
export async function setProductActiveAnywhere(
  id: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (PRODUCT_BACKEND === "supabase") {
    const r = await updateProductOnServer(id, { active });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }
  const r = updateProduct(id, { active });
  return { ok: r.ok };
}
```

> `updateProductOnServer` ya existe en el archivo (la usa `saveProduct`); si está declarada como `async function` más abajo, el hoisting la hace visible — no hay que reordenar. Verifícalo tras editar con el typecheck.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm --filter web exec vitest run src/features/products/product-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Cablear las acciones de fila + banner en `productos/page.tsx`**

5a. Ampliar el import desde `product-store`:

```typescript
import {
  deleteProductAnywhere,
  setProductActiveAnywhere,
  useProducts,
  PRODUCT_BACKEND,
} from "@/features/products/product-store";
```

Quitar `deleteProduct` y `updateProduct` del import si dejan de usarse en el archivo (verificar que no se usen en otro punto; si se usan, déjalos).

5b. Reemplazar el `onDelete` de `RowActions` (la llamada síncrona) por la async con manejo de error:

```typescript
                    onDelete={async () => {
                      const res = await deleteProductAnywhere(p.id);
                      if (!res.ok) toast.error(res.error ?? "No se pudo eliminar.");
                      else toast.success("Producto eliminado correctamente.");
                    }}
```

5c. Reemplazar los `onClick` de Inactivar/Reactivar (que llaman `updateProduct`) por `setProductActiveAnywhere`:

```typescript
                            onClick: async () => {
                              const res = await setProductActiveAnywhere(p.id, false);
                              if (!res.ok) toast.error(res.error ?? "No se pudo inactivar.");
                              else toast.success(`${p.name} inactivado.`);
                            },
```
```typescript
                            onClick: async () => {
                              const res = await setProductActiveAnywhere(p.id, true);
                              if (!res.ok) toast.error(res.error ?? "No se pudo reactivar.");
                              else toast.success(`${p.name} reactivado.`);
                            },
```

5d. Añadir el banner de modo justo bajo `<PageHeader ... />` (mismo texto/markup que `marcas/page.tsx`, adaptado a productos):

```tsx
      <div className={`mb-4 rounded-xl border px-4 py-2.5 text-xs ${PRODUCT_BACKEND === "local" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
        {PRODUCT_BACKEND === "local"
          ? "Los cambios se guardan en este equipo (modo demo, sin Supabase)."
          : "Los productos son una fuente única compartida (Supabase). Los cambios se ven en todos los equipos."}
      </div>
```

- [ ] **Step 6: Typecheck + tests del módulo**

Run: `pnpm --filter web typecheck`
Expected: 0 errores.
Run: `pnpm --filter web exec vitest run src/features/products`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/products/product-store.ts apps/web/src/features/products/product-store.test.ts "apps/web/src/app/(app)/productos/page.tsx"
git commit -m "fix(productos): lista usa wrappers async (delete/activar) en modo supabase + banner de modo"
```

---

## Task 3: Verificación integral (seed idempotente, suite, build, Preview gated)

Cierre del incremento: probar que el seed es idempotente, que la suite/typecheck/build quedan verdes, y desplegar a **Preview** (nunca prod) para la verificación real "2 PCs ven lo mismo". NO crea código de feature.

**Files:** ninguno de producción (solo ejecución y, si hace falta, ajuste menor del seed).

- [ ] **Step 1: Suite completa verde**

Run: `pnpm --filter web exec vitest run`
Expected: PASS, conteo ≥ línea base anotada al inicio del plan (sin tests rotos).

- [ ] **Step 2: Typecheck + build**

Run: `pnpm --filter web typecheck`
Expected: 0 errores.
Run: `pnpm --filter web build`
Expected: build OK.

- [ ] **Step 3: Seed idempotente (dry-run primero)**

> Requiere `apps/web/.env.local` con `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` reales (ya presentes). NO imprimir secretos. NO correr contra producción fiscal (esto es master data, no DGII).

Run (dry-run): `node scripts/seed-catalog-supabase.mjs --dry-run`
Expected: loggea conteos a sembrar, sin escribir.

Run (real, 1ª vez): `node scripts/seed-catalog-supabase.mjs`
Expected: siembra brands/labs/categories/products; loggea conteos.

Run (real, 2ª vez): `node scripts/seed-catalog-supabase.mjs`
Expected: **mismos conteos**, 0 inserts nuevos (idempotencia por `unique(business_id,name)` / `unique(business_id,sku)`). Si la 2ª corrida duplica algo, corregir el upsert del seed y repetir.

- [ ] **Step 4: Verificación cruzada de catálogo**

Run: `node scripts/verify-catalog-branches.mjs`
Expected: reporta catálogo en Supabase consistente (sin huérfanos de brand/category/lab).

- [ ] **Step 5: Deploy a Preview (gated, NUNCA prod)**

> El gate es por env del scope Preview. Confirmar que Preview tiene `DATA_SOURCE=supabase` y `NEXT_PUBLIC_DATA_SOURCE=supabase` (Production NO los tiene → sigue en mock).

Run: `cd apps/web && vercel env ls` → confirmar Preview tiene ambos en supabase, Production NO.
Run: `cd apps/web && vercel deploy --yes`  (Preview; **sin `--prod`**)
Expected: URL de Preview "Ready".

- [ ] **Step 6: Verificación visual en Preview**

En la URL de Preview, abrir `Productos` y `Productos > Marcas/Categorías/Laboratorios`:
1. Banner verde "fuente única compartida" en todas.
2. Crear/editar/eliminar una marca de prueba → persiste tras refresh.
3. Intentar eliminar una marca **en uso** por un producto → toast "No se puede eliminar: está en uso por otros registros." (Task 1).
4. Crear producto con SKU duplicado → toast de duplicado (Task 1).
5. Eliminar/inactivar un producto desde la lista → persiste tras refresh (Task 2).

- [ ] **Step 7: Commit (si el seed necesitó ajuste)**

```bash
git add scripts/seed-catalog-supabase.mjs
git commit -m "chore(seed): asegurar idempotencia del catálogo (verificación)"
```

---

## Self-Review (hecha al escribir el plan)

1. **Cobertura del spec:** Componentes 1–6 + seed del spec → ya en árbol (sección "Estado verificado"); las únicas brechas reales (traducción de errores, wiring async de la lista de productos + banner, verificación/seed idempotente) están cubiertas por Tasks 1–3. Fuera de alcance del spec (stock/lotes, import Alegra en vivo, `product_count` transaccional, migraciones 0011/0012) — no se tocan.
2. **Placeholders:** ninguno; cada step de código trae el código real.
3. **Consistencia de tipos:** `setProductActiveAnywhere` devuelve `{ ok; error? }` igual que `deleteProductAnywhere`; `failRepo(method, error): never` y `UserFacingRepositoryError` usados con las mismas firmas en test e implementación; los reemplazos en `catalog.ts`/`product.ts` conservan el primer argumento `method` ya existente.

## Execution Handoff

Plan guardado en `docs/superpowers/plans/2026-06-20-productos-catalogos-supabase.md`. Alcance reducido (3 tasks) porque el spec estaba ~90% implementado. Recomendación: **Subagent-Driven** (un subagente por task, review entre tasks). Alternativa: ejecución inline con checkpoints.
