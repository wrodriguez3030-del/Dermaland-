# Tienda F3.1 — el carrito

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el cliente pueda juntar varios productos y pedirlos de una vez, eligiendo en qué sucursal los retira, en vez de escribir un WhatsApp por cada producto.

**Architecture:** El navegador guarda **solo `slug` y cantidad**; los precios y la disponibilidad los pone SIEMPRE el servidor, a través de `POST /api/storefront/cart`, que resuelve contra el mismo catálogo cacheado que sirve las páginas. Toda la lógica —parseo defensivo de lo que haya en `localStorage`, cantidades, totales y el mensaje de WhatsApp— vive en funciones puras probadas. Cero tablas nuevas: el pedido de verdad llega en F3.3.

**Tech Stack:** Next.js 15.5.18 (App Router) · React 19 · TypeScript estricto · Tailwind 4 · Zod · Vitest · pnpm.

## Global Constraints

- **La tienda sigue APAGADA.** Ningún paso la enciende. Se prueba en local encendiéndola temporalmente y **devolviéndola siempre al estado seguro**.
- **Cero cambios en la base.** Ni migraciones, ni columnas, ni políticas. Sin tablas de pedido: eso es F3.3.
- **Entrega: SOLO RETIRO EN SUCURSAL** (decisión del dueño, 2026-08-04). Sin direcciones, sin zonas, sin coste de envío.
- **El precio lo pone el servidor, siempre.** El navegador no guarda precios y, si los guardara, se descartan al parsear. Hay una prueba que lo comprueba.
- **`NEXT_PUBLIC_` jamás para secretos.** Aquí no hace falta ninguno: la ruta es pública y solo lee catálogo ya publicado.
- **Hidratación segura** (`CLAUDE.md` regla 6): todo lo que lea `localStorage` usa el patrón `mounted`. Servidor y primer render de cliente devuelven el mismo HTML.
- **Contraste AA:** texto pequeño con `--brand-primary`. Nunca `--brand-accent` ni `--brand-success` en texto pequeño. Disponibilidad con el `Badge` del ERP.
- **Táctil ≥ 44 px** (`min-h-11`) en todo lo pulsable.
- **`components/ui/` se consume, no se modifica.**
- **No se toca el POS** ni sus motores (`cart-line.ts`, `pricing.ts`, `emit_sale_atomic`). El carrito de la tienda es OTRO motor: el del POS tiene descuento global, sesión de caja y reglas documentales que la web no tiene.
- Los precios de `PublicProduct` ya llevan **ITBIS incluido** (igual que el POS). El carrito **no desglosa impuestos**: `PublicProduct` no trae tasa, e inventarla sería mentir.
- Comandos: `pnpm --filter web test <patrón>` · `pnpm --filter web typecheck` · `pnpm --filter web build` · `pnpm --filter web dev` (puerto 3031).

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `features/storefront/cart.ts` | Motor puro: parseo defensivo, altas/bajas, cantidades, resolución contra catálogo y totales. |
| `features/storefront/cart.test.ts` | Sus pruebas. |
| `features/storefront/cart-message.ts` | Función pura que arma el WhatsApp del pedido completo. |
| `features/storefront/cart-message.test.ts` | Sus pruebas. |
| `features/storefront/cart-storage.ts` | Leer/escribir `localStorage`. Único sitio que lo toca. |
| `features/storefront/components/cart-provider.tsx` | Contexto de React con el carrito. `"use client"`. |
| `features/storefront/components/cart-badge.tsx` | Contador del encabezado. `"use client"`. |
| `features/storefront/components/add-to-cart-button.tsx` | Botón de la ficha. `"use client"`. |
| `features/storefront/components/cart-view.tsx` | La pantalla del carrito. `"use client"`. |
| `app/api/storefront/cart/route.ts` | `POST` público: resuelve slugs y devuelve precios y totales. |
| `app/tienda/carrito/page.tsx` | Envoltorio servidor del carrito (`noindex`). |

**Se modifican:**

| Archivo | Cambio |
|---|---|
| `middleware.ts` | Añade `/api/storefront/cart` a `PUBLIC_PATHS`. |
| `middleware.test.ts` | Prueba en los DOS sentidos: pasa el carrito, **no** pasan `settings` ni `products`. |
| `app/tienda/layout.tsx` | Envuelve en `CartProvider` y pone el contador en el encabezado. |
| `app/tienda/producto/[slug]/page.tsx` | Botón "Agregar al carrito" junto al de WhatsApp. |

**No se toca:** `catalog.ts`, `tenant.ts`, `public-product.ts`, `publishability.ts`, `catalog-query.ts`, `home-sections.ts`, `recommendations.ts`.

---

### Task 1: El motor del carrito

Lo que llega de `localStorage` lo escribió un desconocido —o el propio cliente con la consola abierta—. Se parsea como si fuera hostil.

**Files:**
- Create: `apps/web/src/features/storefront/cart.ts`
- Test: `apps/web/src/features/storefront/cart.test.ts`

**Interfaces:**
- Consumes: `PublicProduct` de `features/storefront/types`.
- Produces: `CartItem { slug: string; qty: number }`, `CartLine { product: PublicProduct; qty: number; lineTotal: number }`, `CartSummary { lines: CartLine[]; itemCount: number; total: number; dropped: DroppedLine[] }`, `DroppedLine { slug: string; reason: string }`, y las funciones `parseCartItems`, `addItem`, `setItemQty`, `removeItem`, `cartItemCount`, `buildCartSummary`, más `MAX_QTY_PER_LINE` y `MAX_LINES`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/storefront/cart.test.ts
import { describe, expect, it } from "vitest";
import {
  addItem,
  buildCartSummary,
  cartItemCount,
  MAX_LINES,
  MAX_QTY_PER_LINE,
  parseCartItems,
  removeItem,
  setItemQty,
} from "./cart";
import type { PublicProduct } from "./types";

function producto(
  over: Partial<PublicProduct> & { slug: string },
): PublicProduct {
  return {
    title: over.slug.toUpperCase(),
    benefits: [],
    price: 100,
    imageUrl:
      "https://x.supabase.co/storage/v1/object/public/product-images/a.jpg",
    availability: { status: "in_stock", label: "Disponible" },
    featured: false,
    isNew: false,
    ...over,
  };
}

describe("parseCartItems", () => {
  it("no revienta con nada de lo que puede haber en localStorage", () => {
    // Un enlace viejo, otra versión del sitio, o alguien jugando con la consola.
    expect(parseCartItems(null)).toEqual([]);
    expect(parseCartItems(undefined)).toEqual([]);
    expect(parseCartItems("no soy json")).toEqual([]);
    expect(parseCartItems('{"a":1}')).toEqual([]);
    expect(parseCartItems("[1,2,3]")).toEqual([]);
    expect(parseCartItems([{ qty: 2 }])).toEqual([]);
    expect(parseCartItems([{ slug: "", qty: 2 }])).toEqual([]);
    expect(parseCartItems([{ slug: 5, qty: 2 }])).toEqual([]);
  });

  it("acepta tanto la cadena guardada como el objeto ya parseado", () => {
    expect(parseCartItems('[{"slug":"a","qty":2}]')).toEqual([
      { slug: "a", qty: 2 },
    ]);
    expect(parseCartItems([{ slug: "a", qty: 2 }])).toEqual([
      { slug: "a", qty: 2 },
    ]);
  });

  it("TIRA cualquier precio que venga guardado: el precio es del servidor", () => {
    // Si el precio viajara en localStorage, cambiarlo con la consola sería
    // cambiar lo que se cobra. Solo sobreviven `slug` y `qty`.
    expect(
      parseCartItems([{ slug: "a", qty: 1, price: 1, total: 1 }]),
    ).toEqual([{ slug: "a", qty: 1 }]);
  });

  it("recorta cantidades absurdas en vez de aceptarlas", () => {
    expect(parseCartItems([{ slug: "a", qty: 999999 }])).toEqual([
      { slug: "a", qty: MAX_QTY_PER_LINE },
    ]);
    expect(parseCartItems([{ slug: "a", qty: -3 }])).toEqual([]);
    expect(parseCartItems([{ slug: "a", qty: 0 }])).toEqual([]);
    expect(parseCartItems([{ slug: "a", qty: 2.7 }])).toEqual([
      { slug: "a", qty: 2 },
    ]);
  });

  it("fusiona líneas repetidas del mismo producto", () => {
    expect(
      parseCartItems([
        { slug: "a", qty: 2 },
        { slug: "a", qty: 3 },
      ]),
    ).toEqual([{ slug: "a", qty: 5 }]);
  });

  it("pone tope al número de líneas: un carrito fabricado no revienta la página", () => {
    const enorme = Array.from({ length: MAX_LINES + 20 }, (_, i) => ({
      slug: `p${i}`,
      qty: 1,
    }));
    expect(parseCartItems(enorme)).toHaveLength(MAX_LINES);
  });
});

describe("addItem / setItemQty / removeItem", () => {
  it("agregar dos veces suma en la misma línea", () => {
    let items = addItem([], "a");
    items = addItem(items, "a", 2);
    expect(items).toEqual([{ slug: "a", qty: 3 }]);
  });

  it("agregar respeta el tope por línea", () => {
    expect(addItem([{ slug: "a", qty: MAX_QTY_PER_LINE }], "a", 5)).toEqual([
      { slug: "a", qty: MAX_QTY_PER_LINE },
    ]);
  });

  it("conserva el orden en que se fueron agregando", () => {
    const items = addItem(addItem(addItem([], "a"), "b"), "c");
    expect(items.map((i) => i.slug)).toEqual(["a", "b", "c"]);
  });

  it("poner cantidad 0 quita la línea", () => {
    expect(setItemQty([{ slug: "a", qty: 3 }], "a", 0)).toEqual([]);
  });

  it("quitar lo que no está no cambia nada", () => {
    const items = [{ slug: "a", qty: 1 }];
    expect(removeItem(items, "zzz")).toEqual(items);
  });

  it("cuenta unidades, no líneas", () => {
    expect(
      cartItemCount([
        { slug: "a", qty: 2 },
        { slug: "b", qty: 3 },
      ]),
    ).toBe(5);
  });
});

describe("buildCartSummary", () => {
  const CATALOGO = [
    producto({ slug: "a", title: "Crema A", price: 1500 }),
    producto({ slug: "b", title: "Serum B", price: 2000.5 }),
    producto({
      slug: "agotado",
      availability: { status: "out_of_stock", label: "Agotado" },
    }),
  ];

  it("el precio sale del CATÁLOGO, nunca del navegador", () => {
    const resumen = buildCartSummary([{ slug: "a", qty: 2 }], CATALOGO);
    expect(resumen.lines[0]?.product.price).toBe(1500);
    expect(resumen.lines[0]?.lineTotal).toBe(3000);
    expect(resumen.total).toBe(3000);
  });

  it("suma varias líneas y redondea a dos decimales", () => {
    const resumen = buildCartSummary(
      [
        { slug: "a", qty: 1 },
        { slug: "b", qty: 3 },
      ],
      CATALOGO,
    );
    expect(resumen.total).toBe(7501.5);
    expect(resumen.itemCount).toBe(4);
  });

  it("saca lo que ya no se publica y dice por qué", () => {
    const resumen = buildCartSummary([{ slug: "fantasma", qty: 1 }], CATALOGO);
    expect(resumen.lines).toEqual([]);
    expect(resumen.dropped).toEqual([
      { slug: "fantasma", reason: "Ya no está disponible" },
    ]);
  });

  it("saca lo agotado: no se puede pedir lo que no hay", () => {
    const resumen = buildCartSummary([{ slug: "agotado", qty: 1 }], CATALOGO);
    expect(resumen.lines).toEqual([]);
    expect(resumen.dropped[0]?.reason).toBe("Se agotó");
  });

  it("un carrito vacío da un resumen vacío, no un error", () => {
    expect(buildCartSummary([], CATALOGO)).toEqual({
      lines: [],
      itemCount: 0,
      total: 0,
      dropped: [],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/features/storefront/cart.test.ts`
Expected: FAIL — `Failed to resolve import "./cart"`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/features/storefront/cart.ts
// El carrito de la tienda.
//
// Regla que gobierna este archivo: **el navegador guarda QUÉ, el servidor pone
// CUÁNTO**. En `localStorage` solo viven `slug` y cantidad. Si el precio viajara
// ahí, cambiarlo con la consola del navegador sería cambiar lo que se cobra.
//
// Y todo lo que entra por `parseCartItems` se trata como hostil: puede venir de
// una versión anterior del sitio, de otra pestaña, o de alguien jugando. Nada de
// eso debe romper la página ni colarse en una consulta.
//
// Esto NO es el motor del POS. El del POS tiene descuento global, sesión de caja
// y reglas documentales que la web no tiene; compartirlos acoplaría dos cosas
// que evolucionan por separado.

import type { PublicProduct } from "./types";

/** Nadie compra 300 unidades de una crema por internet: es un dedo pegado. */
export const MAX_QTY_PER_LINE = 20;

/** Tope de líneas distintas. Un carrito fabricado no debe reventar la página. */
export const MAX_LINES = 50;

/** Lo ÚNICO que se guarda en el navegador. */
export interface CartItem {
  slug: string;
  qty: number;
}

export interface CartLine {
  product: PublicProduct;
  qty: number;
  /** Precio del catálogo × cantidad. Con ITBIS incluido, como el POS. */
  lineTotal: number;
}

export interface DroppedLine {
  slug: string;
  /** Frase que se le enseña al cliente, no un código. */
  reason: string;
}

export interface CartSummary {
  lines: CartLine[];
  /** Unidades, no líneas: es lo que va en el contador del encabezado. */
  itemCount: number;
  total: number;
  dropped: DroppedLine[];
}

/** Dos decimales. Sumar flotantes deja 7501.499999999999 sin esto. */
function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function limpiarCantidad(valor: unknown): number {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_QTY_PER_LINE, Math.max(0, Math.trunc(n)));
}

/**
 * Convierte lo que hubiera guardado en algo utilizable. Nunca lanza.
 *
 * Acepta la cadena tal cual salió de `localStorage` o el objeto ya parseado,
 * para poder probarlo sin navegador.
 */
export function parseCartItems(raw: unknown): CartItem[] {
  let datos: unknown = raw;
  if (typeof raw === "string") {
    try {
      datos = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(datos)) return [];

  // `Map` y no `filter`: fusiona repetidos conservando el orden de aparición.
  const porSlug = new Map<string, number>();
  for (const entrada of datos) {
    if (typeof entrada !== "object" || entrada === null) continue;
    const { slug, qty } = entrada as { slug?: unknown; qty?: unknown };
    if (typeof slug !== "string" || !slug.trim()) continue;
    const cantidad = limpiarCantidad(qty);
    if (cantidad === 0) continue;
    const clave = slug.trim();
    porSlug.set(
      clave,
      Math.min(MAX_QTY_PER_LINE, (porSlug.get(clave) ?? 0) + cantidad),
    );
    if (porSlug.size >= MAX_LINES) break;
  }

  return [...porSlug].map(([slug, qty]) => ({ slug, qty }));
}

export function addItem(
  items: readonly CartItem[],
  slug: string,
  qty = 1,
): CartItem[] {
  return parseCartItems([...items, { slug, qty }]);
}

export function setItemQty(
  items: readonly CartItem[],
  slug: string,
  qty: number,
): CartItem[] {
  return parseCartItems(
    items.map((i) => (i.slug === slug ? { slug, qty } : i)),
  );
}

export function removeItem(
  items: readonly CartItem[],
  slug: string,
): CartItem[] {
  return items.filter((i) => i.slug !== slug);
}

export function cartItemCount(items: readonly CartItem[]): number {
  return items.reduce((suma, i) => suma + i.qty, 0);
}

/**
 * Resuelve el carrito contra el catálogo publicado.
 *
 * Aquí es donde el precio deja de ser del cliente y pasa a ser del negocio. Se
 * llama en el SERVIDOR (ruta `/api/storefront/cart`); el navegador nunca calcula
 * un total que después se cobre.
 */
export function buildCartSummary(
  items: readonly CartItem[],
  catalog: readonly PublicProduct[],
): CartSummary {
  const porSlug = new Map(catalog.map((p) => [p.slug, p]));
  const lines: CartLine[] = [];
  const dropped: DroppedLine[] = [];

  for (const item of items) {
    const producto = porSlug.get(item.slug);
    if (!producto) {
      // Se despublicó, se le quitó la foto o le cambiaron el nombre: para la
      // tienda ese producto ya no existe.
      dropped.push({ slug: item.slug, reason: "Ya no está disponible" });
      continue;
    }
    if (producto.availability.status === "out_of_stock") {
      dropped.push({ slug: item.slug, reason: "Se agotó" });
      continue;
    }
    lines.push({
      product: producto,
      qty: item.qty,
      lineTotal: redondear(producto.price * item.qty),
    });
  }

  return {
    lines,
    itemCount: lines.reduce((suma, l) => suma + l.qty, 0),
    total: redondear(lines.reduce((suma, l) => suma + l.lineTotal, 0)),
    dropped,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/features/storefront/cart.test.ts`
Expected: PASS — 17 pruebas.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/storefront/cart.ts apps/web/src/features/storefront/cart.test.ts
git commit -m "feat(tienda): motor del carrito (el precio es del servidor)"
```

---

### Task 2: El mensaje de WhatsApp del pedido

Mientras no exista el pedido de verdad (F3.3), el carrito cierra por WhatsApp — igual que hoy cierra la ficha, pero con todo junto y con la sucursal de retiro escrita.

**Files:**
- Create: `apps/web/src/features/storefront/cart-message.ts`
- Test: `apps/web/src/features/storefront/cart-message.test.ts`

**Interfaces:**
- Consumes: `CartSummary` de `./cart`, `PublicBranch` de `./types`.
- Produces: `cartInquiryMessage({ summary, branch, baseUrl }): string`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/storefront/cart-message.test.ts
import { describe, expect, it } from "vitest";
import { cartInquiryMessage } from "./cart-message";
import type { CartSummary } from "./cart";
import type { PublicBranch, PublicProduct } from "./types";

function producto(slug: string, title: string, price: number): PublicProduct {
  return {
    slug,
    title,
    benefits: [],
    price,
    imageUrl: null,
    availability: { status: "in_stock", label: "Disponible" },
    featured: false,
    isNew: false,
  };
}

const RESUMEN: CartSummary = {
  lines: [
    { product: producto("a", "Crema A", 1500), qty: 2, lineTotal: 3000 },
    { product: producto("b", "Serum B", 2000), qty: 1, lineTotal: 2000 },
  ],
  itemCount: 3,
  total: 5000,
  dropped: [],
};

const SUCURSAL: PublicBranch = { slug: "cutis", name: "Cutis" };
const BASE = "https://dermaland.vercel.app";

describe("cartInquiryMessage", () => {
  it("lista cada producto con su cantidad y su importe", () => {
    const texto = cartInquiryMessage({
      summary: RESUMEN,
      branch: SUCURSAL,
      baseUrl: BASE,
    });
    expect(texto).toContain("2 × Crema A");
    expect(texto).toContain("1 × Serum B");
    expect(texto).toContain("RD$3,000.00");
  });

  it("dice el total una sola vez y con formato dominicano", () => {
    const texto = cartInquiryMessage({
      summary: RESUMEN,
      branch: SUCURSAL,
      baseUrl: BASE,
    });
    expect(texto).toContain("Total: RD$5,000.00");
  });

  it("nombra la sucursal de retiro: no hay envío a domicilio", () => {
    const texto = cartInquiryMessage({
      summary: RESUMEN,
      branch: SUCURSAL,
      baseUrl: BASE,
    });
    expect(texto).toContain("retirar en Cutis");
  });

  it("sin sucursal elegida no inventa una", () => {
    const texto = cartInquiryMessage({
      summary: RESUMEN,
      branch: undefined,
      baseUrl: BASE,
    });
    expect(texto).not.toContain("retirar en");
    expect(texto).toContain("Total: RD$5,000.00");
  });

  it("incluye el enlace de cada ficha para que el vendedor sepa cuál es", () => {
    // Dos productos pueden llamarse casi igual; el enlace no deja lugar a dudas.
    const texto = cartInquiryMessage({
      summary: RESUMEN,
      branch: SUCURSAL,
      baseUrl: BASE,
    });
    expect(texto).toContain(`${BASE}/tienda/producto/a`);
  });

  it("un carrito vacío no produce un mensaje a medias", () => {
    const vacio: CartSummary = {
      lines: [],
      itemCount: 0,
      total: 0,
      dropped: [],
    };
    expect(
      cartInquiryMessage({ summary: vacio, branch: SUCURSAL, baseUrl: BASE }),
    ).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/features/storefront/cart-message.test.ts`
Expected: FAIL — `Failed to resolve import "./cart-message"`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/features/storefront/cart-message.ts
// El WhatsApp con el que el cliente manda su pedido.
//
// Mientras no exista el pedido de verdad (F3.3), este mensaje ES la venta: si
// sale mal —sin importes, sin enlaces, con el total de otro carrito— el
// vendedor no tiene forma de saberlo y la venta se pierde en silencio. Por eso
// es una función pura y probada, igual que `productInquiryMessage`.

import { formatCurrency } from "@/lib/utils/format";
import type { CartSummary } from "./cart";
import type { PublicBranch } from "./types";

export function cartInquiryMessage({
  summary,
  branch,
  baseUrl,
}: {
  summary: CartSummary;
  /** Sucursal de retiro. No hay envío a domicilio. */
  branch: PublicBranch | undefined;
  baseUrl: string;
}): string {
  // Un carrito vacío devuelve cadena vacía para que quien llama pueda NO pintar
  // el botón, en vez de abrir WhatsApp con un pedido en blanco.
  if (summary.lines.length === 0) return "";

  const encabezado = branch
    ? `Hola, quiero hacer este pedido para retirar en ${branch.name}:`
    : "Hola, quiero hacer este pedido:";

  const lineas = summary.lines.map(
    (l) =>
      `• ${l.qty} × ${l.product.title} — ${formatCurrency(l.lineTotal)}\n  ${baseUrl}/tienda/producto/${l.product.slug}`,
  );

  return [
    encabezado,
    "",
    ...lineas,
    "",
    `Total: ${formatCurrency(summary.total)}`,
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/features/storefront/cart-message.test.ts`
Expected: PASS — 6 pruebas.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/storefront/cart-message.ts apps/web/src/features/storefront/cart-message.test.ts
git commit -m "feat(tienda): mensaje de WhatsApp con el pedido completo"
```

---

### Task 3: La ruta pública que pone los precios

**Esta es la tarea sensible del incremento.** Se abre una ruta de API a internet, y `PUBLIC_PATHS` es la frontera entre lo que ve cualquiera y lo que exige sesión y 2FA. Un error aquí no falla ruidosamente: abre una puerta en silencio. Por eso las pruebas van **en los dos sentidos**.

**Files:**
- Create: `apps/web/src/app/api/storefront/cart/route.ts`
- Modify: `apps/web/src/middleware.ts`
- Modify: `apps/web/src/middleware.test.ts`

**Interfaces:**
- Consumes: `buildCartSummary`, `parseCartItems`, `MAX_LINES` (Task 1); `resolveStorefrontTenant`, `loadPublishedCatalog`.
- Produces: `POST /api/storefront/cart` con cuerpo `{ items: [{ slug, qty }] }` que devuelve `CartSummary` en JSON.

- [ ] **Step 1: Write the failing test**

En `apps/web/src/middleware.test.ts`, añade `"/api/storefront/cart"` al primer `it.each` (el de rutas que pasan), con este comentario encima:

```ts
    // Carrito: el navegador manda slugs y el SERVIDOR devuelve los precios.
    // No usa sesión y solo lee catálogo ya publicado.
    "/api/storefront/cart",
```

Y al segundo `it.each` (el de rutas que NO pasan), añade:

```ts
    // El resto de /api/storefront es ADMINISTRACIÓN y exige sesión: la entrada
    // pública es la ruta EXACTA del carrito, no el prefijo (DL-07).
    "/api/storefront/settings",
    "/api/storefront/products",
    "/api/storefront/products/9f0c2f5e-1111-2222-3333-444455556666",
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/middleware.test.ts`
Expected: FAIL — `deja pasar /api/storefront/cart` recibe `false`.

- [ ] **Step 3: Open exactly that path**

En `apps/web/src/middleware.ts`, dentro de `PUBLIC_PATHS`, justo debajo de la entrada `"/sitemap.xml"`:

```ts
  // Carrito de la tienda: el navegador guarda slugs y esta ruta devuelve los
  // precios. Es la ÚNICA entrada pública bajo `/api/storefront`; `settings` y
  // `products` son administración y siguen exigiendo sesión y 2FA. Por el match
  // por segmento (DL-07), esta entrada NO los cubre.
  "/api/storefront/cart",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/middleware.test.ts`
Expected: PASS — todas las rutas, en los dos sentidos.

- [ ] **Step 5: Write the route**

```ts
// apps/web/src/app/api/storefront/cart/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildCartSummary,
  MAX_LINES,
  MAX_QTY_PER_LINE,
  parseCartItems,
} from "@/features/storefront/cart";
import { loadPublishedCatalog } from "@/server/services/storefront/catalog";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";

/**
 * Resuelve un carrito: el navegador manda QUÉ y esta ruta responde CUÁNTO.
 *
 * Es pública a propósito —la tienda no tiene sesión— y por eso está acotada al
 * mínimo: solo lee el catálogo YA publicado (el mismo cacheado que sirve las
 * páginas), no escribe nada, no toca clientes ni ventas, y con la tienda apagada
 * devuelve 404 igual que el resto de `/tienda`.
 *
 * El cuerpo lo escribe un desconocido: el esquema pone tope al número de líneas
 * y a la cantidad por línea antes de que nada llegue al motor.
 */

const CuerpoSchema = z.object({
  items: z
    .array(
      z.object({
        slug: z.string().min(1).max(200),
        qty: z.number().int().min(1).max(MAX_QTY_PER_LINE),
      }),
    )
    .max(MAX_LINES),
});

export async function POST(request: Request) {
  const tenant = await resolveStorefrontTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Tienda no disponible" }, { status: 404 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const parseado = CuerpoSchema.safeParse(cuerpo);
  if (!parseado.success) {
    return NextResponse.json({ error: "Carrito inválido" }, { status: 422 });
  }

  const { products } = await loadPublishedCatalog(tenant.businessId);
  // Se vuelve a pasar por `parseCartItems` aunque zod ya validó: es el mismo
  // saneado que aplica el navegador (fusiona repetidos, recorta topes), y así
  // el total no depende de por dónde entró el carrito.
  const summary = buildCartSummary(parseCartItems(parseado.data.items), products);

  return NextResponse.json(summary, {
    // Precio y disponibilidad cambian; que un intermediario cachee este cuerpo
    // sería servirle a un cliente el carrito de otro momento.
    headers: { "Cache-Control": "no-store" },
  });
}
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter web typecheck && pnpm --filter web test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api/storefront/cart apps/web/src/middleware.ts apps/web/src/middleware.test.ts
git commit -m "feat(tienda): ruta pública que resuelve el carrito con precios de servidor"
```

---

### Task 4: El carrito en el navegador

**Files:**
- Create: `apps/web/src/features/storefront/cart-storage.ts`
- Create: `apps/web/src/features/storefront/components/cart-provider.tsx`
- Create: `apps/web/src/features/storefront/components/cart-badge.tsx`
- Modify: `apps/web/src/app/tienda/layout.tsx`

**Interfaces:**
- Consumes: `CartItem`, `parseCartItems`, `addItem`, `setItemQty`, `removeItem`, `cartItemCount` (Task 1).
- Produces: `readCart()`, `writeCart(items)`, `CART_STORAGE_KEY`; `<CartProvider>`; `useCart(): { items, itemCount, mounted, add, setQty, remove, clear }`; `<CartBadge>`.

- [ ] **Step 1: Write the storage layer**

```ts
// apps/web/src/features/storefront/cart-storage.ts
// Único sitio que toca `localStorage`.
//
// Aislado para que el resto del carrito se pueda probar sin navegador, y para
// que los `try/catch` estén en un solo lugar: `localStorage` lanza en modo
// privado de Safari y cuando el usuario bloquea el almacenamiento. Un carrito
// que no se puede guardar es una molestia; una tienda que explota al cargar, no.

import { parseCartItems, type CartItem } from "./cart";

/** Con versión en la clave: cambiar el formato mañana no rompe carritos viejos. */
export const CART_STORAGE_KEY = "dermaland.tienda.carrito.v1";

/** Avisa a las demás pestañas y componentes del mismo documento. */
export const CART_CHANGED_EVENT = "dermaland:carrito";

export function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    return parseCartItems(window.localStorage.getItem(CART_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function writeCart(items: readonly CartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Sin almacenamiento el carrito vive solo en memoria hasta recargar. Es
    // peor que guardarlo, pero mucho mejor que romper la página.
  }
  window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT));
}
```

- [ ] **Step 2: Write the provider**

```tsx
// apps/web/src/features/storefront/components/cart-provider.tsx
"use client";

import * as React from "react";
import {
  addItem,
  cartItemCount,
  removeItem,
  setItemQty,
  type CartItem,
} from "../cart";
import {
  CART_CHANGED_EVENT,
  CART_STORAGE_KEY,
  readCart,
  writeCart,
} from "../cart-storage";

/**
 * El carrito, compartido por el encabezado, la ficha y la pantalla del carrito.
 *
 * `mounted` no es un detalle: el servidor no puede saber qué hay en el
 * `localStorage` de nadie, así que el primer render de cliente TIENE que
 * coincidir con el del servidor (regla 6 de `CLAUDE.md`). Los consumidores no
 * pintan nada que dependa del carrito hasta que `mounted` sea `true`.
 */

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  mounted: boolean;
  add: (slug: string, qty?: number) => void;
  setQty: (slug: string, qty: number) => void;
  remove: (slug: string) => void;
  clear: () => void;
}

const CartContext = React.createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<CartItem[]>([]);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setItems(readCart());
    setMounted(true);

    // Dos pestañas abiertas son lo normal cuando alguien compara productos: sin
    // esto, agregar en una y mirar el carrito en la otra enseñaría datos viejos.
    const sincronizar = () => setItems(readCart());
    window.addEventListener(CART_CHANGED_EVENT, sincronizar);
    const desdeOtraPestaña = (e: StorageEvent) => {
      if (e.key === CART_STORAGE_KEY) sincronizar();
    };
    window.addEventListener("storage", desdeOtraPestaña);
    return () => {
      window.removeEventListener(CART_CHANGED_EVENT, sincronizar);
      window.removeEventListener("storage", desdeOtraPestaña);
    };
  }, []);

  const aplicar = React.useCallback((siguiente: CartItem[]) => {
    setItems(siguiente);
    writeCart(siguiente);
  }, []);

  const valor = React.useMemo<CartContextValue>(
    () => ({
      items,
      itemCount: cartItemCount(items),
      mounted,
      add: (slug, qty = 1) => aplicar(addItem(items, slug, qty)),
      setQty: (slug, qty) => aplicar(setItemQty(items, slug, qty)),
      remove: (slug) => aplicar(removeItem(items, slug)),
      clear: () => aplicar([]),
    }),
    [items, mounted, aplicar],
  );

  return <CartContext.Provider value={valor}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = React.useContext(CartContext);
  if (!ctx) throw new Error("useCart necesita estar dentro de <CartProvider>");
  return ctx;
}
```

- [ ] **Step 3: Write the badge**

```tsx
// apps/web/src/features/storefront/components/cart-badge.tsx
"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCart } from "./cart-provider";

/**
 * Contador del encabezado.
 *
 * Hasta que `mounted` sea `true` no se pinta el número: el servidor no sabe qué
 * hay en el `localStorage` del visitante, y pintar un 0 que enseguida salta a 3
 * es exactamente el parpadeo que la regla de hidratación evita.
 */
export function CartBadge() {
  const { itemCount, mounted } = useCart();

  return (
    <Link
      href="/tienda/carrito"
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[color:var(--brand-fg)] transition-colors hover:bg-[color:var(--brand-primary)]/5 hover:text-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]"
    >
      <ShoppingBag aria-hidden className="h-5 w-5" />
      <span className="sr-only">
        {mounted && itemCount > 0
          ? `Carrito, ${itemCount} ${itemCount === 1 ? "artículo" : "artículos"}`
          : "Carrito"}
      </span>
      {mounted && itemCount > 0 ? (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--brand-primary)] px-1 text-xs font-bold text-white"
        >
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      ) : null}
    </Link>
  );
}
```

- [ ] **Step 4: Wire it into the layout**

En `apps/web/src/app/tienda/layout.tsx`:

1. Añade los imports:

```ts
import { CartBadge } from "@/features/storefront/components/cart-badge";
import { CartProvider } from "@/features/storefront/components/cart-provider";
```

2. Envuelve el `<div className="flex min-h-screen flex-col …">` entero en `<CartProvider>…</CartProvider>`.

3. En la fila del logo, justo ANTES del bloque `{whatsapp ? (`, añade:

```tsx
          <CartBadge />
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build`
Expected: PASS. Las rutas de `/tienda` deben seguir saliendo dinámicas (`ƒ`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/storefront/cart-storage.ts \
        apps/web/src/features/storefront/components/cart-provider.tsx \
        apps/web/src/features/storefront/components/cart-badge.tsx \
        apps/web/src/app/tienda/layout.tsx
git commit -m "feat(tienda): estado del carrito en el navegador y contador en el encabezado"
```

---

### Task 5: Agregar al carrito y la pantalla del carrito

**Files:**
- Create: `apps/web/src/features/storefront/components/add-to-cart-button.tsx`
- Create: `apps/web/src/features/storefront/components/cart-view.tsx`
- Create: `apps/web/src/app/tienda/carrito/page.tsx`
- Modify: `apps/web/src/app/tienda/producto/[slug]/page.tsx`

**Interfaces:**
- Consumes: `useCart` (Task 4), `CartSummary` (Task 1), `cartInquiryMessage` (Task 2), `whatsappLink`, `POST /api/storefront/cart` (Task 3).
- Produces: `<AddToCartButton slug disabled?>`, `<CartView branches whatsappPhone baseUrl>`.

- [ ] **Step 1: Write the add button**

```tsx
// apps/web/src/features/storefront/components/add-to-cart-button.tsx
"use client";

import * as React from "react";
import { Check, ShoppingBag } from "lucide-react";
import { useCart } from "./cart-provider";

/**
 * "Agregar al carrito" de la ficha.
 *
 * Confirma en el propio botón durante unos segundos en vez de abrir un aviso:
 * el cliente ya está mirando ahí, y un cartel flotante en móvil taparía el
 * precio. El texto cambia además del icono — "hecho" en verde y nada más sería
 * invisible para quien no distingue ese verde.
 */
export function AddToCartButton({
  slug,
  disabled = false,
}: {
  slug: string;
  disabled?: boolean;
}) {
  const { add, mounted } = useCart();
  const [confirmado, setConfirmado] = React.useState(false);

  React.useEffect(() => {
    if (!confirmado) return;
    const t = window.setTimeout(() => setConfirmado(false), 2500);
    return () => window.clearTimeout(t);
  }, [confirmado]);

  return (
    <button
      type="button"
      // Deshabilitado hasta montar: sin `localStorage` todavía leído, pulsar
      // agregaría sobre un carrito vacío y borraría lo que ya había.
      disabled={disabled || !mounted}
      onClick={() => {
        add(slug);
        setConfirmado(true);
      }}
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-6 text-base font-semibold text-white transition-colors hover:bg-[color:var(--brand-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--brand-accent)] disabled:opacity-50 sm:w-auto"
    >
      {confirmado ? (
        <>
          <Check aria-hidden className="h-5 w-5" />
          Agregado al carrito
        </>
      ) : (
        <>
          <ShoppingBag aria-hidden className="h-5 w-5" />
          Agregar al carrito
        </>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Put it on the ficha**

En `apps/web/src/app/tienda/producto/[slug]/page.tsx`:

1. Añade el import:

```ts
import { AddToCartButton } from "@/features/storefront/components/add-to-cart-button";
```

2. Sustituye el bloque `{whatsapp ? ( <a … Pedir por WhatsApp </a> ) : null}` por:

```tsx
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            {!agotado ? <AddToCartButton slug={producto.slug} /> : null}
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--brand-primary)] px-6 text-base font-semibold text-[color:var(--brand-primary)] transition-colors hover:bg-[color:var(--brand-primary)]/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--brand-accent)] sm:w-auto"
              >
                <MessageCircle aria-hidden className="h-5 w-5" />
                {agotado ? "Consultar disponibilidad" : "Preguntar por WhatsApp"}
              </a>
            ) : null}
          </div>
```

- [ ] **Step 3: Write the cart screen**

```tsx
// apps/web/src/features/storefront/components/cart-view.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { MessageCircle, ShoppingBag, Trash2 } from "lucide-react";
import { MAX_QTY_PER_LINE, type CartSummary } from "../cart";
import { cartInquiryMessage } from "../cart-message";
import { whatsappLink } from "../contact";
import type { PublicBranch } from "../types";
import { formatCurrency } from "@/lib/utils/format";
import { useCart } from "./cart-provider";
import { ProductPhoto } from "./product-photo";

/**
 * La pantalla del carrito.
 *
 * Los precios NO se calculan aquí: se piden a `/api/storefront/cart` cada vez
 * que cambia el carrito. Es lo que garantiza que lo que ve el cliente es lo que
 * el negocio cobra, aunque el `localStorage` lleve una semana ahí y entretanto
 * hayan subido un precio o se haya agotado algo.
 *
 * Solo hay RETIRO EN SUCURSAL: no hay envío a domicilio, así que no se piden
 * direcciones ni se calcula coste de reparto.
 */
export function CartView({
  branches,
  whatsappPhone,
  baseUrl,
}: {
  branches: PublicBranch[];
  whatsappPhone: string | undefined;
  baseUrl: string;
}) {
  const { items, mounted, setQty, remove } = useCart();
  const [resumen, setResumen] = React.useState<CartSummary | null>(null);
  const [cargando, setCargando] = React.useState(false);
  const [falló, setFalló] = React.useState(false);
  const [sucursal, setSucursal] = React.useState(branches[0]?.slug ?? "");

  React.useEffect(() => {
    if (!mounted) return;
    if (items.length === 0) {
      setResumen({ lines: [], itemCount: 0, total: 0, dropped: [] });
      return;
    }
    let cancelado = false;
    setCargando(true);
    setFalló(false);
    fetch("/api/storefront/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((datos: CartSummary) => {
        if (!cancelado) setResumen(datos);
      })
      .catch(() => {
        if (!cancelado) setFalló(true);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [items, mounted]);

  const elegida = branches.find((s) => s.slug === sucursal);
  const mensaje = resumen
    ? cartInquiryMessage({ summary: resumen, branch: elegida, baseUrl })
    : "";
  const enlaceWhatsapp = mensaje ? whatsappLink(whatsappPhone, mensaje) : null;

  // Hasta montar no se sabe qué hay guardado: se enseña el mismo esqueleto que
  // pintó el servidor, no un "carrito vacío" que parpadearía.
  if (!mounted || (cargando && !resumen)) {
    return (
      <p className="py-20 text-center text-sm text-[color:var(--brand-fg)]/60">
        Cargando tu carrito…
      </p>
    );
  }

  if (falló) {
    return (
      <p className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-14 text-center text-sm text-[color:var(--brand-fg)]/70">
        No pudimos calcular tu carrito ahora mismo. Recarga la página en un
        momento.
      </p>
    );
  }

  if (!resumen || resumen.lines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-14 text-center">
        <ShoppingBag
          aria-hidden
          className="mx-auto h-10 w-10 text-[color:var(--brand-fg)]/30"
        />
        <p className="mt-4 font-semibold text-[color:var(--brand-fg)]">
          Tu carrito está vacío
        </p>
        {resumen && resumen.dropped.length > 0 ? (
          <p className="mt-2 text-sm text-[color:var(--brand-fg)]/60">
            Lo que tenías ya no está disponible.
          </p>
        ) : null}
        <Link
          href="/tienda"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[color:var(--brand-primary)] px-6 text-sm font-semibold text-white hover:bg-[color:var(--brand-accent)]"
        >
          Ver la tienda
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <ul className="divide-y divide-black/5 rounded-2xl border border-black/5 bg-white">
        {resumen.lines.map((linea) => (
          <li key={linea.product.slug} className="flex gap-4 p-4">
            <Link
              href={`/tienda/producto/${linea.product.slug}`}
              className="w-20 shrink-0"
            >
              <ProductPhoto
                src={linea.product.imageUrl}
                alt={linea.product.imageAlt}
                title={linea.product.title}
              />
            </Link>

            <div className="min-w-0 flex-1">
              <Link
                href={`/tienda/producto/${linea.product.slug}`}
                className="text-sm font-semibold text-[color:var(--brand-fg)] hover:text-[color:var(--brand-primary)]"
              >
                {linea.product.title}
              </Link>
              {linea.product.presentation ? (
                <p className="text-xs text-[color:var(--brand-fg)]/60">
                  {linea.product.presentation}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label
                  htmlFor={`cantidad-${linea.product.slug}`}
                  className="text-xs text-[color:var(--brand-fg)]/60"
                >
                  Cantidad
                </label>
                <select
                  id={`cantidad-${linea.product.slug}`}
                  value={linea.qty}
                  onChange={(e) =>
                    setQty(linea.product.slug, Number(e.target.value))
                  }
                  className="min-h-11 cursor-pointer rounded-lg border border-black/10 bg-white px-3 text-sm"
                >
                  {Array.from({ length: MAX_QTY_PER_LINE }, (_, i) => i + 1).map(
                    (n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ),
                  )}
                </select>

                <button
                  type="button"
                  onClick={() => remove(linea.product.slug)}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg px-2 text-sm text-[color:var(--brand-fg)]/60 hover:text-[color:var(--brand-primary)]"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                  Quitar
                  <span className="sr-only"> {linea.product.title}</span>
                </button>
              </div>
            </div>

            <p className="shrink-0 text-sm font-bold text-[color:var(--brand-fg)]">
              {formatCurrency(linea.lineTotal)}
            </p>
          </li>
        ))}
      </ul>

      <aside className="h-fit rounded-2xl border border-black/5 bg-white p-5">
        {resumen.dropped.length > 0 ? (
          <p className="mb-4 rounded-xl bg-[color:var(--brand-warn)]/10 px-3 py-2 text-xs text-[color:var(--brand-fg)]/80">
            Quitamos {resumen.dropped.length}{" "}
            {resumen.dropped.length === 1 ? "producto" : "productos"} que ya no
            están disponibles.
          </p>
        ) : null}

        <div className="flex items-baseline justify-between">
          <span className="text-sm text-[color:var(--brand-fg)]/70">Total</span>
          <span className="text-2xl font-bold text-[color:var(--brand-fg)]">
            {formatCurrency(resumen.total)}
          </span>
        </div>
        <p className="mt-1 text-xs text-[color:var(--brand-fg)]/50">
          Precios con ITBIS incluido
        </p>

        {branches.length > 0 ? (
          <div className="mt-6">
            <label
              htmlFor="sucursal-retiro"
              className="text-sm font-semibold text-[color:var(--brand-fg)]"
            >
              Retiras en
            </label>
            <select
              id="sucursal-retiro"
              value={sucursal}
              onChange={(e) => setSucursal(e.target.value)}
              className="mt-2 min-h-11 w-full cursor-pointer rounded-xl border border-black/10 bg-white px-3 text-sm"
            >
              {branches.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {enlaceWhatsapp ? (
          <a
            href={enlaceWhatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-6 text-base font-semibold text-white hover:bg-[color:var(--brand-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--brand-accent)]"
          >
            <MessageCircle aria-hidden className="h-5 w-5" />
            Enviar pedido por WhatsApp
          </a>
        ) : null}

        {/* Se dice lo que pasa de verdad. No hay cobro en línea todavía, y
            prometerlo sería mentir. */}
        <p className="mt-3 text-xs text-[color:var(--brand-fg)]/60">
          Te confirmamos disponibilidad y el pago se hace al retirar en
          sucursal.
        </p>
      </aside>
    </div>
  );
}
```

- [ ] **Step 4: Write the page**

```tsx
// apps/web/src/app/tienda/carrito/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CartView } from "@/features/storefront/components/cart-view";
import {
  resolveStorefrontTenant,
  storefrontBaseUrl,
} from "@/server/services/storefront/tenant";

/**
 * El carrito.
 *
 * `noindex`: su contenido es distinto para cada visitante y vacío para un
 * rastreador. Indexarlo solo serviría para que Google enseñe una página vacía.
 */
export const metadata: Metadata = {
  title: "Tu carrito",
  robots: { index: false, follow: true },
};

export default async function CarritoPage() {
  const tenant = await resolveStorefrontTenant();
  if (!tenant) notFound();

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-[color:var(--brand-fg)] sm:text-3xl">
        Tu carrito
      </h1>
      <CartView
        branches={tenant.branches}
        whatsappPhone={tenant.whatsappPhone}
        baseUrl={storefrontBaseUrl()}
      />
    </>
  );
}
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/storefront/components/add-to-cart-button.tsx \
        apps/web/src/features/storefront/components/cart-view.tsx \
        apps/web/src/app/tienda/carrito \
        apps/web/src/app/tienda/producto/\[slug\]/page.tsx
git commit -m "feat(tienda): agregar al carrito y pantalla de carrito con retiro en sucursal"
```

---

### Task 6: Prueba en caliente y documentación

- [ ] **Step 1: Test it live**

```bash
pnpm --filter web dev
```

Enciende la tienda **temporalmente**:

```sql
update business_web_settings set storefront_enabled = true
where business_id = (select business_id from business_web_settings order by created_at limit 1);
```

Recorre y comprueba:
1. Una ficha → "Agregar al carrito" → el contador del encabezado sube.
2. Recargar la página: el carrito sigue ahí.
3. `/tienda/carrito` → líneas con foto, cantidad editable, total.
4. Cambiar cantidad → el total se recalcula **contra el servidor**.
5. Elegir sucursal → el WhatsApp dice "para retirar en …".
6. Vaciar el carrito → estado vacío con enlace a la tienda.
7. **La prueba que importa:** en la consola del navegador,
   `localStorage.setItem('dermaland.tienda.carrito.v1', '[{"slug":"<un-slug-real>","qty":2,"price":1}]')`
   y recargar `/tienda/carrito`. El precio que se enseña debe ser el del
   catálogo, **no** el 1 inyectado.
8. Sin sesión, `curl -s -o /dev/null -w '%{http_code}' http://localhost:3031/api/storefront/settings` debe dar **307** (sigue protegida) y el POST al carrito debe responder 200.

**Devuelve la tienda al estado seguro** (obligatorio):

```sql
update business_web_settings set storefront_enabled = false;
```

- [ ] **Step 2: Bump version and document**

1. `package.json` → `"version": "0.115.0"`.
2. `CHANGELOG.md` → entrada `## [0.115.0] - 2026-08-04` bajo `[Unreleased]`, describiendo el carrito, la ruta pública de precios, el retiro en sucursal y el cierre por WhatsApp con el pedido completo.
3. `docs/tienda-en-linea.md` → fila `| F3.1 | Carrito con precios de servidor y retiro en sucursal | **Hecho** |` en la tabla de §4.

- [ ] **Step 3: Final verification**

Run: `pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(tienda): F3.1 — el carrito (v0.115.0)"
```

---

## Verificación final del plan

- **La tienda sigue apagada.** El único paso que la enciende (Task 6) la apaga en el mismo paso.
- **Cero migraciones.** Ninguna tarea toca la base.
- **La frontera pública se prueba en los dos sentidos:** entra `/api/storefront/cart`, siguen fuera `settings` y `products`.
- **El precio nunca sale del navegador**, y hay una prueba automática y una manual que lo comprueban.
- **F3.3 (pedidos)** sustituirá el final por WhatsApp por un pedido real sin rehacer nada de esto: el motor y la ruta ya devuelven el resumen que necesitará.
