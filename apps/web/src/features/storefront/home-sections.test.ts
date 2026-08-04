import { describe, expect, it } from "vitest";
import { buildHomeSections } from "./home-sections";
import type { PublicProduct, PublicTaxonomy } from "./types";

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

/** n productos publicables, todos iguales salvo el slug. */
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

  it("una categoría sin productos publicables no deja un estante vacío", () => {
    const productos = lote("s", 6, { categorySlug: "solares" });
    const claves = buildHomeSections(productos, CATEGORIAS).map((s) => s.key);
    expect(claves).toContain("categoria:solares");
    expect(claves).not.toContain("categoria:limpieza");
  });
});
