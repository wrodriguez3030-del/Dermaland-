# Tienda F3.0 — la cara de la tienda y los recomendados

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `/tienda` deje de ser una rejilla plana y pase a ser una portada de tienda —estantes por sección, categorías con URL propia, buscador visible y recomendados automáticos— sin tocar el ERP ni encender la tienda.

**Architecture:** Toda la lógica nueva son **funciones puras** en `features/storefront/` (`recommendations.ts`, `home-sections.ts`), probadas sin base de datos, que consumen el catálogo ya cacheado por `loadPublishedCatalog`. Las rutas nuevas (`/tienda/catalogo`, `/tienda/categoria/[slug]`) son Server Components que no añaden **ni una consulta más**: reutilizan la misma caché de dos niveles. Cero columnas nuevas, cero migraciones.

**Tech Stack:** Next.js 15.5.18 (App Router) · React 19 · TypeScript estricto · Tailwind 4 · Vitest · pnpm.

## Global Constraints

- **La tienda sigue APAGADA.** Ningún paso de este plan la enciende. Se prueba en local encendiéndola temporalmente y **devolviéndola siempre al estado seguro**.
- **Cero cambios en la base.** Ni migraciones, ni columnas, ni políticas. `products`, `product_lots`, `clients` y `proformas` no se tocan.
- **`components/ui/` se consume, no se modifica** (`tienda-en-linea.md` §5). Los ajustes de accesibilidad se hacen en el llamador.
- **Contraste AA:** texto pequeño usa `--brand-primary` (6,7:1). **Nunca** `--brand-accent` (3,7:1) ni `--brand-success` (3,3:1) en texto pequeño. Disponibilidad con el `Badge` del ERP.
- **Táctil ≥ 44 px** (`min-h-11`) en todo lo pulsable.
- **Nada de `Math.random()` ni `Date.now()`** en la selección de productos: el orden debe ser determinista o la caché serviría estantes distintos a cada visitante.
- **Lo agotado nunca primero** (`tienda-en-linea.md` §3.8). En los estantes de la portada, directamente no aparece.
- **Nada de datos internos en el HTML**: se consume `PublicProduct`, que ya está construido por lista blanca. Este plan **no amplía** ese tipo.
- Comandos: `pnpm --filter web test <patrón>` · `pnpm --filter web typecheck` · `pnpm --filter web dev` (puerto 3031).

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `features/storefront/recommendations.ts` | Función pura: dado un producto y el catálogo, qué recomendar. |
| `features/storefront/recommendations.test.ts` | Sus pruebas. |
| `features/storefront/home-sections.ts` | Función pura: dado el catálogo, qué estantes tiene la portada. |
| `features/storefront/home-sections.test.ts` | Sus pruebas. |
| `features/storefront/components/product-shelf.tsx` | Estante horizontal de tarjetas, con su título y su "ver todo". |
| `features/storefront/components/search-box.tsx` | Buscador del encabezado. `<form method="get">`, sin JavaScript. |
| `features/storefront/components/category-nav.tsx` | Barra de categorías del encabezado. |
| `app/tienda/catalogo/page.tsx` | La rejilla con filtros, búsqueda y paginación (hoy es `/tienda`). |
| `app/tienda/categoria/[slug]/page.tsx` | Colección de una categoría, con su H1 y su canónica. |

**Se modifican:**

| Archivo | Cambio |
|---|---|
| `app/tienda/page.tsx` | Deja de ser rejilla y pasa a ser **portada**. |
| `app/tienda/layout.tsx` | El encabezado gana buscador y navegación de categorías. |
| `app/tienda/producto/[slug]/page.tsx` | Usa `recommendations.ts` en vez de su función local. |
| `features/storefront/catalog-params.ts` | Constantes `CATALOG_BASE` y helper `categoryHref`. |
| `features/storefront/components/product-card.tsx` | Foto más grande, jerarquía de tienda. |
| `app/sitemap.ts` | Añade `/tienda/catalogo` y las categorías. |

**No se toca:** `catalog-query.ts`, `publishability.ts`, `public-product.ts`, `tenant.ts`, `catalog.ts`, `middleware.ts` (`/tienda/...` ya entra por segmento: `isPublic` hace `pathname.startsWith(p + "/")`).

---

### Task 1: Recomendados automáticos

Hoy la ficha recomienda **misma marca primero**. El negocio pidió *"productos recomendados por categoría"*, así que la prelación se invierte y se saca a una función pura reutilizable por la portada.

`product_web_meta.related_product_ids` existe en la base pero **ningún código lo escribe ni lo lee** — el administrador no lo edita. Recomendación manual queda fuera de F3.0 hasta que exista el camino de escritura.

**Files:**
- Create: `apps/web/src/features/storefront/recommendations.ts`
- Test: `apps/web/src/features/storefront/recommendations.test.ts`
- Modify: `apps/web/src/app/tienda/producto/[slug]/page.tsx` (borra `cargarRelacionados`, líneas 271-297)

**Interfaces:**
- Consumes: `PublicProduct` de `features/storefront/types`.
- Produces: `recommendFor(product, catalog, options?): PublicProduct[]` y `RECOMMENDATION_LIMIT: number`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/storefront/recommendations.test.ts
import { describe, expect, it } from "vitest";
import { recommendFor } from "./recommendations";
import type { PublicProduct } from "./types";

function producto(over: Partial<PublicProduct> & { slug: string }): PublicProduct {
  return {
    title: over.slug.toUpperCase(),
    benefits: [],
    price: 100,
    imageUrl: "https://x.supabase.co/storage/v1/object/public/product-images/a.jpg",
    availability: { status: "in_stock", label: "Disponible" },
    featured: false,
    isNew: false,
    ...over,
  };
}

const ACTUAL = producto({
  slug: "avene-solar",
  brandSlug: "avene",
  categorySlug: "solares",
});

describe("recommendFor", () => {
  it("prefiere la categoría sobre la marca — es lo que pidió el negocio", () => {
    const catalogo = [
      ACTUAL,
      producto({ slug: "isdin-solar", categorySlug: "solares" }),
      producto({ slug: "avene-limpiador", brandSlug: "avene", categorySlug: "limpieza" }),
    ];
    expect(recommendFor(ACTUAL, catalogo).map((p) => p.slug)).toEqual([
      "isdin-solar",
      "avene-limpiador",
    ]);
  });

  it("pone primero lo que coincide en categoría Y marca", () => {
    const catalogo = [
      ACTUAL,
      producto({ slug: "isdin-solar", categorySlug: "solares" }),
      producto({ slug: "avene-solar-50", brandSlug: "avene", categorySlug: "solares" }),
    ];
    expect(recommendFor(ACTUAL, catalogo)[0]?.slug).toBe("avene-solar-50");
  });

  it("nunca se recomienda a sí mismo", () => {
    expect(recommendFor(ACTUAL, [ACTUAL]).map((p) => p.slug)).toEqual([]);
  });

  it("no recomienda lo agotado — es la forma más rápida de perder la venta", () => {
    const catalogo = [
      ACTUAL,
      producto({
        slug: "agotado",
        categorySlug: "solares",
        availability: { status: "out_of_stock", label: "Agotado" },
      }),
    ];
    expect(recommendFor(ACTUAL, catalogo)).toEqual([]);
  });

  it("no recomienda lo que no tiene foto: un estante de marcadores grises parece roto", () => {
    const catalogo = [
      ACTUAL,
      producto({ slug: "sin-foto", categorySlug: "solares", imageUrl: null }),
    ];
    expect(recommendFor(ACTUAL, catalogo)).toEqual([]);
  });

  it("desempata igual siempre: destacado, novedad y luego nombre", () => {
    const catalogo = [
      ACTUAL,
      producto({ slug: "c", categorySlug: "solares", title: "C" }),
      producto({ slug: "a", categorySlug: "solares", title: "A" }),
      producto({ slug: "b", categorySlug: "solares", title: "B", featured: true }),
    ];
    const primera = recommendFor(ACTUAL, catalogo).map((p) => p.slug);
    const segunda = recommendFor(ACTUAL, [...catalogo].reverse()).map((p) => p.slug);
    expect(primera).toEqual(["b", "a", "c"]);
    expect(segunda).toEqual(primera);
  });

  it("respeta el tope", () => {
    const catalogo = [
      ACTUAL,
      ...Array.from({ length: 10 }, (_, i) =>
        producto({ slug: `p${i}`, categorySlug: "solares" }),
      ),
    ];
    expect(recommendFor(ACTUAL, catalogo, { limit: 3 })).toHaveLength(3);
  });

  it("un producto sin categoría ni marca no arrastra medio catálogo", () => {
    const suelto = producto({ slug: "suelto" });
    const catalogo = [suelto, producto({ slug: "otro", categorySlug: "solares" })];
    expect(recommendFor(suelto, catalogo)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/features/storefront/recommendations.test.ts`
Expected: FAIL — `Failed to resolve import "./recommendations"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/features/storefront/recommendations.ts
// Qué se le enseña a alguien que ya está mirando un producto.
//
// El negocio lo pidió así: "productos recomendados por categoría". Por eso la
// categoría manda sobre la marca, al revés de lo que hacía la ficha antes.
//
// Función pura y sin reloj ni azar A PROPÓSITO: el catálogo va cacheado cinco
// minutos, así que un orden aleatorio serviría estantes distintos a cada
// visitante según a quién le tocara refrescar la caché. Determinista, la página
// se ve igual para todos y las pruebas valen algo.

import type { PublicProduct } from "./types";

/** Cuántos recomendados se muestran cuando nadie dice otra cosa. */
export const RECOMMENDATION_LIMIT = 8;

export interface RecommendationOptions {
  limit?: number;
}

/**
 * Un candidato debe poder comprarse HOY y verse bien.
 *
 * Sin foto queda fuera: un estante de marcadores grises lee como tienda
 * descuidada, y aquí el marcador no es un fallo sino lo normal en 704 de los
 * 1 355 productos (R-WEB-05).
 */
function esCandidato(p: PublicProduct, actual: PublicProduct): boolean {
  return (
    p.slug !== actual.slug &&
    p.availability.status === "in_stock" &&
    p.imageUrl !== null
  );
}

/** Cuanto más alto, más arriba. Categoría pesa más que marca. */
function afinidad(p: PublicProduct, actual: PublicProduct): number {
  let total = 0;
  if (actual.categorySlug && p.categorySlug === actual.categorySlug) total += 10;
  if (actual.brandSlug && p.brandSlug === actual.brandSlug) total += 4;
  return total;
}

function desempatar(a: PublicProduct, b: PublicProduct): number {
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
  return a.title.localeCompare(b.title, "es");
}

export function recommendFor(
  product: PublicProduct,
  catalog: readonly PublicProduct[],
  options: RecommendationOptions = {},
): PublicProduct[] {
  const limite = Math.max(0, options.limit ?? RECOMMENDATION_LIMIT);

  return catalog
    .filter((p) => esCandidato(p, product) && afinidad(p, product) > 0)
    .sort(
      (a, b) =>
        afinidad(b, product) - afinidad(a, product) || desempatar(a, b),
    )
    .slice(0, limite);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/features/storefront/recommendations.test.ts`
Expected: PASS — 8 pruebas.

- [ ] **Step 5: Wire it into the ficha**

En `apps/web/src/app/tienda/producto/[slug]/page.tsx`:

1. Borra el bloque `async function cargarRelacionados(...)` completo (líneas 271-297) y la constante `const RELACIONADOS = 4;` (línea 43).
2. Borra el import de `PublicProduct` si queda sin uso (lo sigue usando `Migas`, así que **se queda**).
3. Añade el import:

```ts
import { recommendFor } from "@/features/storefront/recommendations";
```

4. Sustituye la línea `const relacionados = await cargarRelacionados(tenant.businessId, producto);` por:

```ts
  const { products: catalogo } = await loadPublishedCatalog(tenant.businessId);
  const relacionados = recommendFor(producto, catalogo, { limit: 4 });
```

- [ ] **Step 6: Verify typecheck and full suite**

Run: `pnpm --filter web typecheck && pnpm --filter web test`
Expected: PASS, sin errores de tipo y sin regresiones.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/storefront/recommendations.ts \
        apps/web/src/features/storefront/recommendations.test.ts \
        apps/web/src/app/tienda/producto/\[slug\]/page.tsx
git commit -m "feat(tienda): recomendados por categoría como función pura"
```

---

### Task 2: La rejilla se muda a `/tienda/catalogo`

`/tienda` no puede ser a la vez portada y buscador. La rejilla se muda a su propia dirección y **`/tienda` queda intacta en este paso** — se convierte en portada en la Task 5, para que ningún estado intermedio quede roto.

Se cambia el destino por defecto de `buildCatalogHref`, así que filtros, paginación y los enlaces de marca de la ficha apuntan solos al sitio nuevo.

**Files:**
- Create: `apps/web/src/app/tienda/catalogo/page.tsx`
- Modify: `apps/web/src/features/storefront/catalog-params.ts`
- Modify: `apps/web/src/features/storefront/catalog-params.test.ts`
- Modify: `apps/web/src/app/sitemap.ts`

**Interfaces:**
- Produces: `CATALOG_BASE = "/tienda/catalogo"` exportado de `catalog-params.ts`.

- [ ] **Step 1: Write the failing test**

Añade al final del `describe` principal de `apps/web/src/features/storefront/catalog-params.test.ts`:

```ts
  it("los enlaces del catálogo apuntan a /tienda/catalogo, no a la portada", () => {
    expect(buildCatalogHref({}, { brandSlug: "avene" })).toBe(
      "/tienda/catalogo?marca=avene",
    );
    expect(buildCatalogHref({})).toBe("/tienda/catalogo");
  });
```

No hace falta tocar los imports: `buildCatalogHref` ya está importado en ese archivo.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/features/storefront/catalog-params.test.ts`
Expected: FAIL — recibe `/tienda?marca=avene`.

- [ ] **Step 3: Change the default base**

En `apps/web/src/features/storefront/catalog-params.ts`, justo debajo de `CATALOG_PARAM`:

```ts
/**
 * Dónde vive la rejilla con filtros. `/tienda` es la PORTADA: mezclar las dos
 * obligaba a que la misma URL fuera dos páginas distintas según llevara o no
 * parámetros, y eso se nota en la canónica y en el título.
 */
export const CATALOG_BASE = "/tienda/catalogo";
```

Y cambia la firma de `buildCatalogHref` (línea 71) de `base = "/tienda"` a:

```ts
  base = CATALOG_BASE,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/features/storefront/catalog-params.test.ts`
Expected: PASS.

- [ ] **Step 5: Move the grid**

Crea `apps/web/src/app/tienda/catalogo/page.tsx` con **exactamente** el contenido actual de `apps/web/src/app/tienda/page.tsx`, con estos tres cambios:

1. En `generateMetadata`, el título sin filtros pasa de `"Catálogo"` a `"Todo el catálogo"`.
2. En el cuerpo, el `<h1>` usa `{filtrado ? "Resultados" : "Todo el catálogo"}`.
3. Añade este comentario encima de `export default async function`:

```ts
/**
 * La rejilla: búsqueda, filtros, orden y paginación.
 *
 * Vive aquí y no en `/tienda` porque la portada y el buscador son dos páginas
 * distintas: distinto H1, distinta canónica y distinta política de indexación
 * (los resultados de búsqueda van `noindex`, la portada no).
 */
```

Renombra la función a `CatalogoPage`.

**No borres `apps/web/src/app/tienda/page.tsx` todavía.** Se reemplaza en la Task 5.

- [ ] **Step 6: Add it to the sitemap**

En `apps/web/src/app/sitemap.ts`, dentro del array devuelto, justo después de la entrada de `/tienda`:

```ts
    {
      url: `${base}/tienda/catalogo`,
      changeFrequency: "daily",
      priority: 0.9,
    },
```

- [ ] **Step 7: Verify**

Run: `pnpm --filter web typecheck && pnpm --filter web test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/tienda/catalogo/page.tsx \
        apps/web/src/features/storefront/catalog-params.ts \
        apps/web/src/features/storefront/catalog-params.test.ts \
        apps/web/src/app/sitemap.ts
git commit -m "feat(tienda): la rejilla se muda a /tienda/catalogo"
```

---

### Task 3: Categorías con dirección propia

Hoy una categoría solo existe como parámetro (`?categoria=solares`): no tiene título propio, ni canónica propia, ni entra en el sitemap. Para un buscador esa colección **no existe**. Se le da URL, H1 y metadatos.

**Files:**
- Create: `apps/web/src/app/tienda/categoria/[slug]/page.tsx`
- Modify: `apps/web/src/features/storefront/catalog-params.ts`
- Modify: `apps/web/src/features/storefront/catalog-params.test.ts`
- Modify: `apps/web/src/app/sitemap.ts`
- Modify: `apps/web/src/app/tienda/producto/[slug]/page.tsx` (migas y JSON-LD siguen a la categoría)

**Interfaces:**
- Consumes: `CATALOG_BASE` de la Task 2.
- Produces: `categoryHref(slug: string): string`.

- [ ] **Step 1: Write the failing test**

Añade a `apps/web/src/features/storefront/catalog-params.test.ts`:

```ts
describe("categoryHref", () => {
  it("da a cada categoría su propia dirección", () => {
    expect(categoryHref("proteccion-solar")).toBe(
      "/tienda/categoria/proteccion-solar",
    );
  });

  it("escapa lo que venga con caracteres raros", () => {
    expect(categoryHref("piel & sol")).toBe("/tienda/categoria/piel%20%26%20sol");
  });
});
```

Y amplía el import de la cabecera del archivo para incluir `categoryHref`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/features/storefront/catalog-params.test.ts`
Expected: FAIL — `categoryHref is not a function`.

- [ ] **Step 3: Add the helper**

Al final de `apps/web/src/features/storefront/catalog-params.ts`:

```ts
/**
 * Dirección de una categoría.
 *
 * Es una página, no un filtro: tiene su propio H1 y su propia canónica, y por
 * eso puede entrar en el sitemap y posicionar. `encodeURIComponent` porque el
 * slug sale de un nombre escrito por una persona y podría traer cualquier cosa.
 */
export function categoryHref(slug: string): string {
  return `/tienda/categoria/${encodeURIComponent(slug)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/features/storefront/catalog-params.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the category route**

```tsx
// apps/web/src/app/tienda/categoria/[slug]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  buildCatalogHref,
  parseCatalogParams,
  type RawSearchParams,
} from "@/features/storefront/catalog-params";
import {
  DEFAULT_PAGE_SIZE,
  queryCatalog,
} from "@/features/storefront/catalog-query";
import { CatalogPagination } from "@/features/storefront/components/catalog-pagination";
import { ProductCard } from "@/features/storefront/components/product-card";
import { loadPublishedCatalog } from "@/server/services/storefront/catalog";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";

/**
 * Colección de una categoría.
 *
 * Es una PÁGINA, no un filtro: título propio, canónica propia y sitio en el
 * sitemap. Un `?categoria=solares` es invisible para un buscador; esto no.
 *
 * Igual que en `/tienda`, `searchParams` se lee antes que nada: si el primer
 * `await` fuera el del negocio, con la tienda apagada Next concluiría que la
 * página no depende de la URL y congelaría el 404 en el build.
 */

/** Fotos que se cargan de inmediato: las que se ven sin bajar. */
const FOTOS_PRIORITARIAS = 4;

async function cargar(slug: string) {
  const tenant = await resolveStorefrontTenant();
  if (!tenant) return null;
  const { products, categories } = await loadPublishedCatalog(tenant.businessId);
  const categoria = categories.find((c) => c.slug === slug);
  if (!categoria) return null;
  return { tenant, categoria, products };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const datos = await cargar(slug);
  if (!datos) return { title: "Categoría no disponible", robots: { index: false } };

  const { categoria } = datos;
  return {
    title: categoria.name,
    description: `${categoria.name} en ${datos.tenant.siteName}. ${categoria.productCount} productos disponibles.`,
    // Las colecciones SÍ se indexan: son estables y reales, al revés que una
    // página de resultados de búsqueda.
    alternates: { canonical: `/tienda/categoria/${categoria.slug}` },
  };
}

export default async function CategoriaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const query = parseCatalogParams(await searchParams);
  const { slug } = await params;
  const datos = await cargar(slug);
  if (!datos) notFound();
  const { categoria, products } = datos;

  const resultado = queryCatalog(products, {
    ...query,
    q: undefined,
    categorySlug: categoria.slug,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  return (
    <>
      <nav aria-label="Ruta de navegación" className="mb-6">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-[color:var(--brand-fg)]/60">
          <li>
            <Link
              href="/tienda"
              className="underline-offset-4 hover:text-[color:var(--brand-primary)] hover:underline"
            >
              Tienda
            </Link>
          </li>
          <ChevronRight aria-hidden className="h-4 w-4 shrink-0" />
          <li aria-current="page" className="text-[color:var(--brand-fg)]">
            {categoria.name}
          </li>
        </ol>
      </nav>

      <h1 className="text-2xl font-bold tracking-tight text-[color:var(--brand-fg)] sm:text-3xl">
        {categoria.name}
      </h1>
      <p className="mt-2 text-sm text-[color:var(--brand-fg)]/60">
        {resultado.total === 1 ? "1 producto" : `${resultado.total} productos`}
      </p>

      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {resultado.items.map((producto, indice) => (
          <li key={producto.slug} className="h-full">
            <ProductCard product={producto} priority={indice < FOTOS_PRIORITARIAS} />
          </li>
        ))}
      </ul>

      <CatalogPagination
        query={{ ...query, categorySlug: categoria.slug }}
        result={resultado}
      />

      <p className="mt-10 text-sm">
        <Link
          href={buildCatalogHref({})}
          className="text-[color:var(--brand-primary)] underline-offset-4 hover:underline"
        >
          Ver todo el catálogo
        </Link>
      </p>
    </>
  );
}
```

- [ ] **Step 6: Point the ficha's category links at the new page**

En `apps/web/src/app/tienda/producto/[slug]/page.tsx`:

1. Amplía el import: `import { buildCatalogHref, categoryHref } from "@/features/storefront/catalog-params";`
2. En `Migas`, sustituye el `href` de la categoría por `href={categoryHref(producto.categorySlug)}`.

- [ ] **Step 7: Add categories to the sitemap**

En `apps/web/src/app/sitemap.ts`:

1. Cambia el destructuring a `const { products, categories } = await loadPublishedCatalog(tenant.businessId);`
2. Añade el import: `import { categoryHref } from "@/features/storefront/catalog-params";`
3. Antes de las fichas de producto, dentro del array:

```ts
    ...categories.map((categoria) => ({
      url: `${base}${categoryHref(categoria.slug)}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
```

- [ ] **Step 8: Verify**

Run: `pnpm --filter web typecheck && pnpm --filter web test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/tienda/categoria apps/web/src/features/storefront/catalog-params.ts \
        apps/web/src/features/storefront/catalog-params.test.ts apps/web/src/app/sitemap.ts \
        apps/web/src/app/tienda/producto/\[slug\]/page.tsx
git commit -m "feat(tienda): cada categoría con su propia página, canónica y sitemap"
```

---

### Task 4: Los estantes de la portada

Función pura que decide **qué secciones tiene la portada**. Aparte de la página a propósito: es la única parte con reglas de negocio (cuántos, cuáles, cuándo se oculta un estante) y se prueba entera sin React ni base de datos.

**Files:**
- Create: `apps/web/src/features/storefront/home-sections.ts`
- Test: `apps/web/src/features/storefront/home-sections.test.ts`

**Interfaces:**
- Consumes: `PublicProduct`, `PublicTaxonomy` de `features/storefront/types`.
- Produces: `buildHomeSections(products, categories, options?): HomeSection[]` y la interfaz `HomeSection { key, title, href, items }`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/storefront/home-sections.test.ts
import { describe, expect, it } from "vitest";
import { buildHomeSections } from "./home-sections";
import type { PublicProduct, PublicTaxonomy } from "./types";

function producto(over: Partial<PublicProduct> & { slug: string }): PublicProduct {
  return {
    title: over.slug.toUpperCase(),
    benefits: [],
    price: 100,
    imageUrl: "https://x.supabase.co/storage/v1/object/public/product-images/a.jpg",
    availability: { status: "in_stock", label: "Disponible" },
    featured: false,
    isNew: false,
    ...over,
  };
}

/** n productos publicables de una categoría. */
function lote(prefijo: string, n: number, over: Partial<PublicProduct> = {}) {
  return Array.from({ length: n }, (_, i) =>
    producto({ slug: `${prefijo}-${i}`, ...over }),
  );
}

const CATEGORIAS: PublicTaxonomy[] = [
  { slug: "solares", name: "Protección solar", productCount: 20 },
  { slug: "limpieza", name: "Limpieza facial", productCount: 10 },
];

describe("buildHomeSections", () => {
  it("abre con destacados y novedades, en ese orden", () => {
    const productos = [
      ...lote("d", 4, { featured: true, categorySlug: "solares" }),
      ...lote("n", 4, { isNew: true, categorySlug: "solares" }),
    ];
    const claves = buildHomeSections(productos, CATEGORIAS).map((s) => s.key);
    expect(claves.slice(0, 2)).toEqual(["destacados", "novedades"]);
  });

  it("oculta el estante que no llega al mínimo: uno con 2 productos parece roto", () => {
    const productos = [
      ...lote("d", 2, { featured: true, categorySlug: "solares" }),
      ...lote("s", 6, { categorySlug: "solares" }),
    ];
    const claves = buildHomeSections(productos, CATEGORIAS).map((s) => s.key);
    expect(claves).not.toContain("destacados");
    expect(claves).toContain("categoria:solares");
  });

  it("cada estante de categoría enlaza a su página", () => {
    const productos = lote("s", 6, { categorySlug: "solares" });
    const seccion = buildHomeSections(productos, CATEGORIAS).find(
      (s) => s.key === "categoria:solares",
    );
    expect(seccion?.title).toBe("Protección solar");
    expect(seccion?.href).toBe("/tienda/categoria/solares");
  });

  it("nunca pone en un estante lo agotado ni lo que no tiene foto", () => {
    const productos = [
      ...lote("s", 5, { categorySlug: "solares" }),
      producto({
        slug: "agotado",
        categorySlug: "solares",
        availability: { status: "out_of_stock", label: "Agotado" },
      }),
      producto({ slug: "sin-foto", categorySlug: "solares", imageUrl: null }),
    ];
    const items = buildHomeSections(productos, CATEGORIAS)
      .flatMap((s) => s.items)
      .map((p) => p.slug);
    expect(items).not.toContain("agotado");
    expect(items).not.toContain("sin-foto");
  });

  it("es determinista: el catálogo al revés produce la misma portada", () => {
    const productos = [
      ...lote("d", 4, { featured: true, categorySlug: "solares" }),
      ...lote("s", 6, { categorySlug: "solares" }),
      ...lote("l", 6, { categorySlug: "limpieza" }),
    ];
    const a = buildHomeSections(productos, CATEGORIAS);
    const b = buildHomeSections([...productos].reverse(), CATEGORIAS);
    expect(b.map((s) => s.items.map((p) => p.slug))).toEqual(
      a.map((s) => s.items.map((p) => p.slug)),
    );
  });

  it("no repite en su categoría un producto que ya salió en destacados", () => {
    const productos = [
      ...lote("d", 4, { featured: true, categorySlug: "solares" }),
      ...lote("s", 4, { categorySlug: "solares" }),
    ];
    const secciones = buildHomeSections(productos, CATEGORIAS);
    const vistos = secciones.flatMap((s) => s.items.map((p) => p.slug));
    expect(new Set(vistos).size).toBe(vistos.length);
  });

  it("respeta el tope de categorías y el tamaño del estante", () => {
    const productos = [
      ...lote("s", 20, { categorySlug: "solares" }),
      ...lote("l", 20, { categorySlug: "limpieza" }),
    ];
    const secciones = buildHomeSections(productos, CATEGORIAS, {
      maxCategories: 1,
      shelfSize: 5,
    });
    expect(secciones).toHaveLength(1);
    expect(secciones[0]?.items).toHaveLength(5);
  });

  it("un catálogo vacío no revienta: devuelve cero estantes", () => {
    expect(buildHomeSections([], CATEGORIAS)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/features/storefront/home-sections.test.ts`
Expected: FAIL — `Failed to resolve import "./home-sections"`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/features/storefront/home-sections.ts
// Qué estantes tiene la portada de la tienda.
//
// Está separado de la página porque es la única parte con reglas de negocio
// —cuántos productos por estante, cuándo un estante no merece enseñarse, en qué
// orden van las categorías— y así se prueba entera sin React ni base de datos.
//
// Determinista a propósito: el catálogo va cacheado cinco minutos, así que un
// orden con `Math.random()` serviría portadas distintas según a quién le tocara
// refrescar la caché, y no habría forma de probarlo.

import { categoryHref } from "./catalog-params";
import type { PublicProduct, PublicTaxonomy } from "./types";

export interface HomeSection {
  /** Estable, para la `key` de React y para las pruebas. */
  key: string;
  title: string;
  /** "Ver todo". `null` si el estante no tiene página propia. */
  href: string | null;
  items: PublicProduct[];
}

export interface HomeSectionsOptions {
  /** Productos por estante. */
  shelfSize?: number;
  /** Por debajo de esto el estante no se enseña. */
  minItems?: number;
  /** Cuántas categorías llegan a la portada. */
  maxCategories?: number;
}

const POR_DEFECTO = {
  shelfSize: 8,
  /** Menos de cuatro deja un estante con huecos: mejor no enseñarlo. */
  minItems: 4,
  maxCategories: 6,
} as const;

/** Solo entra a un estante lo que se puede comprar hoy y tiene foto. */
function vendible(p: PublicProduct): boolean {
  return p.availability.status === "in_stock" && p.imageUrl !== null;
}

function ordenar(a: PublicProduct, b: PublicProduct): number {
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
  return a.title.localeCompare(b.title, "es");
}

export function buildHomeSections(
  products: readonly PublicProduct[],
  categories: readonly PublicTaxonomy[],
  options: HomeSectionsOptions = {},
): HomeSection[] {
  const { shelfSize, minItems, maxCategories } = { ...POR_DEFECTO, ...options };

  const disponibles = products.filter(vendible).sort(ordenar);
  const secciones: HomeSection[] = [];
  // Un producto no se repite entre estantes: verlo tres veces al bajar da la
  // sensación de catálogo corto, justo lo contrario de lo que se busca.
  const usados = new Set<string>();

  const tomar = (candidatos: PublicProduct[]): PublicProduct[] =>
    candidatos.filter((p) => !usados.has(p.slug)).slice(0, shelfSize);

  const añadir = (key: string, title: string, href: string | null, items: PublicProduct[]) => {
    if (items.length < minItems) return;
    items.forEach((p) => usados.add(p.slug));
    secciones.push({ key, title, href, items });
  };

  añadir(
    "destacados",
    "Destacados",
    null,
    tomar(disponibles.filter((p) => p.featured)),
  );
  añadir(
    "novedades",
    "Novedades",
    null,
    tomar(disponibles.filter((p) => p.isNew)),
  );

  // Las categorías con más catálogo primero: son las que mejor representan lo
  // que vende la tienda. Desempate por nombre para que el orden no dependa de
  // cómo llegara la lista.
  const porTamaño = [...categories].sort(
    (a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name, "es"),
  );

  for (const categoria of porTamaño) {
    if (secciones.filter((s) => s.key.startsWith("categoria:")).length >= maxCategories) {
      break;
    }
    añadir(
      `categoria:${categoria.slug}`,
      categoria.name,
      categoryHref(categoria.slug),
      tomar(disponibles.filter((p) => p.categorySlug === categoria.slug)),
    );
  }

  return secciones;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/features/storefront/home-sections.test.ts`
Expected: PASS — 8 pruebas.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/storefront/home-sections.ts \
        apps/web/src/features/storefront/home-sections.test.ts
git commit -m "feat(tienda): motor de secciones de la portada"
```

---

### Task 5: La portada

Aquí se ve el cambio. `/tienda` deja de ser una rejilla de 24 tarjetas iguales y pasa a ser una portada con estantes. El encabezado gana buscador y categorías.

**Files:**
- Create: `apps/web/src/features/storefront/components/product-shelf.tsx`
- Create: `apps/web/src/features/storefront/components/search-box.tsx`
- Create: `apps/web/src/features/storefront/components/category-nav.tsx`
- Modify: `apps/web/src/app/tienda/page.tsx` (reemplazo completo)
- Modify: `apps/web/src/app/tienda/layout.tsx`

**Interfaces:**
- Consumes: `buildHomeSections` (Task 4), `CATALOG_BASE` y `categoryHref` (Tasks 2-3), `ProductCard`.
- Produces: `<ProductShelf section>`, `<SearchBox defaultValue?>`, `<CategoryNav categories>`.

- [ ] **Step 1: Create the shelf**

```tsx
// apps/web/src/features/storefront/components/product-shelf.tsx
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { HomeSection } from "../home-sections";
import { ProductCard } from "./product-card";

/**
 * Un estante horizontal de la portada.
 *
 * Se desplaza de lado en vez de envolver en varias filas: es lo que hace que la
 * portada quepa en una pantalla y se entienda de un vistazo cuántas secciones
 * hay. El desplazamiento es el nativo del navegador —sin JavaScript—, así que
 * funciona con rueda, con dedo y con las flechas del teclado al tabular por los
 * enlaces.
 *
 * `role="region"` con nombre: quien navega con lector de pantalla puede saltar
 * de estante en estante en vez de recorrer 8 tarjetas para llegar al siguiente.
 */
export function ProductShelf({
  section,
  priority = false,
}: {
  section: HomeSection;
  /** El primer estante carga sus fotos de inmediato (LCP). */
  priority?: boolean;
}) {
  const tituloId = `estante-${section.key.replace(/[^a-z0-9]+/gi, "-")}`;

  return (
    <section aria-labelledby={tituloId} className="mt-10 first:mt-0">
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id={tituloId}
          className="text-lg font-bold tracking-tight text-[color:var(--brand-fg)] sm:text-xl"
        >
          {section.title}
        </h2>
        {section.href ? (
          <Link
            href={section.href}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-[color:var(--brand-primary)] underline-offset-4 hover:underline"
          >
            Ver todo
            <ChevronRight aria-hidden className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      <ul
        role="region"
        aria-label={section.title}
        tabIndex={0}
        className="-mx-4 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] sm:mx-0 sm:px-0"
      >
        {section.items.map((producto, indice) => (
          <li
            key={producto.slug}
            className="w-44 shrink-0 snap-start sm:w-52 lg:w-56"
          >
            <ProductCard
              product={producto}
              priority={priority && indice < 4}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Create the search box**

```tsx
// apps/web/src/features/storefront/components/search-box.tsx
import { Search } from "lucide-react";
import { CATALOG_BASE, CATALOG_PARAM } from "../catalog-params";

/**
 * Buscador del encabezado.
 *
 * `<form method="get">` y nada más: sin estado, sin JavaScript, sin
 * hidratación. Funciona antes de que cargue un solo kilobyte de React, se puede
 * enviar con Intro, y la URL que produce es la misma que se comparte por
 * WhatsApp. La barra de filtros del catálogo ya usa este mismo patrón.
 */
export function SearchBox({
  defaultValue,
  className,
}: {
  defaultValue?: string;
  className?: string;
}) {
  return (
    <form
      method="get"
      action={CATALOG_BASE}
      role="search"
      className={className}
    >
      <label htmlFor="buscador-tienda" className="sr-only">
        Buscar productos
      </label>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--brand-fg)]/40"
        />
        <input
          id="buscador-tienda"
          type="search"
          name={CATALOG_PARAM.q}
          defaultValue={defaultValue}
          placeholder="Buscar por producto o marca…"
          autoComplete="off"
          className="min-h-11 w-full rounded-full border border-black/10 bg-white pl-10 pr-4 text-sm text-[color:var(--brand-fg)] placeholder:text-[color:var(--brand-fg)]/40 focus:border-[color:var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-primary)]/20"
        />
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Create the category nav**

```tsx
// apps/web/src/features/storefront/components/category-nav.tsx
import Link from "next/link";
import { buildCatalogHref, categoryHref } from "../catalog-params";
import type { PublicTaxonomy } from "../types";

/** Cuántas categorías caben en el encabezado sin volverlo un menú. */
const VISIBLES = 7;

/**
 * Navegación por categorías, debajo del encabezado.
 *
 * Se desplaza de lado en móvil en vez de plegarse en un menú: un menú esconde
 * la única pista que tiene el visitante de qué vende esta tienda.
 *
 * Se ordenan por cuántos productos tienen: primero lo que más se vende.
 */
export function CategoryNav({
  categories,
}: {
  categories: readonly PublicTaxonomy[];
}) {
  const visibles = [...categories]
    .sort(
      (a, b) =>
        b.productCount - a.productCount || a.name.localeCompare(b.name, "es"),
    )
    .slice(0, VISIBLES);

  if (visibles.length === 0) return null;

  return (
    <nav
      aria-label="Categorías"
      className="border-t border-black/5 bg-white/90 backdrop-blur"
    >
      <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 sm:px-4">
        {visibles.map((categoria) => (
          <li key={categoria.slug} className="shrink-0">
            <Link
              href={categoryHref(categoria.slug)}
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium text-[color:var(--brand-fg)]/80 hover:bg-[color:var(--brand-primary)]/5 hover:text-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]"
            >
              {categoria.name}
            </Link>
          </li>
        ))}
        <li className="shrink-0">
          <Link
            href={buildCatalogHref({})}
            className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 text-sm font-semibold text-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary)]/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]"
          >
            Ver todo
          </Link>
        </li>
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: Replace the homepage**

Reemplaza **todo** `apps/web/src/app/tienda/page.tsx` por:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  buildCatalogHref,
  parseCatalogParams,
  type RawSearchParams,
} from "@/features/storefront/catalog-params";
import { ProductShelf } from "@/features/storefront/components/product-shelf";
import { SearchBox } from "@/features/storefront/components/search-box";
import { buildHomeSections } from "@/features/storefront/home-sections";
import {
  serializeJsonLd,
  storeJsonLd,
} from "@/features/storefront/structured-data";
import { loadPublishedCatalog } from "@/server/services/storefront/catalog";
import {
  resolveStorefrontTenant,
  storefrontBaseUrl,
} from "@/server/services/storefront/tenant";

/**
 * Portada de la tienda.
 *
 * Ya no es una rejilla: es una portada con estantes por sección, para que quien
 * llega entienda de un vistazo qué se vende aquí. La rejilla con filtros vive en
 * `/tienda/catalogo`.
 *
 * `searchParams` se lee ANTES de nada a propósito. Si el primer `await` fuera el
 * del negocio, con la tienda apagada la página llamaría a `notFound()` sin haber
 * tocado la barra de dirección, y Next la prerrenderizaría como ruta ESTÁTICA en
 * el build: al encender la tienda seguiría sirviendo ese 404 congelado.
 */

export const metadata: Metadata = {
  title: "Inicio",
  alternates: { canonical: "/tienda" },
};

export default async function TiendaPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;

  // Enlaces viejos —los que ya se compartieron por WhatsApp con `?q=` o
  // `?marca=`— siguen funcionando: se mandan a la rejilla con sus filtros
  // puestos en vez de caer en una portada que los ignora.
  const query = parseCatalogParams(params);
  if (query.q || query.brandSlug || query.categorySlug) {
    redirect(buildCatalogHref(query));
  }

  const tenant = await resolveStorefrontTenant();
  if (!tenant) notFound();

  const { products, categories } = await loadPublishedCatalog(tenant.businessId);
  const secciones = buildHomeSections(products, categories);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(storeJsonLd(tenant, storefrontBaseUrl())),
        }}
      />

      <section className="rounded-3xl bg-gradient-to-br from-[color:var(--brand-primary)]/10 via-white to-[color:var(--brand-accent)]/5 px-6 py-10 sm:px-10 sm:py-14">
        <h1 className="max-w-2xl text-2xl font-bold leading-tight tracking-tight text-[color:var(--brand-fg)] sm:text-4xl">
          {tenant.tagline ??
            "Dermocosmética y cuidado de la piel, con asesoría de nuestro equipo."}
        </h1>
        <p className="mt-3 max-w-xl text-sm text-[color:var(--brand-fg)]/70 sm:text-base">
          Busca por producto o por marca, o baja y mira lo que tenemos por
          categoría.
        </p>
        <SearchBox className="mt-6 max-w-lg" />
      </section>

      {secciones.length > 0 ? (
        <div className="mt-12">
          {secciones.map((seccion, indice) => (
            <ProductShelf
              key={seccion.key}
              section={seccion}
              priority={indice === 0}
            />
          ))}
        </div>
      ) : (
        // La tienda encendida pero sin nada publicado NO es un error: es el
        // estado normal el día antes del lanzamiento.
        <p className="mt-12 rounded-2xl border border-dashed border-black/10 bg-white px-6 py-14 text-center text-sm text-[color:var(--brand-fg)]/60">
          Estamos preparando el catálogo. Vuelve en un rato.
        </p>
      )}

      <p className="mt-14 text-center">
        <Link
          href={buildCatalogHref({})}
          className="inline-flex min-h-12 items-center rounded-xl border border-black/10 bg-white px-6 text-sm font-semibold text-[color:var(--brand-primary)] hover:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]"
        >
          Ver todo el catálogo
        </Link>
      </p>
    </>
  );
}
```

- [ ] **Step 5: Put the search and the categories in the header**

En `apps/web/src/app/tienda/layout.tsx`:

1. Añade los imports:

```ts
import { CategoryNav } from "@/features/storefront/components/category-nav";
import { SearchBox } from "@/features/storefront/components/search-box";
import { loadPublishedCatalog } from "@/server/services/storefront/catalog";
```

2. Después de `const whatsapp = whatsappLink(tenant.whatsappPhone);` añade:

```ts
  // Misma llamada cacheada que usan la portada y el catálogo: `cache()` de React
  // la comparte dentro de la petición, así que el encabezado no cuesta un viaje
  // más a la base.
  const { categories } = await loadPublishedCatalog(tenant.businessId);
```

3. Dentro del `<header>`, después del `</div>` que cierra la fila del logo (línea 105) y antes de `</header>`, añade:

```tsx
        {/* En móvil el buscador baja a su propia fila: en la del logo se
            quedaría en 120 px y nadie escribiría ahí. */}
        <div className="mx-auto max-w-6xl px-4 pb-3 sm:px-6 md:hidden">
          <SearchBox />
        </div>
        <CategoryNav categories={categories} />
```

4. En la fila del logo, entre el `<Link>` del nombre y el botón de WhatsApp, añade:

```tsx
          <SearchBox className="hidden max-w-md flex-1 md:block" />
```

- [ ] **Step 6: Verify the whole thing**

Run: `pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build`
Expected: PASS. El build **no debe** marcar `/tienda` ni `/tienda/catalogo` como estáticas (`○`); deben salir como dinámicas (`ƒ`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/storefront/components/product-shelf.tsx \
        apps/web/src/features/storefront/components/search-box.tsx \
        apps/web/src/features/storefront/components/category-nav.tsx \
        apps/web/src/app/tienda/page.tsx apps/web/src/app/tienda/layout.tsx
git commit -m "feat(tienda): portada con estantes, buscador y categorías"
```

---

### Task 6: La tarjeta, la prueba en caliente y la documentación

**Files:**
- Modify: `apps/web/src/features/storefront/components/product-card.tsx`
- Modify: `package.json` (versión)
- Modify: `CHANGELOG.md`
- Modify: `docs/tienda-en-linea.md`
- Modify: `docs/superpowers/specs/2026-08-04-tienda-fase-3-carrito-cuentas-pedidos-design.md`

- [ ] **Step 1: Give the card room to breathe**

En `apps/web/src/features/storefront/components/product-card.tsx`:

1. La categoría ayuda a orientarse dentro de un estante. Debajo del `<h3>` y antes de `producto.presentation`, añade:

```tsx
        {product.categoryName ? (
          <p className="text-xs text-[color:var(--brand-fg)]/50">
            {product.categoryName}
          </p>
        ) : null}
```

2. El precio manda en una tienda, y con la tarjeta a 176 px dentro de un estante precio y `Badge` en la misma línea se pisan. Sustituye el bloque `<div className="mt-auto flex items-end justify-between gap-2 pt-3">…</div>` entero por:

```tsx
        <div className="mt-auto flex flex-col items-start gap-1.5 pt-3">
          <p className="text-lg font-bold text-[color:var(--brand-fg)]">
            {formatCurrency(product.price)}
          </p>
          {/* Se reutiliza el Badge del ERP: su verde (emerald-700) da 5,5:1
              sobre el fondo claro, mientras que `--brand-success` se queda en
              3,3:1 y no llega a AA en texto pequeño. */}
          <Badge tone={agotado ? "neutral" : "success"}>
            {product.availability.label}
          </Badge>
        </div>
```

- [ ] **Step 2: Test it live**

```bash
pnpm --filter web dev
```

Enciende la tienda **temporalmente** en la base:

```sql
update business_web_settings set storefront_enabled = true
where business_id = (select business_id from business_web_settings limit 1);
```

Recorre y comprueba, a 390 px y a 1280 px:
1. `/tienda` — portada con estantes, buscador visible, categorías en el encabezado.
2. El buscador lleva a `/tienda/catalogo?q=…`.
3. `/tienda?marca=avene` **redirige** a `/tienda/catalogo?marca=avene`.
4. `/tienda/categoria/<slug>` — H1 con el nombre de la categoría y sus productos.
5. Una ficha — los recomendados son de la **misma categoría**.
6. `/sitemap.xml` — aparecen `/tienda/catalogo` y las categorías.
7. Ningún estante enseña "Agotado" ni marcador sin foto.

**Devuelve la tienda al estado seguro** (esto es obligatorio, no opcional):

```sql
update business_web_settings set storefront_enabled = false;
```

- [ ] **Step 3: Bump version and document**

1. `package.json` → `"version": "0.114.0"`.
2. `CHANGELOG.md` → entrada `## [0.114.0] - 2026-08-04` bajo `[Unreleased]`, describiendo la portada, `/tienda/catalogo`, las categorías con página propia y los recomendados por categoría.
3. `docs/tienda-en-linea.md` → en §4, añade la fila `| F3.0 | Portada, categorías navegables y recomendados | **Hecho** |`, y en el estado de cabecera menciona que la Fase 3 está en marcha con F3.0 entregada.
4. En el spec de la Fase 3, §4.2: cambia la prelación para decir que `related_product_ids` **existe en la base pero ningún código lo escribe**, así que la capa manual espera a que el administrador lo edite; hoy la recomendación es automática.

- [ ] **Step 4: Final verification**

Run: `pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(tienda): F3.0 — la cara de la tienda (v0.114.0)"
```

---

## Verificación final del plan

- **La tienda sigue apagada.** El único paso que la enciende (Task 6 Step 2) la apaga en el mismo paso.
- **Cero migraciones.** Ninguna tarea toca la base.
- **Enlaces viejos vivos.** `/tienda?q=…` redirige en vez de romperse.
- **La trampa del prerender estático** está cubierta en las tres rutas que leen `searchParams`.
- **F3.1 (carrito)** engancha después en la tarjeta y en la ficha sin rehacer nada de esto.
