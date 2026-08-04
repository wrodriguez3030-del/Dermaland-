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
    expect(parseCartItems([{ slug: "a", qty: 1, price: 1, total: 1 }])).toEqual([
      { slug: "a", qty: 1 },
    ]);
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
