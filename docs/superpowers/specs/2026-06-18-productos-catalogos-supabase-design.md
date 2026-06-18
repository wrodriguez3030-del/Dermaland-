# Diseño — Migrar Productos + catálogos a Supabase (fuente única)

> Fecha: 2026-06-18 · Proyecto Supabase: `sntcvyozbhrgicwmtcoh` (Cloud)
> Sigue el patrón validado en **Sucursales** (2026-06-18, ver
> `docs/auditoria-supabase.md`). Segundo módulo del plan de migración UI→Supabase.

## Objetivo y motivación

Hoy el catálogo de **productos, categorías, marcas y laboratorios** vive en
`localStorage`/`mock-data` por equipo → cada PC ve un catálogo distinto. Este
incremento mueve esas 4 entidades a Supabase como **fuente única compartida**,
con CRUD completo, manteniendo el camino local como modo demo/fallback.

Todo el camino Supabase queda **gated** por `NEXT_PUBLIC_DATA_SOURCE=supabase`
(cliente) + `DATA_SOURCE=supabase` (servidor). En modo `mock` (default, incl.
producción) nada cambia.

## Decisiones tomadas (brainstorming 2026-06-18)

1. **Productos:** CRUD completo compartido (read + write a Supabase).
2. **Catálogos (categorías/marcas/labs):** editables (CRUD) como en csl-app.
3. **Datos iniciales:** sembrar el catálogo mock/Alegra actual a Supabase (seed
   idempotente), que queda como fuente de verdad inicial.
4. **Alcance:** solo *master data*. **Fuera:** stock/inventario, lotes/
   vencimientos, e import en vivo de Alegra (módulos aparte del plan).
5. **Capa cliente:** replicar el molde `branches` por entidad (no abstracción
   genérica todavía).
6. **Borrado de catálogos:** hard-delete protegido por FK `RESTRICT` (sin
   migración nueva). Productos: soft-delete vía `deleted_at` existente.
7. **Seed:** script Node idempotente con `service_role`.

## Estado del esquema (verificado en `supabase/migrations/0002_phase2_inventory.sql`)

- **`products`**: tiene `deleted_at`, `active`, `sellable`, `sku`, `barcode`,
  `brand_id`/`laboratory_id`/`category_id` (FK), precios/itbis, etc.
  `unique(business_id, sku)`, índice único parcial en `barcode`. RLS por tenant.
  → Listo para CRUD con soft-delete. **Sin migración.**
- **`brands`**: `business_id`, `name`, `product_count`, timestamps,
  `unique(business_id, name)`. **Sin `deleted_at`.**
- **`laboratories`**: `business_id`, `name`, `country`, timestamps.
  **Sin `deleted_at`.**
- **`product_categories`**: `business_id`, `name`, `parent_id`, `description`,
  timestamps. **Sin `deleted_at`.**
- Los FK `products.brand_id/laboratory_id/category_id` son `RESTRICT` (sin
  `on delete cascade`) → borrar un catálogo en uso falla a nivel DB. Se usa como
  guardia de dependencias (análogo a `branchDependencies`).

## Arquitectura

Tres capas, todas gated por el data source:

1. **Repos servidor** (`server/repositories/supabase/*`) — agregar métodos de
   escritura. Conmutación mock↔supabase vía `getRepositories()`.
2. **API routes** (`app/api/*`) — RLS por JWT, 409 en modo mock.
3. **Cliente** (`features/products/*-store.ts` + páginas) — hooks que hacen
   fetch al servidor en modo supabase con fallback local; mutaciones vía wrappers
   que despachan local vs servidor.

## Componentes

### 1. Repos servidor (agregar escritura)

Interfaces en `server/repositories/types.ts` + impl en
`server/repositories/supabase/{product,catalog}.ts` (y el adaptador mock para
mantener el contrato):

- **`ProductRepository`**: `create(ctx, input)`, `update(ctx, id, patch)`,
  `softDelete(ctx, id)`. `list` debe filtrar `deleted_at is null`.
- **`CategoryRepository` / `BrandRepository` / `LaboratoryRepository`**:
  `create(ctx, input)`, `update(ctx, id, patch)`, `delete(ctx, id)` (hard).
- Mapeo `tsToRow` inline en cada `create/update` (patrón de `branch.ts`). Los
  `rowToTs` ya existen en `mappers.ts`.
- Traducción de errores: violación de `unique` → mensaje de duplicado; error FK
  en delete de catálogo → "en uso, no se puede eliminar".

### 2. API routes (molde `/api/branches`)

Cada una: `GET` (list), `POST` (create) en `route.ts`; `PATCH` (update) +
`DELETE` en `[id]/route.ts`. Todas: `dynamic = "force-dynamic"`, 409 si
`DATA_SOURCE !== "supabase"`, `getRepoContext()` para RLS.

- `/api/products` + `/api/products/[id]`
- `/api/categories` + `/api/categories/[id]`
- `/api/brands` + `/api/brands/[id]`
- `/api/laboratories` + `/api/laboratories/[id]`

### 3. Cliente — productos (`features/products/product-store.ts`)

- `PRODUCT_BACKEND: "local" | "supabase"` (como `BRANCH_BACKEND`).
- `fetchProductsFromServer()` → `GET /api/products`.
- `useProducts`/`useProduct`: en supabase, fetch + fallback a `listAllProducts()`
  local; en mock, comportamiento actual.
- Wrappers async: `saveProduct(mode, input, id?)`,
  `deleteProductAnywhere(id)` → despachan a API (`POST`/`PATCH`/`DELETE`) o store
  local. Notifican cambio (evento) para refetch.
- `product-form.tsx` / `new-product-form.tsx`: `submit` → `async`, usa
  `saveProduct`. Dropdowns de marca/categoría/lab dejan de leer mock estático y
  usan los hooks de catálogo (ver abajo).

### 4. Cliente — catálogos (NUEVO `features/products/catalog-store.ts`)

Hoy no existe store de catálogos (las páginas leen `mock-data/catalog.ts` +
`useLocalSoftDelete`). Crear, por cada entidad (category/brand/laboratory):

- `useCategories`/`useBrands`/`useLaboratories`: fetch al servidor en supabase
  con fallback al mock correspondiente en local.
- Wrappers `saveCategory`/`deleteCategoryAnywhere` (y brand/lab análogos).
- `CATALOG_BACKEND` (mismo gate).

### 5. UI de CRUD de catálogos (construir — hoy no existe)

Estado actual: botón "Nueva …" sin handler; `editHref` a rutas inexistentes
(`/productos/categorias/[id]/editar` → 404); `onDelete` solo `hide()` local.

Diseño: **modales inline** (no rutas nuevas) en cada página
(`categorias`/`marcas`/`laboratorios`):

- Botón "Nueva …" abre modal de alta.
- "Editar" (RowActions) abre el mismo modal con valores cargados (reemplaza el
  `editHref` roto).
- Campos por entidad:
  - Categoría: `name`, `description`, `parent_id` (opcional).
  - Marca: `name`.
  - Laboratorio: `name`, `country`.
- `onDelete` → `deleteXAnywhere(id)`; error FK → toast "No se puede eliminar:
  está en uso por productos".
- En modo local, los modales operan sobre el mock/store local (fallback) para no
  romper el modo demo.
- Reutiliza primitivos `Input`/`Select`/`Button`/`ConfirmDialog`/`useToast`. Si
  no hay `Modal` genérico en `components/ui`, agregar uno mínimo (verificar en el
  plan).

### 6. Banner de modo (cada página)

Igual que Sucursales: ámbar "este equipo (demo)" en local vs verde "fuente única
compartida" en supabase.

## Seed (`scripts/seed-catalog-supabase.mjs`)

- Idempotente, usa `SUPABASE_SERVICE_ROLE_KEY` (patrón de
  `scripts/bootstrap-preview-supabase-user.mjs`).
- Resuelve el `business_id` real del negocio sembrado.
- Orden: brands → laboratories → categories (upsert por `unique(business_id,
  name)`), construyendo mapa `mock-id → uuid`; luego products (upsert por
  `unique(business_id, sku)`) cableando `brand_id`/`category_id`/`laboratory_id`
  con ese mapa.
- Fuente: `mock-data/catalog.ts` + `catalog-imported.ts`.
- Re-ejecutable sin duplicar; loggea conteos (dry-run + real).

`brands.product_count` es denormalizado: se siembra, pero en este incremento NO
se mantiene transaccionalmente en cada alta/baja de producto. Se recalcula en
`brand.list` (count de products por brand, `deleted_at is null`) o se deja
best-effort. Decisión final en el plan.

## Manejo de errores

- Wrappers devuelven `{ ok: true, ... } | { ok: false, error }`; toast en cada
  callsite.
- `fetch` fallido (sesión/RLS/red) → fallback a datos locales, sin romper UI.
- Unicidad: `sku` de producto y `name` de catálogo (la DB tiene `unique`); el
  repo traduce a mensaje claro.
- Delete de catálogo en uso → error FK traducido a mensaje accionable.

## Testing y verificación

- **Unit (vitest):** stores nuevos en modo local (CRUD + fallback), siguiendo
  `branch-store.test.ts`. La suite actual (609) debe seguir verde.
- **Typecheck + build** verdes.
- **Seed:** correr 2× → conteos estables (idempotencia).
- **e2e real (2 PCs ven lo mismo):** depende de autenticar MCP + Preview con
  `DATA_SOURCE=supabase`. Documentado como verificación final (igual que
  Sucursales); no bloquea el merge del código gated.

## Orden de entrega (incremental, cada paso verde)

1. Repos servidor + API routes de **productos**.
2. **Seed** idempotente.
3. Cliente de **productos** (hooks + wrappers + formularios).
4. Repos + API + cliente + **UI de catálogos** (modales CRUD).

## Rollout / seguridad

- Producción intacta (sigue `mock`, 0 env vars en Vercel). Sin migraciones
  nuevas. Sin tocar DGII/fiscal. Sin deploy a prod.
- Gate único: `NEXT_PUBLIC_DATA_SOURCE=supabase` + `DATA_SOURCE=supabase`,
  primero en Preview.

## Fuera de alcance (explícito)

- Stock/inventario, lotes, vencimientos, movimientos.
- Import en vivo de Alegra (el seed cubre los datos actuales de Alegra una vez).
- Mantenimiento transaccional de `brands.product_count`.
- Migraciones `0011`/`0012` (otro módulo del plan).
