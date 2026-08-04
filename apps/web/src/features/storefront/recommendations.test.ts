import { describe, expect, it } from "vitest";
import { recommendFor } from "./recommendations";
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
      producto({
        slug: "avene-limpiador",
        brandSlug: "avene",
        categorySlug: "limpieza",
      }),
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
      producto({
        slug: "avene-solar-50",
        brandSlug: "avene",
        categorySlug: "solares",
      }),
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
    const segunda = recommendFor(ACTUAL, [...catalogo].reverse()).map(
      (p) => p.slug,
    );
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
