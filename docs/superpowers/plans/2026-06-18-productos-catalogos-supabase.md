# Migrar Productos + catálogos a Supabase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir Productos, Categorías, Marcas y Laboratorios en fuente única compartida sobre Supabase (CRUD completo) manteniendo localStorage/mock como modo demo y fallback.

**Architecture:** Tres capas gated por el data source: (1) repos servidor (`server/repositories/{supabase,mock}`) ganan métodos de escritura; (2) API routes en `app/api/*` con RLS por JWT (409 en mock); (3) cliente (`features/products/*-store.ts` + páginas) con hooks que hacen fetch al servidor en modo supabase y fallback local, más wrappers async que despachan local vs servidor. Espejo exacto del patrón ya validado en Sucursales.

**Tech Stack:** Next.js 15.5.18 (App Router), React 19, TypeScript, Supabase (`@supabase/ssr`), vitest 4, pnpm monorepo (`apps/web`).

## Global Constraints

- Gate único: camino Supabase solo activo con `NEXT_PUBLIC_DATA_SOURCE=supabase` (cliente) **y** `DATA_SOURCE=supabase` (servidor). Default `mock` → producción intacta.
- Productos: soft-delete vía columna `deleted_at` existente. `list` filtra `deleted_at is null`.
- Catálogos (brands/laboratories/product_categories): hard-delete; el FK `RESTRICT` de `products` es la guardia (borrar en uso → error DB traducido a mensaje).
- **Sin migraciones nuevas.** El esquema de `0002_phase2_inventory.sql` ya alcanza.
- RLS por `business_id = auth_business_id()` en todas las tablas. El `business_id` SIEMPRE viene del JWT (`getRepoContext`), nunca de body/query.
- Business UUID real del seed (de `scripts/bootstrap-preview-supabase-user.mjs`): `00000000-0000-0000-0000-00000000d001`.
- Cada repo del contrato `Repositories` debe implementar su interfaz: al extender una interfaz, **mock y supabase** deben implementar los métodos nuevos.
- No tocar DGII/fiscal. No deploy a producción. Mantener la suite vitest verde (609 actuales) y `typecheck`/`build` verdes.
- Comandos: `pnpm --filter web typecheck` · `pnpm --filter web exec vitest run` · `pnpm --filter web build`. Un test puntual: `pnpm --filter web exec vitest run <ruta> -t "<nombre>"`.

---

## File Structure

**Servidor (repos):**
- Modify `apps/web/src/server/repositories/types.ts` — extender `ProductRepository`, `BrandRepository`, `CategoryRepository`, `LaboratoryRepository`.
- Modify `apps/web/src/server/repositories/supabase/product.ts` — `create`/`update`/`softDelete`; `list` filtra `deleted_at`.
- Modify `apps/web/src/server/repositories/supabase/catalog.ts` — `create`/`update`/`delete` en los 3.
- Modify `apps/web/src/server/repositories/mock/index.ts` — overlays en memoria + métodos de escritura mock + `__resetCatalogMockWrites()`.

**Servidor (API):**
- Create `apps/web/src/app/api/products/route.ts` (GET, POST)
- Create `apps/web/src/app/api/products/[id]/route.ts` (PATCH, DELETE)
- Create `apps/web/src/app/api/categories/route.ts` (GET, POST)
- Create `apps/web/src/app/api/categories/[id]/route.ts` (PATCH, DELETE)
- Create `apps/web/src/app/api/brands/route.ts` (GET, POST)
- Create `apps/web/src/app/api/brands/[id]/route.ts` (PATCH, DELETE)
- Create `apps/web/src/app/api/laboratories/route.ts` (GET, POST)
- Create `apps/web/src/app/api/laboratories/[id]/route.ts` (PATCH, DELETE)

**Seed:**
- Create `scripts/seed-catalog-supabase.mjs`

**Cliente:**
- Modify `apps/web/src/features/products/product-store.ts` — backend gate, fetch, wrappers, hook server-mode.
- Create `apps/web/src/features/products/catalog-store.ts` — hooks + wrappers de los 3 catálogos.
- Modify `apps/web/src/features/products/product-form.tsx` — `submit` async + dropdowns desde hooks.
- Modify `apps/web/src/features/products/new-product-form.tsx` — `submit` async (si aplica).
- Create `apps/web/src/components/ui/modal.tsx` — primitivo Modal + export en `components/ui/index.ts`.
- Create `apps/web/src/features/products/catalog-form-dialog.tsx` — modal de alta/edición reutilizable.
- Modify `apps/web/src/app/(app)/productos/marcas/page.tsx`
- Modify `apps/web/src/app/(app)/productos/categorias/page.tsx`
- Modify `apps/web/src/app/(app)/productos/laboratorios/page.tsx`

**Tests:**
- Create `apps/web/src/server/repositories/catalog-repo.test.ts`
- Create `apps/web/src/features/products/catalog-store.test.ts`
- Modify `apps/web/src/features/products/product-store.test.ts` (añadir casos de wrappers/dispatch)
- Modify `docs/auditoria-supabase.md` y `docs/proximos-pasos.md` al cierre.

---

## Stage A — Productos: escritura en servidor

### Task 1: Métodos de escritura en `ProductRepository` (interfaz + mock + supabase)

**Files:**
- Modify: `apps/web/src/server/repositories/types.ts:118-129`
- Modify: `apps/web/src/server/repositories/mock/index.ts:204-230`
- Modify: `apps/web/src/server/repositories/supabase/product.ts`
- Test: `apps/web/src/server/repositories/catalog-repo.test.ts` (nuevo, se amplía en Task 2)

**Interfaces:**
- Produces:
  - `ProductRepository.create(ctx, input: Omit<Product, "id"|"createdAt"|"updatedAt"|"deletedAt">): Promise<Product>`
  - `ProductRepository.update(ctx, id: ID, patch: Partial<Product>): Promise<Product>`
  - `ProductRepository.softDelete(ctx, id: ID): Promise<void>`
  - `__resetCatalogMockWrites(): void` (helper de test exportado desde `mock/index.ts`)

- [ ] **Step 1: Escribir el test que falla** (mock repo create/update/softDelete)

Create `apps/web/src/server/repositories/catalog-repo.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import {
  mockRepositories,
  __resetCatalogMockWrites,
} from "@/server/repositories/mock";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import type { RepoContext } from "@/server/repositories";

const ctx: RepoContext = { businessId: mockBusiness.id, userId: "usr_test" };

afterEach(() => {
  __resetCatalogMockWrites();
});

describe("ProductRepository (mock) — escritura", () => {
  it("create() agrega un producto del negocio y lo lista", async () => {
    const created = await mockRepositories.product.create(ctx, {
      businessId: mockBusiness.id,
      sku: "TEST-SKU-1",
      name: "Producto de prueba",
      unit: "unidad",
      requiresPrescription: false,
      controlled: false,
      cost: 0,
      price: 100,
      itbisRate: 18,
      minStock: 0,
      maxStock: 0,
      active: true,
      sellable: true,
    });
    expect(created.id).toBeTruthy();
    const all = await mockRepositories.product.list(ctx);
    expect(all.some((p) => p.sku === "TEST-SKU-1")).toBe(true);
  });

  it("update() aplica patch", async () => {
    const created = await mockRepositories.product.create(ctx, {
      businessId: mockBusiness.id,
      sku: "TEST-SKU-2",
      name: "Antes",
      unit: "unidad",
      requiresPrescription: false,
      controlled: false,
      cost: 0,
      price: 50,
      itbisRate: 18,
      minStock: 0,
      maxStock: 0,
      active: true,
      sellable: true,
    });
    const updated = await mockRepositories.product.update(ctx, created.id, {
      name: "Después",
    });
    expect(updated.name).toBe("Después");
  });

  it("softDelete() lo saca del list", async () => {
    const created = await mockRepositories.product.create(ctx, {
      businessId: mockBusiness.id,
      sku: "TEST-SKU-3",
      name: "Borrar",
      unit: "unidad",
      requiresPrescription: false,
      controlled: false,
      cost: 0,
      price: 10,
      itbisRate: 18,
      minStock: 0,
      maxStock: 0,
      active: true,
      sellable: true,
    });
    await mockRepositories.product.softDelete(ctx, created.id);
    const all = await mockRepositories.product.list(ctx);
    expect(all.some((p) => p.id === created.id)).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `pnpm --filter web exec vitest run src/server/repositories/catalog-repo.test.ts`
Expected: FAIL — `mockRepositories.product.create is not a function` y `__resetCatalogMockWrites` no exportado.

- [ ] **Step 3: Extender la interfaz** en `types.ts` (reemplazar el bloque `ProductRepository`):

```ts
export interface ProductRepository {
  list(ctx: RepoContext, opts?: {
    search?: string;
    brandId?: ID;
    categoryId?: ID;
    activeOnly?: boolean;
    limit?: number;
  }): Promise<Product[]>;
  byId(ctx: RepoContext, id: ID): Promise<Product | null>;
  byBarcode(ctx: RepoContext, barcode: string): Promise<Product | null>;
  totalStock(ctx: RepoContext, productId: ID): Promise<number>;
  create(
    ctx: RepoContext,
    input: Omit<Product, "id" | "createdAt" | "updatedAt" | "deletedAt">,
  ): Promise<Product>;
  update(ctx: RepoContext, id: ID, patch: Partial<Product>): Promise<Product>;
  softDelete(ctx: RepoContext, id: ID): Promise<void>;
}
```

- [ ] **Step 4: Implementar overlays + escritura en el mock** (`mock/index.ts`)

Cerca del tope del archivo (tras los imports), agregar el overlay y helper:

```ts
// ─── Overlays de escritura para catálogo (no mutar los mock-data seed) ───────
let extraProducts: Product[] = [];
const deletedProductIds = new Set<string>();
const productPatches: Record<string, Partial<Product>> = {};

export function __resetCatalogMockWrites(): void {
  extraProducts = [];
  deletedProductIds.clear();
  for (const k of Object.keys(productPatches)) delete productPatches[k];
  extraBrands = [];
  deletedBrandIds.clear();
  for (const k of Object.keys(brandPatches)) delete brandPatches[k];
  extraCategories = [];
  deletedCategoryIds.clear();
  for (const k of Object.keys(categoryPatches)) delete categoryPatches[k];
  extraLaboratories = [];
  deletedLaboratoryIds.clear();
  for (const k of Object.keys(laboratoryPatches)) delete laboratoryPatches[k];
}

function mockProductsView(businessId: string): Product[] {
  const base = mockProducts
    .filter((p) => p.businessId === businessId)
    .map((p) => (productPatches[p.id] ? { ...p, ...productPatches[p.id] } : p));
  return [...base, ...extraProducts.filter((p) => p.businessId === businessId)]
    .filter((p) => !deletedProductIds.has(p.id));
}

function mockGenId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
```

> `Product` ya está importado en `mock/index.ts` (lo usa `ProductRepository`). Si no, agregar `Product` al import de `@/types`. Las declaraciones `extraBrands`/`deletedBrandIds`/`brandPatches` y análogas se agregan en Task 2; este `__resetCatalogMockWrites` ya las referencia, así que **Task 2 debe completarse para que compile** — o, si se ejecuta Task 1 aislado, declarar los `let extraBrands... = []` vacíos junto al de productos ahora. Para evitar fricción, declarar las 4 familias de overlay (products/brands/categories/laboratories) en este mismo step:

```ts
let extraBrands: Brand[] = [];
const deletedBrandIds = new Set<string>();
const brandPatches: Record<string, Partial<Brand>> = {};

let extraCategories: Category[] = [];
const deletedCategoryIds = new Set<string>();
const categoryPatches: Record<string, Partial<Category>> = {};

let extraLaboratories: Laboratory[] = [];
const deletedLaboratoryIds = new Set<string>();
const laboratoryPatches: Record<string, Partial<Laboratory>> = {};
```

Asegurar que `Brand`, `Category`, `Laboratory` estén en el import de `@/types` en `mock/index.ts`.

Reemplazar el objeto `const product: ProductRepository = { ... }` para usar la vista y agregar escritura:

```ts
const product: ProductRepository = {
  async list(ctx, opts) {
    guard(ctx);
    const q = (opts?.search ?? "").toLowerCase();
    return mockProductsView(ctx.businessId)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode?.includes(q))
      .filter((p) => !opts?.brandId || p.brandId === opts.brandId)
      .filter((p) => !opts?.categoryId || p.categoryId === opts.categoryId)
      .filter((p) => !opts?.activeOnly || p.active)
      .slice(0, opts?.limit ?? 100);
  },
  async byId(ctx, id) {
    guard(ctx);
    return mockProductsView(ctx.businessId).find((p) => p.id === id) ?? null;
  },
  async byBarcode(ctx, barcode) {
    guard(ctx);
    return (
      mockProductsView(ctx.businessId).find((p) => p.barcode === barcode) ?? null
    );
  },
  async totalStock(ctx, productId) {
    guard(ctx);
    return totalStockForProduct(productId);
  },
  async create(ctx, input) {
    guard(ctx);
    const now = new Date().toISOString();
    const created: Product = {
      ...input,
      businessId: ctx.businessId,
      id: mockGenId("prod"),
      createdAt: now,
      updatedAt: now,
    };
    extraProducts.push(created);
    return created;
  },
  async update(ctx, id, patch) {
    guard(ctx);
    productPatches[id] = { ...(productPatches[id] ?? {}), ...patch };
    const found = mockProductsView(ctx.businessId).find((p) => p.id === id);
    if (!found) throw new Error("Producto no encontrado");
    return found;
  },
  async softDelete(ctx, id) {
    guard(ctx);
    deletedProductIds.add(id);
  },
};
```

- [ ] **Step 5: Implementar `create`/`update`/`softDelete` en supabase** (`supabase/product.ts`)

En `list`, agregar el filtro de soft-delete (tras `.eq("business_id", ...)`): `.is("deleted_at", null)`. Luego agregar al objeto `productRepository`:

```ts
  async create(ctx, input) {
    const sb = await getClient("product.create");
    const row: Record<string, unknown> = {
      business_id: ctx.businessId,
      sku: input.sku,
      barcode: input.barcode ?? null,
      name: input.name,
      description: input.description ?? null,
      brand_id: input.brandId ?? null,
      laboratory_id: input.laboratoryId ?? null,
      category_id: input.categoryId ?? null,
      unit: input.unit,
      pharmaceutical_form: input.pharmaceuticalForm ?? null,
      presentation: input.presentation ?? null,
      active_ingredient: input.activeIngredient ?? null,
      concentration: input.concentration ?? null,
      sanitary_registry: input.sanitaryRegistry ?? null,
      storage_temperature: input.storageTemperature ?? null,
      requires_prescription: input.requiresPrescription,
      controlled: input.controlled,
      cost: input.cost,
      price: input.price,
      itbis_rate: input.itbisRate,
      min_stock: input.minStock,
      max_stock: input.maxStock,
      image_url: input.imageUrl ?? null,
      active: input.active,
      sellable: input.sellable,
    };
    const { data, error } = await sb.from("products").insert(row).select("*").single();
    if (error) throw new SupabaseRepositoryError("product.create", error);
    return productRowToTs(data);
  },

  async update(ctx, id, patch) {
    const sb = await getClient("product.update");
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.sku !== undefined) row.sku = patch.sku;
    if (patch.barcode !== undefined) row.barcode = patch.barcode ?? null;
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.description !== undefined) row.description = patch.description ?? null;
    if (patch.brandId !== undefined) row.brand_id = patch.brandId ?? null;
    if (patch.laboratoryId !== undefined) row.laboratory_id = patch.laboratoryId ?? null;
    if (patch.categoryId !== undefined) row.category_id = patch.categoryId ?? null;
    if (patch.unit !== undefined) row.unit = patch.unit;
    if (patch.pharmaceuticalForm !== undefined) row.pharmaceutical_form = patch.pharmaceuticalForm ?? null;
    if (patch.presentation !== undefined) row.presentation = patch.presentation ?? null;
    if (patch.activeIngredient !== undefined) row.active_ingredient = patch.activeIngredient ?? null;
    if (patch.concentration !== undefined) row.concentration = patch.concentration ?? null;
    if (patch.sanitaryRegistry !== undefined) row.sanitary_registry = patch.sanitaryRegistry ?? null;
    if (patch.storageTemperature !== undefined) row.storage_temperature = patch.storageTemperature ?? null;
    if (patch.requiresPrescription !== undefined) row.requires_prescription = patch.requiresPrescription;
    if (patch.controlled !== undefined) row.controlled = patch.controlled;
    if (patch.cost !== undefined) row.cost = patch.cost;
    if (patch.price !== undefined) row.price = patch.price;
    if (patch.itbisRate !== undefined) row.itbis_rate = patch.itbisRate;
    if (patch.minStock !== undefined) row.min_stock = patch.minStock;
    if (patch.maxStock !== undefined) row.max_stock = patch.maxStock;
    if (patch.imageUrl !== undefined) row.image_url = patch.imageUrl ?? null;
    if (patch.active !== undefined) row.active = patch.active;
    if (patch.sellable !== undefined) row.sellable = patch.sellable;
    const { data, error } = await sb
      .from("products")
      .update(row)
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new SupabaseRepositoryError("product.update", error);
    return productRowToTs(data);
  },

  async softDelete(ctx, id) {
    const sb = await getClient("product.softDelete");
    const { error } = await sb
      .from("products")
      .update({ deleted_at: new Date().toISOString() })
      .eq("business_id", ctx.businessId)
      .eq("id", id);
    if (error) throw new SupabaseRepositoryError("product.softDelete", error);
  },
```

Verificar que `productRowToTs` ya esté importado en `supabase/product.ts` (lo está, lo usa `list`).

- [ ] **Step 6: Correr el test → pasa**

Run: `pnpm --filter web exec vitest run src/server/repositories/catalog-repo.test.ts`
Expected: PASS (3 tests de Product).

- [ ] **Step 7: typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/server/repositories/types.ts apps/web/src/server/repositories/mock/index.ts apps/web/src/server/repositories/supabase/product.ts apps/web/src/server/repositories/catalog-repo.test.ts
git commit -m "feat(productos): escritura en ProductRepository (mock+supabase)"
```

---

### Task 2: Métodos de escritura en repos de catálogos (Brand/Category/Laboratory)

**Files:**
- Modify: `apps/web/src/server/repositories/types.ts:105-116`
- Modify: `apps/web/src/server/repositories/mock/index.ts:178-202`
- Modify: `apps/web/src/server/repositories/supabase/catalog.ts`
- Test: `apps/web/src/server/repositories/catalog-repo.test.ts` (ampliar)

**Interfaces:**
- Consumes: overlays `extraBrands/...` y `__resetCatalogMockWrites` (Task 1).
- Produces:
  - `BrandRepository.create(ctx, input: { name: string }): Promise<Brand>`, `update(ctx, id, patch: Partial<Brand>): Promise<Brand>`, `delete(ctx, id): Promise<void>`
  - `CategoryRepository.create(ctx, input: { name: string; parentId?: ID | null; description?: string }): Promise<Category>`, `update(...)`, `delete(...)`
  - `LaboratoryRepository.create(ctx, input: { name: string; country?: string }): Promise<Laboratory>`, `update(...)`, `delete(...)`

- [ ] **Step 1: Ampliar el test** (añadir al final de `catalog-repo.test.ts`):

```ts
describe("Catálogos (mock) — escritura", () => {
  it("brand create/update/delete", async () => {
    const b = await mockRepositories.brand.create(ctx, { name: "MARCA X" });
    expect(b.id).toBeTruthy();
    const u = await mockRepositories.brand.update(ctx, b.id, { name: "MARCA Y" });
    expect(u.name).toBe("MARCA Y");
    await mockRepositories.brand.delete(ctx, b.id);
    const all = await mockRepositories.brand.list(ctx);
    expect(all.some((x) => x.id === b.id)).toBe(false);
  });

  it("category create con parentId y description", async () => {
    const c = await mockRepositories.category.create(ctx, {
      name: "CAT X",
      description: "desc",
    });
    expect(c.name).toBe("CAT X");
    expect(c.description).toBe("desc");
  });

  it("laboratory create con country", async () => {
    const l = await mockRepositories.laboratory.create(ctx, {
      name: "LAB X",
      country: "España",
    });
    expect(l.country).toBe("España");
  });
});
```

- [ ] **Step 2: Correr → falla**

Run: `pnpm --filter web exec vitest run src/server/repositories/catalog-repo.test.ts -t "Catálogos (mock)"`
Expected: FAIL — `brand.create is not a function`.

- [ ] **Step 3: Extender interfaces** en `types.ts` (reemplazar el bloque Catalog):

```ts
export interface BrandRepository {
  list(ctx: RepoContext): Promise<Brand[]>;
  byId(ctx: RepoContext, id: ID): Promise<Brand | null>;
  create(ctx: RepoContext, input: { name: string }): Promise<Brand>;
  update(ctx: RepoContext, id: ID, patch: { name?: string }): Promise<Brand>;
  delete(ctx: RepoContext, id: ID): Promise<void>;
}

export interface CategoryRepository {
  list(ctx: RepoContext): Promise<Category[]>;
  create(
    ctx: RepoContext,
    input: { name: string; parentId?: ID | null; description?: string },
  ): Promise<Category>;
  update(
    ctx: RepoContext,
    id: ID,
    patch: { name?: string; parentId?: ID | null; description?: string },
  ): Promise<Category>;
  delete(ctx: RepoContext, id: ID): Promise<void>;
}

export interface LaboratoryRepository {
  list(ctx: RepoContext): Promise<Laboratory[]>;
  create(ctx: RepoContext, input: { name: string; country?: string }): Promise<Laboratory>;
  update(ctx: RepoContext, id: ID, patch: { name?: string; country?: string }): Promise<Laboratory>;
  delete(ctx: RepoContext, id: ID): Promise<void>;
}
```

- [ ] **Step 4: Implementar mock** (`mock/index.ts`, reemplazar los 3 objetos `brand`/`category`/`laboratory`):

```ts
const brand: BrandRepository = {
  async list(ctx) {
    guard(ctx);
    const base = mockBrands
      .filter((b) => b.businessId === ctx.businessId)
      .map((b) => (brandPatches[b.id] ? { ...b, ...brandPatches[b.id] } : b));
    return [...base, ...extraBrands.filter((b) => b.businessId === ctx.businessId)]
      .filter((b) => !deletedBrandIds.has(b.id));
  },
  async byId(ctx, id) {
    guard(ctx);
    return (await this.list(ctx)).find((b) => b.id === id) ?? null;
  },
  async create(ctx, input) {
    guard(ctx);
    const now = new Date().toISOString();
    const created: Brand = {
      id: mockGenId("br"),
      businessId: ctx.businessId,
      name: input.name,
      productCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    extraBrands.push(created);
    return created;
  },
  async update(ctx, id, patch) {
    guard(ctx);
    brandPatches[id] = { ...(brandPatches[id] ?? {}), ...patch };
    const found = (await this.list(ctx)).find((b) => b.id === id);
    if (!found) throw new Error("Marca no encontrada");
    return found;
  },
  async delete(ctx, id) {
    guard(ctx);
    deletedBrandIds.add(id);
  },
};

const category: CategoryRepository = {
  async list(ctx) {
    guard(ctx);
    const base = mockCategories
      .filter((c) => c.businessId === ctx.businessId)
      .map((c) => (categoryPatches[c.id] ? { ...c, ...categoryPatches[c.id] } : c));
    return [...base, ...extraCategories.filter((c) => c.businessId === ctx.businessId)]
      .filter((c) => !deletedCategoryIds.has(c.id));
  },
  async create(ctx, input) {
    guard(ctx);
    const now = new Date().toISOString();
    const created: Category = {
      id: mockGenId("cat"),
      businessId: ctx.businessId,
      name: input.name,
      parentId: input.parentId ?? null,
      description: input.description,
      createdAt: now,
      updatedAt: now,
    };
    extraCategories.push(created);
    return created;
  },
  async update(ctx, id, patch) {
    guard(ctx);
    categoryPatches[id] = { ...(categoryPatches[id] ?? {}), ...patch };
    const found = (await this.list(ctx)).find((c) => c.id === id);
    if (!found) throw new Error("Categoría no encontrada");
    return found;
  },
  async delete(ctx, id) {
    guard(ctx);
    deletedCategoryIds.add(id);
  },
};

const laboratory: LaboratoryRepository = {
  async list(ctx) {
    guard(ctx);
    const base = mockLaboratories
      .filter((l) => l.businessId === ctx.businessId)
      .map((l) => (laboratoryPatches[l.id] ? { ...l, ...laboratoryPatches[l.id] } : l));
    return [...base, ...extraLaboratories.filter((l) => l.businessId === ctx.businessId)]
      .filter((l) => !deletedLaboratoryIds.has(l.id));
  },
  async create(ctx, input) {
    guard(ctx);
    const now = new Date().toISOString();
    const created: Laboratory = {
      id: mockGenId("lab"),
      businessId: ctx.businessId,
      name: input.name,
      country: input.country,
      createdAt: now,
      updatedAt: now,
    };
    extraLaboratories.push(created);
    return created;
  },
  async update(ctx, id, patch) {
    guard(ctx);
    laboratoryPatches[id] = { ...(laboratoryPatches[id] ?? {}), ...patch };
    const found = (await this.list(ctx)).find((l) => l.id === id);
    if (!found) throw new Error("Laboratorio no encontrado");
    return found;
  },
  async delete(ctx, id) {
    guard(ctx);
    deletedLaboratoryIds.add(id);
  },
};
```

- [ ] **Step 5: Implementar supabase** (`supabase/catalog.ts`, agregar a cada repo)

A `brandRepository`:

```ts
  async create(ctx, input) {
    const sb = await getClient("brand.create");
    const { data, error } = await sb
      .from("brands")
      .insert({ business_id: ctx.businessId, name: input.name })
      .select("*")
      .single();
    if (error) throw new SupabaseRepositoryError("brand.create", error);
    return brandRowToTs(data);
  },
  async update(ctx, id, patch) {
    const sb = await getClient("brand.update");
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    const { data, error } = await sb
      .from("brands").update(row)
      .eq("business_id", ctx.businessId).eq("id", id)
      .select("*").single();
    if (error) throw new SupabaseRepositoryError("brand.update", error);
    return brandRowToTs(data);
  },
  async delete(ctx, id) {
    const sb = await getClient("brand.delete");
    const { error } = await sb
      .from("brands").delete()
      .eq("business_id", ctx.businessId).eq("id", id);
    if (error) throw new SupabaseRepositoryError("brand.delete", error);
  },
```

A `categoryRepository`:

```ts
  async create(ctx, input) {
    const sb = await getClient("category.create");
    const { data, error } = await sb
      .from("product_categories")
      .insert({
        business_id: ctx.businessId,
        name: input.name,
        parent_id: input.parentId ?? null,
        description: input.description ?? null,
      })
      .select("*").single();
    if (error) throw new SupabaseRepositoryError("category.create", error);
    return categoryRowToTs(data);
  },
  async update(ctx, id, patch) {
    const sb = await getClient("category.update");
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.parentId !== undefined) row.parent_id = patch.parentId ?? null;
    if (patch.description !== undefined) row.description = patch.description ?? null;
    const { data, error } = await sb
      .from("product_categories").update(row)
      .eq("business_id", ctx.businessId).eq("id", id)
      .select("*").single();
    if (error) throw new SupabaseRepositoryError("category.update", error);
    return categoryRowToTs(data);
  },
  async delete(ctx, id) {
    const sb = await getClient("category.delete");
    const { error } = await sb
      .from("product_categories").delete()
      .eq("business_id", ctx.businessId).eq("id", id);
    if (error) throw new SupabaseRepositoryError("category.delete", error);
  },
```

A `laboratoryRepository`:

```ts
  async create(ctx, input) {
    const sb = await getClient("laboratory.create");
    const { data, error } = await sb
      .from("laboratories")
      .insert({ business_id: ctx.businessId, name: input.name, country: input.country ?? null })
      .select("*").single();
    if (error) throw new SupabaseRepositoryError("laboratory.create", error);
    return laboratoryRowToTs(data);
  },
  async update(ctx, id, patch) {
    const sb = await getClient("laboratory.update");
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.country !== undefined) row.country = patch.country ?? null;
    const { data, error } = await sb
      .from("laboratories").update(row)
      .eq("business_id", ctx.businessId).eq("id", id)
      .select("*").single();
    if (error) throw new SupabaseRepositoryError("laboratory.update", error);
    return laboratoryRowToTs(data);
  },
  async delete(ctx, id) {
    const sb = await getClient("laboratory.delete");
    const { error } = await sb
      .from("laboratories").delete()
      .eq("business_id", ctx.businessId).eq("id", id);
    if (error) throw new SupabaseRepositoryError("laboratory.delete", error);
  },
```

- [ ] **Step 6: Correr toda la suite de repos → pasa**

Run: `pnpm --filter web exec vitest run src/server/repositories/catalog-repo.test.ts`
Expected: PASS (Product + Catálogos).

- [ ] **Step 7: typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/server/repositories/types.ts apps/web/src/server/repositories/mock/index.ts apps/web/src/server/repositories/supabase/catalog.ts apps/web/src/server/repositories/catalog-repo.test.ts
git commit -m "feat(catalogos): escritura en Brand/Category/Laboratory (mock+supabase)"
```

---

### Task 3: API routes de Productos

**Files:**
- Create: `apps/web/src/app/api/products/route.ts`
- Create: `apps/web/src/app/api/products/[id]/route.ts`

**Interfaces:**
- Consumes: `getRepositories().product.{list,create,update,softDelete}`, `getRepoContext()`, `env.DATA_SOURCE`.
- Produces: `GET /api/products` → `{ products }`; `POST /api/products` → `{ product }`; `PATCH /api/products/[id]` → `{ product }`; `DELETE /api/products/[id]` → `{ ok: true }`. 409 si `DATA_SOURCE !== "supabase"`.

- [ ] **Step 1: Crear `route.ts`** (modelado 1-a-1 en `app/api/branches/route.ts`):

```ts
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Backend en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida." },
    { status: 409 },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const sp = req.nextUrl.searchParams;
    const ctx = await getRepoContext();
    const products = await getRepositories().product.list(ctx, {
      search: sp.get("search") ?? undefined,
      brandId: sp.get("brandId") ?? undefined,
      categoryId: sp.get("categoryId") ?? undefined,
      activeOnly: sp.get("activeOnly") === "true",
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return NextResponse.json({ products }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const body = await req.json();
    const ctx = await getRepoContext();
    const product = await getRepositories().product.create(ctx, body);
    return NextResponse.json({ product }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 2: Crear `[id]/route.ts`** (modelado en `app/api/branches/[id]/route.ts`):

```ts
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Backend en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida." },
    { status: 409 },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const body = await req.json();
    const ctx = await getRepoContext();
    const product = await getRepositories().product.update(ctx, id, body);
    return NextResponse.json({ product });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const ctx = await getRepoContext();
    await getRepositories().product.softDelete(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 3: typecheck + build** (las rutas se validan por compilación)

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: build OK, aparece `/api/products` y `/api/products/[id]` en el listado de rutas.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/api/products/route.ts" "apps/web/src/app/api/products/[id]/route.ts"
git commit -m "feat(api): rutas de productos (GET/POST/PATCH/DELETE) gated"
```

---

### Task 4: API routes de Catálogos (categories/brands/laboratories)

**Files:**
- Create: `apps/web/src/app/api/categories/route.ts` + `[id]/route.ts`
- Create: `apps/web/src/app/api/brands/route.ts` + `[id]/route.ts`
- Create: `apps/web/src/app/api/laboratories/route.ts` + `[id]/route.ts`

**Interfaces:**
- Consumes: `getRepositories().{category,brand,laboratory}.{list,create,update,delete}`.
- Produces: por entidad: `GET` → `{ <plural>: [] }`; `POST` → `{ <singular> }`; `PATCH [id]` → `{ <singular> }`; `DELETE [id]` → `{ ok: true }`. Llave de respuesta: `categories`/`category`, `brands`/`brand`, `laboratories`/`laboratory`.

- [ ] **Step 1: `categories/route.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Backend en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida." },
    { status: 409 },
  );
}

export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const ctx = await getRepoContext();
    const categories = await getRepositories().category.list(ctx);
    return NextResponse.json({ categories }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const body = await req.json();
    const ctx = await getRepoContext();
    const category = await getRepositories().category.create(ctx, body);
    return NextResponse.json({ category }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 2: `categories/[id]/route.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Backend en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida." },
    { status: 409 },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const body = await req.json();
    const ctx = await getRepoContext();
    const category = await getRepositories().category.update(ctx, id, body);
    return NextResponse.json({ category });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const ctx = await getRepoContext();
    await getRepositories().category.delete(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 3: `brands/route.ts` + `brands/[id]/route.ts`**

Idéntico a categories pero con `getRepositories().brand`, llaves `brands`/`brand`. Código `brands/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Backend en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida." },
    { status: 409 },
  );
}

export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const ctx = await getRepoContext();
    const brands = await getRepositories().brand.list(ctx);
    return NextResponse.json({ brands }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const body = await req.json();
    const ctx = await getRepoContext();
    const brand = await getRepositories().brand.create(ctx, body);
    return NextResponse.json({ brand }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

`brands/[id]/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Backend en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida." },
    { status: 409 },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const body = await req.json();
    const ctx = await getRepoContext();
    const brand = await getRepositories().brand.update(ctx, id, body);
    return NextResponse.json({ brand });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const ctx = await getRepoContext();
    await getRepositories().brand.delete(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 4: `laboratories/route.ts` + `laboratories/[id]/route.ts`**

Igual, con `getRepositories().laboratory`, llaves `laboratories`/`laboratory`. `laboratories/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Backend en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida." },
    { status: 409 },
  );
}

export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const ctx = await getRepoContext();
    const laboratories = await getRepositories().laboratory.list(ctx);
    return NextResponse.json({ laboratories }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const body = await req.json();
    const ctx = await getRepoContext();
    const laboratory = await getRepositories().laboratory.create(ctx, body);
    return NextResponse.json({ laboratory }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

`laboratories/[id]/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Backend en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida." },
    { status: 409 },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const body = await req.json();
    const ctx = await getRepoContext();
    const laboratory = await getRepositories().laboratory.update(ctx, id, body);
    return NextResponse.json({ laboratory });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const ctx = await getRepoContext();
    await getRepositories().laboratory.delete(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 5: typecheck + build**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: build OK con las 6 rutas nuevas.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/api/categories" "apps/web/src/app/api/brands" "apps/web/src/app/api/laboratories"
git commit -m "feat(api): rutas de categorias/marcas/laboratorios gated"
```

---

## Stage B — Seed

### Task 5: Script de seed idempotente `scripts/seed-catalog-supabase.mjs`

**Files:**
- Create: `scripts/seed-catalog-supabase.mjs`

**Interfaces:**
- Consumes: `apps/web/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), business UUID `00000000-0000-0000-0000-00000000d001`.
- Produces: upsert de brands/laboratories/product_categories/products en cloud. Soporta `--dry-run` (no escribe). Idempotente (re-ejecutable).

**Nota de datos:** los catálogos del mock (`mockBrands`, `mockLaboratories`, `mockCategories`, `mockProducts` en `apps/web/src/lib/mock-data/catalog.ts`) son TS y referencian `mockBusiness.id`. Para no compilar TS en el script, el seed **lee los nombres/relaciones desde el mock por import dinámico** vía `tsx`-less no es viable en `.mjs`; en su lugar el script importa un JSON exportado del catálogo. Por eso este task incluye generar ese JSON primero.

- [ ] **Step 1: Generar el snapshot JSON del catálogo mock**

Create `apps/web/src/lib/mock-data/catalog-export.ts`:

```ts
import { writeFileSync } from "node:fs";
import { mockBrands, mockLaboratories, mockCategories, mockProducts } from "./catalog";

// Ejecutar con: pnpm --filter web exec tsx src/lib/mock-data/catalog-export.ts
const snapshot = {
  brands: mockBrands.map((b) => ({ mockId: b.id, name: b.name })),
  laboratories: mockLaboratories.map((l) => ({ mockId: l.id, name: l.name, country: l.country ?? null })),
  categories: mockCategories.map((c) => ({ mockId: c.id, name: c.name, description: c.description ?? null, parentMockId: c.parentId ?? null })),
  products: mockProducts.map((p) => ({
    sku: p.sku, barcode: p.barcode ?? null, name: p.name, description: p.description ?? null,
    brandMockId: p.brandId ?? null, laboratoryMockId: p.laboratoryId ?? null, categoryMockId: p.categoryId ?? null,
    unit: p.unit, pharmaceuticalForm: p.pharmaceuticalForm ?? null, presentation: p.presentation ?? null,
    activeIngredient: p.activeIngredient ?? null, concentration: p.concentration ?? null,
    sanitaryRegistry: p.sanitaryRegistry ?? null, storageTemperature: p.storageTemperature ?? null,
    requiresPrescription: p.requiresPrescription, controlled: p.controlled,
    cost: p.cost, price: p.price, itbisRate: p.itbisRate, minStock: p.minStock, maxStock: p.maxStock,
    imageUrl: p.imageUrl ?? null, active: p.active, sellable: p.sellable,
  })),
};
writeFileSync(new URL("./catalog-snapshot.json", import.meta.url), JSON.stringify(snapshot, null, 2));
console.log(`[catalog-export] brands=${snapshot.brands.length} labs=${snapshot.laboratories.length} cats=${snapshot.categories.length} products=${snapshot.products.length}`);
```

Run: `pnpm --filter web exec tsx src/lib/mock-data/catalog-export.ts`
Expected: crea `apps/web/src/lib/mock-data/catalog-snapshot.json` y loggea conteos. (Si `tsx` no está, usar `pnpm --filter web exec vitest` no aplica; instalar con `pnpm --filter web add -D tsx` y reintentar.)

- [ ] **Step 2: Escribir el seed** `scripts/seed-catalog-supabase.mjs`:

```js
#!/usr/bin/env node
/**
 * Seed idempotente del catálogo (brands/labs/categories/products) a Supabase.
 * Idempotente: re-ejecutable. Usa service_role (NO lo imprime).
 *
 * Uso:
 *   node scripts/seed-catalog-supabase.mjs --dry-run   # no escribe
 *   node scripts/seed-catalog-supabase.mjs             # escribe (upsert)
 *
 * Lee apps/web/.env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Fuente: apps/web/src/lib/mock-data/catalog-snapshot.json (generar con
 *   pnpm --filter web exec tsx src/lib/mock-data/catalog-export.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(REPO_ROOT, "apps", "web", ".env.local");
const SNAPSHOT = path.join(REPO_ROOT, "apps", "web", "src", "lib", "mock-data", "catalog-snapshot.json");
const BUSINESS_ID = "00000000-0000-0000-0000-00000000d001";
const DRY = process.argv.includes("--dry-run");

function die(m) { console.error(`[seed-catalog] ${m}`); process.exit(1); }
function ok(m) { console.log(`[seed-catalog] ${m}`); }

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) die(`no encontré ${ENV_PATH}`);
  const env = {};
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

async function main() {
  if (!fs.existsSync(SNAPSHOT)) die(`falta ${SNAPSHOT} — corré el export primero`);
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || /replace/i.test(key)) die("faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY reales");
  const data = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  ok(`snapshot: brands=${data.brands.length} labs=${data.laboratories.length} cats=${data.categories.length} products=${data.products.length}`);
  if (DRY) { ok("DRY-RUN: no se escribe nada. Salida OK."); return; }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const brandMap = {}, labMap = {}, catMap = {};

  for (const b of data.brands) {
    const { data: row, error } = await sb.from("brands")
      .upsert({ business_id: BUSINESS_ID, name: b.name }, { onConflict: "business_id,name" })
      .select("id").single();
    if (error) die(`brand ${b.name}: ${error.message}`);
    brandMap[b.mockId] = row.id;
  }
  ok(`brands upserted: ${Object.keys(brandMap).length}`);

  for (const l of data.laboratories) {
    const { data: existing } = await sb.from("laboratories")
      .select("id").eq("business_id", BUSINESS_ID).eq("name", l.name).maybeSingle();
    let id = existing?.id;
    if (!id) {
      const { data: row, error } = await sb.from("laboratories")
        .insert({ business_id: BUSINESS_ID, name: l.name, country: l.country }).select("id").single();
      if (error) die(`lab ${l.name}: ${error.message}`);
      id = row.id;
    }
    labMap[l.mockId] = id;
  }
  ok(`laboratories upserted: ${Object.keys(labMap).length}`);

  // categorías sin parent primero, luego con parent
  const sorted = [...data.categories].sort((a, b) => (a.parentMockId ? 1 : 0) - (b.parentMockId ? 1 : 0));
  for (const c of sorted) {
    const { data: existing } = await sb.from("product_categories")
      .select("id").eq("business_id", BUSINESS_ID).eq("name", c.name).maybeSingle();
    let id = existing?.id;
    const parent_id = c.parentMockId ? catMap[c.parentMockId] ?? null : null;
    if (!id) {
      const { data: row, error } = await sb.from("product_categories")
        .insert({ business_id: BUSINESS_ID, name: c.name, description: c.description, parent_id }).select("id").single();
      if (error) die(`cat ${c.name}: ${error.message}`);
      id = row.id;
    }
    catMap[c.mockId] = id;
  }
  ok(`categories upserted: ${Object.keys(catMap).length}`);

  let count = 0;
  for (const p of data.products) {
    const row = {
      business_id: BUSINESS_ID, sku: p.sku, barcode: p.barcode, name: p.name, description: p.description,
      brand_id: p.brandMockId ? brandMap[p.brandMockId] ?? null : null,
      laboratory_id: p.laboratoryMockId ? labMap[p.laboratoryMockId] ?? null : null,
      category_id: p.categoryMockId ? catMap[p.categoryMockId] ?? null : null,
      unit: p.unit, pharmaceutical_form: p.pharmaceuticalForm, presentation: p.presentation,
      active_ingredient: p.activeIngredient, concentration: p.concentration,
      sanitary_registry: p.sanitaryRegistry, storage_temperature: p.storageTemperature,
      requires_prescription: p.requiresPrescription, controlled: p.controlled,
      cost: p.cost, price: p.price, itbis_rate: p.itbisRate, min_stock: p.minStock, max_stock: p.maxStock,
      image_url: p.imageUrl, active: p.active, sellable: p.sellable,
    };
    const { error } = await sb.from("products").upsert(row, { onConflict: "business_id,sku" });
    if (error) die(`product ${p.sku}: ${error.message}`);
    count++;
  }
  ok(`products upserted: ${count}`);
  ok("seed OK");
}

main().catch((e) => die(e.message));
```

- [ ] **Step 3: Verificar dry-run**

Run: `node scripts/seed-catalog-supabase.mjs --dry-run`
Expected: loggea conteos del snapshot y `DRY-RUN: no se escribe nada. Salida OK.` sin tocar la red. (Si falta `@supabase/supabase-js` en la raíz, el import lo resuelve desde `apps/web/node_modules` por hoisting de pnpm; si no, correr desde `apps/web` o instalar en raíz.)

- [ ] **Step 4: Commit** (el run real contra cloud es paso manual posterior, documentado abajo)

```bash
git add scripts/seed-catalog-supabase.mjs apps/web/src/lib/mock-data/catalog-export.ts apps/web/src/lib/mock-data/catalog-snapshot.json
git commit -m "feat(seed): script idempotente de catálogo a Supabase + snapshot"
```

> **Paso manual (fuera del plan automatizado):** con `SUPABASE_SERVICE_ROLE_KEY` real → `node scripts/seed-catalog-supabase.mjs`; correr 2× y confirmar conteos estables.

---

## Stage C — Productos: cliente

### Task 6: Wiring de `product-store.ts` a Supabase (lectura + wrappers)

**Files:**
- Modify: `apps/web/src/features/products/product-store.ts`
- Test: `apps/web/src/features/products/product-store.test.ts`

**Interfaces:**
- Consumes: `CreateProductInput`, `createProduct`, `updateProduct`, `deleteProduct`, `listAllProducts` (ya existen).
- Produces (export): `PRODUCT_BACKEND`, `fetchProductsFromServer()`, `saveProduct(mode, input, id?)`, `deleteProductAnywhere(id)`. `useProducts` server-aware.

- [ ] **Step 1: Test de dispatch en modo local** (añadir a `product-store.test.ts`)

```ts
import { saveProduct, deleteProductAnywhere, PRODUCT_BACKEND, listAllProducts, clearLocalProducts } from "./product-store";

describe("product-store wrappers (modo local)", () => {
  beforeEach(() => { window.localStorage.clear(); clearLocalProducts(); });

  it("PRODUCT_BACKEND es 'local' sin NEXT_PUBLIC_DATA_SOURCE=supabase", () => {
    expect(PRODUCT_BACKEND).toBe("local");
  });

  it("saveProduct('create') agrega al store local", async () => {
    const res = await saveProduct("create", { sku: "WRAP-1", name: "Wrap", price: 99 });
    expect(res.ok).toBe(true);
    expect(listAllProducts().some((p) => p.sku === "WRAP-1")).toBe(true);
  });

  it("deleteProductAnywhere borra del store local", async () => {
    const created = await saveProduct("create", { sku: "WRAP-2", name: "Wrap2", price: 10 });
    if (!created.ok) throw new Error("setup");
    const del = await deleteProductAnywhere(created.product.id);
    expect(del.ok).toBe(true);
    expect(listAllProducts().some((p) => p.id === created.product.id)).toBe(false);
  });
});
```

- [ ] **Step 2: Correr → falla**

Run: `pnpm --filter web exec vitest run src/features/products/product-store.test.ts -t "product-store wrappers"`
Expected: FAIL — `saveProduct` no exportado.

- [ ] **Step 3: Implementar en `product-store.ts`** (agregar al final, antes de los hooks; y modificar `useProducts`):

```ts
// ─── Backend (local vs Supabase) ─────────────────────────────────────────────
export const PRODUCT_BACKEND: "local" | "supabase" =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase"
    ? "supabase"
    : "local";

function notifyProductsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

export async function fetchProductsFromServer(): Promise<Product[]> {
  const res = await fetch(`/api/products?limit=1000`, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as { products: Product[] }).products;
}

function createInputToServerPayload(input: CreateProductInput) {
  return {
    businessId: input.businessId ?? "",
    sku: input.sku.trim(),
    barcode: input.barcode?.trim() || undefined,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    brandId: input.brandId,
    laboratoryId: input.laboratoryId,
    categoryId: input.categoryId,
    unit: input.unit?.trim() || "unidad",
    pharmaceuticalForm: input.pharmaceuticalForm,
    presentation: input.presentation?.trim() || undefined,
    activeIngredient: input.activeIngredient?.trim() || undefined,
    concentration: input.concentration?.trim() || undefined,
    requiresPrescription: !!input.requiresPrescription,
    controlled: !!input.controlled,
    cost: input.cost ?? 0,
    price: input.price,
    itbisRate: input.itbisRate ?? 18,
    minStock: input.minStock ?? 0,
    maxStock: input.maxStock ?? 0,
    imageUrl: input.imageUrl ?? null,
    active: input.active ?? true,
    sellable: input.sellable ?? true,
  };
}

async function createProductOnServer(input: CreateProductInput): Promise<CreateProductResult> {
  const missing: string[] = [];
  if (!input.sku?.trim()) missing.push("sku");
  if (!input.name?.trim()) missing.push("name");
  if (input.price == null || Number.isNaN(input.price)) missing.push("price");
  if (missing.length) return { ok: false, error: "Complete los campos requeridos.", missingFields: missing };
  try {
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createInputToServerPayload(input)),
    });
    const body = (await res.json().catch(() => ({}))) as { product?: Product; error?: string };
    if (!res.ok || !body.product) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    notifyProductsChanged();
    return { ok: true, product: body.product };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function updateProductOnServer(id: string, patch: Partial<Product>): Promise<CreateProductResult> {
  try {
    const res = await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = (await res.json().catch(() => ({}))) as { product?: Product; error?: string };
    if (!res.ok || !body.product) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    notifyProductsChanged();
    return { ok: true, product: body.product };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function saveProduct(
  mode: "create" | "edit",
  input: CreateProductInput,
  id?: string,
): Promise<CreateProductResult> {
  if (PRODUCT_BACKEND === "supabase") {
    return mode === "create" ? createProductOnServer(input) : updateProductOnServer(id!, input as Partial<Product>);
  }
  if (mode === "create") return createProduct(input);
  const r = updateProduct(id!, input as Partial<Product>);
  const found = getProductByIdFromStore(id!);
  return r.ok && found ? { ok: true, product: found } : { ok: false, error: "No se pudo actualizar el producto." };
}

export async function deleteProductAnywhere(id: string): Promise<{ ok: boolean; error?: string }> {
  if (PRODUCT_BACKEND === "supabase") {
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: body.error ?? `HTTP ${res.status}` };
      }
      notifyProductsChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  return deleteProduct(id);
}
```

Reemplazar `useProducts` para que en supabase haga fetch con fallback:

```ts
export function useProducts(): Product[] {
  const [list, setList] = React.useState<Product[]>(() =>
    PRODUCT_BACKEND === "supabase" ? [] : listAllProducts(),
  );
  React.useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (PRODUCT_BACKEND === "supabase") {
        fetchProductsFromServer()
          .then((p) => { if (alive) setList(p); })
          .catch(() => { if (alive) setList(listAllProducts()); });
      } else {
        setList(listAllProducts());
      }
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      alive = false;
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return list;
}
```

- [ ] **Step 4: Correr → pasa**

Run: `pnpm --filter web exec vitest run src/features/products/product-store.test.ts`
Expected: PASS (incluyendo los nuevos casos y los previos).

- [ ] **Step 5: typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/products/product-store.ts apps/web/src/features/products/product-store.test.ts
git commit -m "feat(productos): hooks/wrappers de cliente con fallback (gated)"
```

---

### Task 7: Formularios de producto usan `saveProduct`

**Files:**
- Modify: `apps/web/src/features/products/product-form.tsx:25-27,171,229`
- Modify: `apps/web/src/features/products/new-product-form.tsx` (si llama `createProduct`/`updateProduct` directo)

**Interfaces:**
- Consumes: `saveProduct` (Task 6).

- [ ] **Step 1: Revisar el callsite real**

Run: `pnpm --filter web exec grep -rn "createProduct\|updateProduct" src/features/products/product-form.tsx src/features/products/new-product-form.tsx`
Expected: ubica las llamadas a migrar (en `product-form.tsx` líneas ~171 y ~229).

- [ ] **Step 2: Editar `product-form.tsx`** — cambiar import y submit:

En el import desde `./product-store`, quitar `createProduct`/`updateProduct` y agregar `saveProduct`. Hacer el handler de submit `async`. Reemplazar la rama de create (línea ~171) y update (línea ~229) por una sola llamada. Patrón:

```ts
// handler async
const submit = async (e: React.FormEvent) => {
  e.preventDefault();
  // ...validaciones/armado de `common` existentes...
  const res = mode === "create"
    ? await saveProduct("create", { ...common, active: true, sellable: true })
    : await saveProduct("edit", { ...common }, product!.id);
  if (!res.ok) {
    setError(res.error);
    return;
  }
  toast.success(mode === "create" ? "Producto creado." : "Cambios guardados.");
  router.push(`/productos/${res.product.id}`);
};
```

> Conservar la lógica existente de armado de `common` y de imagen; solo se cambia el punto donde se llamaba a `createProduct`/`updateProduct`. `saveProduct("edit", input, id)` devuelve `{ ok, product }`, así que el `router.push` usa `res.product.id`.

- [ ] **Step 3: Editar `new-product-form.tsx`** si invoca mutaciones directas — aplicar el mismo cambio a `saveProduct`. Si solo renderiza `product-form.tsx`, no tocar.

- [ ] **Step 4: typecheck + build**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/products/product-form.tsx apps/web/src/features/products/new-product-form.tsx
git commit -m "feat(productos): formularios usan saveProduct (local/supabase)"
```

---

## Stage D — Catálogos: cliente + UI

### Task 8: `catalog-store.ts` (hooks + wrappers de los 3 catálogos)

**Files:**
- Create: `apps/web/src/features/products/catalog-store.ts`
- Test: `apps/web/src/features/products/catalog-store.test.ts`

**Interfaces:**
- Consumes: `mockBrands`, `mockCategories`, `mockLaboratories` de `@/lib/mock-data/catalog`.
- Produces: `CATALOG_BACKEND`; hooks `useBrandsList`, `useCategoriesList`, `useLaboratoriesList`; wrappers `saveBrand`/`deleteBrandAnywhere`, `saveCategory`/`deleteCategoryAnywhere`, `saveLaboratory`/`deleteLaboratoryAnywhere`. Tipos de input: `{ name: string }`, `{ name; parentId?; description? }`, `{ name; country? }`.

- [ ] **Step 1: Test de dispatch en modo local**

Create `apps/web/src/features/products/catalog-store.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  CATALOG_BACKEND,
  saveBrand, saveCategory, saveLaboratory,
} from "./catalog-store";

describe("catalog-store (modo local)", () => {
  it("CATALOG_BACKEND es 'local' por defecto", () => {
    expect(CATALOG_BACKEND).toBe("local");
  });
  it("saveBrand local devuelve ok con la marca", async () => {
    const res = await saveBrand("create", { name: "MARCA NUEVA" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.item.name).toBe("MARCA NUEVA");
  });
  it("saveCategory local valida nombre requerido", async () => {
    const res = await saveCategory("create", { name: "" });
    expect(res.ok).toBe(false);
  });
  it("saveLaboratory local acepta country", async () => {
    const res = await saveLaboratory("create", { name: "LAB", country: "España" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.item.country).toBe("España");
  });
});
```

- [ ] **Step 2: Correr → falla**

Run: `pnpm --filter web exec vitest run src/features/products/catalog-store.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar `catalog-store.ts`**

```ts
"use client";

import * as React from "react";
import type { Brand, Category, Laboratory } from "@/types";
import { mockBrands, mockCategories, mockLaboratories } from "@/lib/mock-data/catalog";

const CHANGE_EVENT = "dermaland:catalog-changed";

export const CATALOG_BACKEND: "local" | "supabase" =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase"
    ? "supabase"
    : "local";

function notifyCatalogChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

// Overlays locales (modo demo) por entidad.
type Overlay<T> = { extra: T[]; deleted: Set<string>; patches: Record<string, Partial<T>> };
function newOverlay<T>(): Overlay<T> { return { extra: [], deleted: new Set(), patches: {} }; }
const brandOverlay = newOverlay<Brand>();
const categoryOverlay = newOverlay<Category>();
const labOverlay = newOverlay<Laboratory>();

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
function viewLocal<T extends { id: string }>(seed: T[], o: Overlay<T>): T[] {
  const base = seed.map((x) => (o.patches[x.id] ? { ...x, ...o.patches[x.id] } : x));
  return [...base, ...o.extra].filter((x) => !o.deleted.has(x.id));
}

export type CatalogResult<T> = { ok: true; item: T } | { ok: false; error: string };
export type CatalogDeleteResult = { ok: true } | { ok: false; error: string };

// ─── Fetch servidor ──────────────────────────────────────────────────────────
async function fetchList<T>(path: string, key: string): Promise<T[]> {
  const res = await fetch(`/api/${path}`, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as Record<string, T[]>)[key];
}

// ─── Hook genérico de lista con fallback ─────────────────────────────────────
function useCatalogList<T extends { id: string }>(
  seed: T[], overlay: Overlay<T>, path: string, key: string,
): T[] {
  const [list, setList] = React.useState<T[]>(() =>
    CATALOG_BACKEND === "supabase" ? [] : viewLocal(seed, overlay),
  );
  React.useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (CATALOG_BACKEND === "supabase") {
        fetchList<T>(path, key)
          .then((d) => { if (alive) setList(d); })
          .catch(() => { if (alive) setList(viewLocal(seed, overlay)); });
      } else {
        setList(viewLocal(seed, overlay));
      }
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      alive = false;
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [path, key, seed, overlay]);
  return list;
}

export function useBrandsList(): Brand[] {
  return useCatalogList(mockBrands, brandOverlay, "brands", "brands");
}
export function useCategoriesList(): Category[] {
  return useCatalogList(mockCategories, categoryOverlay, "categories", "categories");
}
export function useLaboratoriesList(): Laboratory[] {
  return useCatalogList(mockLaboratories, labOverlay, "laboratories", "laboratories");
}

// ─── Wrappers de escritura ───────────────────────────────────────────────────
async function serverWrite<T>(method: string, url: string, body: unknown, key: string): Promise<CatalogResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !json[key]) return { ok: false, error: (json.error as string) ?? `HTTP ${res.status}` };
    notifyCatalogChanged();
    return { ok: true, item: json[key] as T };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
async function serverDelete(url: string): Promise<CatalogDeleteResult> {
  try {
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    }
    notifyCatalogChanged();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Brands
export async function saveBrand(mode: "create" | "edit", input: { name: string }, id?: string): Promise<CatalogResult<Brand>> {
  if (!input.name?.trim()) return { ok: false, error: "El nombre es obligatorio." };
  if (CATALOG_BACKEND === "supabase") {
    return mode === "create"
      ? serverWrite<Brand>("POST", "/api/brands", { name: input.name.trim() }, "brand")
      : serverWrite<Brand>("PATCH", `/api/brands/${id}`, { name: input.name.trim() }, "brand");
  }
  const now = new Date().toISOString();
  if (mode === "create") {
    const item: Brand = { id: genId("br"), businessId: mockBrands[0]?.businessId ?? "biz_dermaland", name: input.name.trim(), productCount: 0, createdAt: now, updatedAt: now };
    brandOverlay.extra.push(item); notifyCatalogChanged(); return { ok: true, item };
  }
  brandOverlay.patches[id!] = { ...(brandOverlay.patches[id!] ?? {}), name: input.name.trim(), updatedAt: now };
  const item = viewLocal(mockBrands, brandOverlay).find((b) => b.id === id);
  notifyCatalogChanged();
  return item ? { ok: true, item } : { ok: false, error: "Marca no encontrada." };
}
export async function deleteBrandAnywhere(id: string): Promise<CatalogDeleteResult> {
  if (CATALOG_BACKEND === "supabase") return serverDelete(`/api/brands/${id}`);
  brandOverlay.deleted.add(id); notifyCatalogChanged(); return { ok: true };
}

// Categories
export async function saveCategory(mode: "create" | "edit", input: { name: string; parentId?: string | null; description?: string }, id?: string): Promise<CatalogResult<Category>> {
  if (!input.name?.trim()) return { ok: false, error: "El nombre es obligatorio." };
  const payload = { name: input.name.trim(), parentId: input.parentId ?? null, description: input.description?.trim() || undefined };
  if (CATALOG_BACKEND === "supabase") {
    return mode === "create"
      ? serverWrite<Category>("POST", "/api/categories", payload, "category")
      : serverWrite<Category>("PATCH", `/api/categories/${id}`, payload, "category");
  }
  const now = new Date().toISOString();
  if (mode === "create") {
    const item: Category = { id: genId("cat"), businessId: mockCategories[0]?.businessId ?? "biz_dermaland", name: payload.name, parentId: payload.parentId, description: payload.description, createdAt: now, updatedAt: now };
    categoryOverlay.extra.push(item); notifyCatalogChanged(); return { ok: true, item };
  }
  categoryOverlay.patches[id!] = { ...(categoryOverlay.patches[id!] ?? {}), ...payload, updatedAt: now };
  const item = viewLocal(mockCategories, categoryOverlay).find((c) => c.id === id);
  notifyCatalogChanged();
  return item ? { ok: true, item } : { ok: false, error: "Categoría no encontrada." };
}
export async function deleteCategoryAnywhere(id: string): Promise<CatalogDeleteResult> {
  if (CATALOG_BACKEND === "supabase") return serverDelete(`/api/categories/${id}`);
  categoryOverlay.deleted.add(id); notifyCatalogChanged(); return { ok: true };
}

// Laboratories
export async function saveLaboratory(mode: "create" | "edit", input: { name: string; country?: string }, id?: string): Promise<CatalogResult<Laboratory>> {
  if (!input.name?.trim()) return { ok: false, error: "El nombre es obligatorio." };
  const payload = { name: input.name.trim(), country: input.country?.trim() || undefined };
  if (CATALOG_BACKEND === "supabase") {
    return mode === "create"
      ? serverWrite<Laboratory>("POST", "/api/laboratories", payload, "laboratory")
      : serverWrite<Laboratory>("PATCH", `/api/laboratories/${id}`, payload, "laboratory");
  }
  const now = new Date().toISOString();
  if (mode === "create") {
    const item: Laboratory = { id: genId("lab"), businessId: mockLaboratories[0]?.businessId ?? "biz_dermaland", name: payload.name, country: payload.country, createdAt: now, updatedAt: now };
    labOverlay.extra.push(item); notifyCatalogChanged(); return { ok: true, item };
  }
  labOverlay.patches[id!] = { ...(labOverlay.patches[id!] ?? {}), ...payload, updatedAt: now };
  const item = viewLocal(mockLaboratories, labOverlay).find((l) => l.id === id);
  notifyCatalogChanged();
  return item ? { ok: true, item } : { ok: false, error: "Laboratorio no encontrado." };
}
export async function deleteLaboratoryAnywhere(id: string): Promise<CatalogDeleteResult> {
  if (CATALOG_BACKEND === "supabase") return serverDelete(`/api/laboratories/${id}`);
  labOverlay.deleted.add(id); notifyCatalogChanged(); return { ok: true };
}
```

- [ ] **Step 4: Correr → pasa**

Run: `pnpm --filter web exec vitest run src/features/products/catalog-store.test.ts`
Expected: PASS.

- [ ] **Step 5: typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/products/catalog-store.ts apps/web/src/features/products/catalog-store.test.ts
git commit -m "feat(catalogos): store cliente con hooks+wrappers y fallback"
```

---

### Task 9: Primitivo `Modal`

**Files:**
- Create: `apps/web/src/components/ui/modal.tsx`
- Modify: `apps/web/src/components/ui/index.ts`

**Interfaces:**
- Produces: `Modal` con props `{ open: boolean; title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }`.

- [ ] **Step 1: Crear `modal.tsx`** (modelado en `confirm-dialog.tsx`, overlay + panel):

```tsx
"use client";

import * as React from "react";
import { X } from "lucide-react";

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  React.useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1 opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-black/5 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Exportar** en `components/ui/index.ts` — agregar:

```ts
export { Modal } from "./modal";
export type { ModalProps } from "./modal";
```

- [ ] **Step 3: typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ui/modal.tsx apps/web/src/components/ui/index.ts
git commit -m "feat(ui): primitivo Modal"
```

---

### Task 10: `CatalogFormDialog` + página de Marcas con CRUD

**Files:**
- Create: `apps/web/src/features/products/catalog-form-dialog.tsx`
- Modify: `apps/web/src/app/(app)/productos/marcas/page.tsx`

**Interfaces:**
- Consumes: `Modal`, `Input`, `Label`, `Button` de `@/components/ui`; `useBrandsList`, `saveBrand`, `deleteBrandAnywhere`, `CATALOG_BACKEND` de `catalog-store`.
- Produces: `CatalogFormDialog` genérico para entidades con campos `{ name, country?, description?, parentId? }`.

- [ ] **Step 1: Crear `catalog-form-dialog.tsx`**

```tsx
"use client";

import * as React from "react";
import { Modal, Button, Input, Label, Textarea } from "@/components/ui";

export interface CatalogField {
  key: "name" | "country" | "description";
  label: string;
  type?: "text" | "textarea";
  required?: boolean;
}

export interface CatalogFormDialogProps {
  open: boolean;
  title: string;
  fields: CatalogField[];
  initial?: Record<string, string>;
  submitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
}

export function CatalogFormDialog({
  open, title, fields, initial, submitting, error, onClose, onSubmit,
}: CatalogFormDialogProps) {
  const [values, setValues] = React.useState<Record<string, string>>(initial ?? {});
  React.useEffect(() => { setValues(initial ?? {}); }, [initial, open]);

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" size="sm" disabled={submitting} onClick={() => onSubmit(values)}>
            {submitting ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{error}</div>
        )}
        {fields.map((f) => (
          <div key={f.key}>
            <Label>{f.label}{f.required ? " *" : ""}</Label>
            {f.type === "textarea" ? (
              <Textarea value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
            ) : (
              <Input value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Reescribir `marcas/page.tsx`** con CRUD real:

```tsx
"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, Card, CardContent } from "@/components/ui";
import { RowActions } from "@/components/ui/row-actions";
import { useToast } from "@/components/ui/toast";
import { CatalogFormDialog } from "@/features/products/catalog-form-dialog";
import {
  useBrandsList, saveBrand, deleteBrandAnywhere, CATALOG_BACKEND,
} from "@/features/products/catalog-store";

export default function MarcasPage() {
  const brands = useBrandsList();
  const toast = useToast();
  const [dialog, setDialog] = React.useState<{ mode: "create" | "edit"; id?: string; initial?: Record<string, string> } | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const isLocal = CATALOG_BACKEND === "local";

  const onSubmit = async (values: Record<string, string>) => {
    setSubmitting(true); setError(null);
    const res = await saveBrand(dialog!.mode, { name: values.name ?? "" }, dialog?.id);
    setSubmitting(false);
    if (!res.ok) { setError(res.error); return; }
    toast.success(dialog!.mode === "create" ? "Marca creada." : "Cambios guardados.");
    setDialog(null);
  };

  return (
    <>
      <PageHeader
        title="Marcas"
        description="Marcas del catálogo DermaLand."
        breadcrumbs={[{ label: "Productos", href: "/productos" }, { label: "Marcas" }]}
        actions={
          <Button size="sm" onClick={() => { setError(null); setDialog({ mode: "create", initial: {} }); }}>
            <Plus className="h-4 w-4" /> Nueva marca
          </Button>
        }
      />
      <div className={`mb-4 rounded-xl border px-4 py-2.5 text-xs ${isLocal ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
        {isLocal
          ? "Los cambios se guardan en este equipo (modo demo, sin Supabase)."
          : "Las marcas son una fuente única compartida (Supabase). Los cambios se ven en todos los equipos."}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {brands.map((b) => (
          <Card key={b.id}>
            <CardContent className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{b.name}</div>
                <div className="mt-0.5 text-xs opacity-60">{b.productCount} productos</div>
              </div>
              <RowActions
                viewHref={`/productos?brand=${b.id}`}
                onEdit={() => { setError(null); setDialog({ mode: "edit", id: b.id, initial: { name: b.name } }); }}
                onDelete={async () => {
                  const res = await deleteBrandAnywhere(b.id);
                  if (!res.ok) toast.error(res.error);
                  else toast.success("Marca eliminada.");
                }}
                entityName={b.name}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <CatalogFormDialog
        open={dialog !== null}
        title={dialog?.mode === "edit" ? "Editar marca" : "Nueva marca"}
        fields={[{ key: "name", label: "Nombre", required: true }]}
        initial={dialog?.initial}
        submitting={submitting}
        error={error}
        onClose={() => setDialog(null)}
        onSubmit={onSubmit}
      />
      <toast.Toast />
    </>
  );
}
```

> `RowActions` soporta `onEdit?: () => void` (ver `components/ui/row-actions.tsx`). Si en la versión instalada `onEdit` no existe y solo hay `editHref`, agregar soporte `onEdit` al componente (rama: si `onEdit` está, botón llama `onEdit`; si no, usa `editHref`). Verificar en Step 3.

- [ ] **Step 3: Verificar prop `onEdit` en RowActions**

Run: `pnpm --filter web exec grep -n "onEdit" src/components/ui/row-actions.tsx`
Expected: existe `onEdit?: () => void`. Si no aparece, agregarlo: en la interfaz de props `onEdit?: () => void;`, y donde se renderiza el botón Editar, usar `onClick={onEdit}` cuando `onEdit` esté definido (en vez de navegar a `editHref`).

- [ ] **Step 4: typecheck + build**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/products/catalog-form-dialog.tsx "apps/web/src/app/(app)/productos/marcas/page.tsx" apps/web/src/components/ui/row-actions.tsx
git commit -m "feat(catalogos): CRUD de marcas con modal (gated)"
```

---

### Task 11: Páginas de Categorías y Laboratorios con CRUD

**Files:**
- Modify: `apps/web/src/app/(app)/productos/categorias/page.tsx`
- Modify: `apps/web/src/app/(app)/productos/laboratorios/page.tsx`

**Interfaces:**
- Consumes: `CatalogFormDialog`, `useCategoriesList`/`saveCategory`/`deleteCategoryAnywhere`, `useLaboratoriesList`/`saveLaboratory`/`deleteLaboratoryAnywhere`, `CATALOG_BACKEND`.

- [ ] **Step 1: Reescribir `categorias/page.tsx`**

```tsx
"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, Card, CardContent } from "@/components/ui";
import { RowActions } from "@/components/ui/row-actions";
import { useToast } from "@/components/ui/toast";
import { CatalogFormDialog } from "@/features/products/catalog-form-dialog";
import {
  useCategoriesList, saveCategory, deleteCategoryAnywhere, CATALOG_BACKEND,
} from "@/features/products/catalog-store";

export default function CategoriasPage() {
  const categories = useCategoriesList();
  const toast = useToast();
  const [dialog, setDialog] = React.useState<{ mode: "create" | "edit"; id?: string; initial?: Record<string, string> } | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const isLocal = CATALOG_BACKEND === "local";

  const onSubmit = async (values: Record<string, string>) => {
    setSubmitting(true); setError(null);
    const res = await saveCategory(dialog!.mode, { name: values.name ?? "", description: values.description }, dialog?.id);
    setSubmitting(false);
    if (!res.ok) { setError(res.error); return; }
    toast.success(dialog!.mode === "create" ? "Categoría creada." : "Cambios guardados.");
    setDialog(null);
  };

  return (
    <>
      <PageHeader
        title="Categorías"
        description="Categorías de productos."
        breadcrumbs={[{ label: "Productos", href: "/productos" }, { label: "Categorías" }]}
        actions={
          <Button size="sm" onClick={() => { setError(null); setDialog({ mode: "create", initial: {} }); }}>
            <Plus className="h-4 w-4" /> Nueva categoría
          </Button>
        }
      />
      <div className={`mb-4 rounded-xl border px-4 py-2.5 text-xs ${isLocal ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
        {isLocal
          ? "Los cambios se guardan en este equipo (modo demo, sin Supabase)."
          : "Las categorías son una fuente única compartida (Supabase)."}
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <Card key={c.id}>
            <CardContent>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold">{c.name}</h3>
                  <p className="mt-1 text-xs opacity-60">{c.description ?? "—"}</p>
                </div>
                <RowActions
                  viewHref={`/productos?category=${c.id}`}
                  onEdit={() => { setError(null); setDialog({ mode: "edit", id: c.id, initial: { name: c.name, description: c.description ?? "" } }); }}
                  onDelete={async () => {
                    const res = await deleteCategoryAnywhere(c.id);
                    if (!res.ok) toast.error(res.error);
                    else toast.success("Categoría eliminada.");
                  }}
                  entityName={c.name}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <CatalogFormDialog
        open={dialog !== null}
        title={dialog?.mode === "edit" ? "Editar categoría" : "Nueva categoría"}
        fields={[
          { key: "name", label: "Nombre", required: true },
          { key: "description", label: "Descripción", type: "textarea" },
        ]}
        initial={dialog?.initial}
        submitting={submitting}
        error={error}
        onClose={() => setDialog(null)}
        onSubmit={onSubmit}
      />
      <toast.Toast />
    </>
  );
}
```

- [ ] **Step 2: Reescribir `laboratorios/page.tsx`**

> Esta página hoy importa `mockProducts`/`computeLabSales` para un ranking de ventas. Conservar ese bloque tal cual; solo cambiar el origen de la lista de labs (`useLaboratoriesList()`), el botón "Nuevo laboratorio", el editar y el borrar a modal/wrappers. La columna de ventas sigue computándose desde `computeLabSales(labs, mockProducts, proformas, ...)` con `labs` = la lista del hook. Cambios mínimos:

  1. Reemplazar `const { visible, hide } = useLocalSoftDelete(mockLaboratories);` por `const labs = useLaboratoriesList();` y usar `labs` donde se usaba `visible`.
  2. Importar `CatalogFormDialog`, `saveLaboratory`, `deleteLaboratoryAnywhere`, `CATALOG_BACKEND` de los módulos correspondientes; quitar `useLocalSoftDelete`.
  3. Botón "Nuevo laboratorio" abre `setDialog({ mode: "create", initial: {} })`.
  4. En cada fila, `onEdit` abre el modal con `{ name, country }`; `onDelete` llama `deleteLaboratoryAnywhere(id)` con toast (manteniendo el `hide` fuera).
  5. Render del `CatalogFormDialog` con campos `[{ key: "name", label: "Nombre", required: true }, { key: "country", label: "País" }]` y `onSubmit` que llama `saveLaboratory(dialog.mode, { name, country }, id)`.
  6. Agregar el mismo banner ámbar/verde según `CATALOG_BACKEND`.

Estado y handlers a agregar (idénticos en forma a marcas/categorías):

```tsx
const [dialog, setDialog] = React.useState<{ mode: "create" | "edit"; id?: string; initial?: Record<string, string> } | null>(null);
const [submitting, setSubmitting] = React.useState(false);
const [error, setError] = React.useState<string | null>(null);
const isLocal = CATALOG_BACKEND === "local";

const onSubmit = async (values: Record<string, string>) => {
  setSubmitting(true); setError(null);
  const res = await saveLaboratory(dialog!.mode, { name: values.name ?? "", country: values.country }, dialog?.id);
  setSubmitting(false);
  if (!res.ok) { setError(res.error); return; }
  toast.success(dialog!.mode === "create" ? "Laboratorio creado." : "Cambios guardados.");
  setDialog(null);
};
```

Y al final del JSX, antes de `<toast.Toast />`:

```tsx
<CatalogFormDialog
  open={dialog !== null}
  title={dialog?.mode === "edit" ? "Editar laboratorio" : "Nuevo laboratorio"}
  fields={[{ key: "name", label: "Nombre", required: true }, { key: "country", label: "País" }]}
  initial={dialog?.initial}
  submitting={submitting}
  error={error}
  onClose={() => setDialog(null)}
  onSubmit={onSubmit}
/>
```

- [ ] **Step 3: typecheck + build**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(app)/productos/categorias/page.tsx" "apps/web/src/app/(app)/productos/laboratorios/page.tsx"
git commit -m "feat(catalogos): CRUD de categorías y laboratorios con modal (gated)"
```

---

### Task 12: Dropdowns del formulario de producto desde hooks de catálogo

**Files:**
- Modify: `apps/web/src/features/products/product-form.tsx:19-21,338,352,366`

**Interfaces:**
- Consumes: `useBrandsList`, `useCategoriesList`, `useLaboratoriesList` (Task 8).

- [ ] **Step 1: Reemplazar imports estáticos por hooks**

Quitar de `product-form.tsx` el import `mockBrands, mockCategories, mockLaboratories` desde `@/lib/mock-data/catalog`. Agregar:

```ts
import { useBrandsList, useCategoriesList, useLaboratoriesList } from "@/features/products/catalog-store";
```

Dentro del componente, cerca del tope:

```ts
const brands = useBrandsList();
const categories = useCategoriesList();
const laboratories = useLaboratoriesList();
```

- [ ] **Step 2: Usar las variables en los `<Select>`**

Reemplazar `mockBrands.map(...)` → `brands.map(...)`, `mockCategories.map(...)` → `categories.map(...)`, `mockLaboratories.map(...)` → `laboratories.map(...)` (líneas ~338/352/366). Mantener el resto del markup.

- [ ] **Step 3: typecheck + build**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: OK. En modo local los dropdowns muestran el mock; en supabase, el catálogo del servidor.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/products/product-form.tsx
git commit -m "feat(productos): dropdowns de catálogo desde hooks (local/supabase)"
```

---

### Task 13: Verificación final + documentación

**Files:**
- Modify: `docs/auditoria-supabase.md`
- Modify: `docs/proximos-pasos.md`

- [ ] **Step 1: Suite completa verde**

Run: `pnpm --filter web typecheck && pnpm --filter web exec vitest run && pnpm --filter web build`
Expected: typecheck OK; vitest **todo verde** (609 previos + nuevos de Task 1/2/6/8); build OK.

- [ ] **Step 2: Actualizar `docs/auditoria-supabase.md`** — en la matriz, marcar Productos/Categorías/Marcas/Laboratorios como ✅ migrados (read+write vía API, fallback local, seed); en el plan de migración tachar el item 2 (Productos + catálogos) con nota "HECHO <fecha>".

- [ ] **Step 3: Actualizar `docs/proximos-pasos.md`** — agregar fila a "Hecho recientemente" con la migración de Productos + catálogos.

- [ ] **Step 4: Commit**

```bash
git add docs/auditoria-supabase.md docs/proximos-pasos.md
git commit -m "docs: Productos + catálogos migrados a Supabase"
```

- [ ] **Step 5 (manual, documentado):** verificación e2e real — autenticar MCP, fijar `NEXT_PUBLIC_DATA_SOURCE=supabase` + `DATA_SOURCE=supabase` en Preview, correr el seed real (2×), y confirmar que dos PCs ven el mismo catálogo y que crear/editar/borrar en una se refleja en la otra.

---

## Self-Review

**Spec coverage:**
- Repos escritura productos → Task 1 ✓; catálogos → Task 2 ✓.
- API routes productos → Task 3 ✓; catálogos → Task 4 ✓.
- Seed idempotente → Task 5 ✓.
- Cliente productos (hooks/wrappers/form) → Task 6, 7 ✓.
- Cliente catálogos + UI CRUD (modales) → Task 8–12 ✓.
- Banner de modo → Task 10/11 ✓ (marcas/categorías/labs).
- Soft-delete productos / hard-delete catálogos por FK → Task 1 (deleted_at), Task 2 (delete) ✓.
- Error handling (fallback, unicidad, FK) → wrappers Task 6/8, repos traducen errores ✓.
- Testing (mock repos + stores locales) → Task 1/2/6/8 ✓; e2e documentado Task 13 ✓.
- Sin migraciones nuevas / producción intacta / gated → Global Constraints + cada route 409 ✓.
- Fuera de alcance (inventario/Alegra/product_count transaccional) → respetado; `brands.product_count` se siembra y no se mantiene (documentado en spec) ✓.

**Placeholder scan:** sin TBD/TODO. Las dos notas condicionales ("si `onEdit` no existe en RowActions", "si `new-product-form` invoca mutaciones") incluyen el qué hacer en cada rama, con verificación previa (grep) — no son huecos.

**Type consistency:** `saveProduct`/`deleteProductAnywhere` (Product), `saveBrand`/`saveCategory`/`saveLaboratory` devuelven `CatalogResult<T>` con `.item`; hooks `useBrandsList`/`useCategoriesList`/`useLaboratoriesList`; repos `create/update/softDelete` (product) y `create/update/delete` (catálogos) coinciden entre interfaz (types.ts), mock y supabase. Llaves de respuesta API (`products/product`, `brands/brand`, `categories/category`, `laboratories/laboratory`) consistentes entre route y `catalog-store`/`product-store`.
