import { describe, it, expect } from "vitest";
import { normalizeForSearch, isWithinOneEdit, queryCatalog } from "./catalog-query";
import type { PublicProduct } from "./types";

function producto(over: Partial<PublicProduct> & { slug: string; title: string }): PublicProduct {
  return {
    benefits: [],
    price: 1000,
    imageUrl: null,
    availability: { status: "in_stock", label: "En existencia" },
    featured: false,
    isNew: false,
    ...over,
  };
}

const CATALOGO: PublicProduct[] = [
  producto({
    slug: "avene-cleanance-comedomed",
    title: "AVÈNE Cleanance Comedomed",
    brandName: "AVÈNE",
    brandSlug: "avene",
    categoryName: "Cuidado facial",
    categorySlug: "cuidado-facial",
    price: 1850,
  }),
  producto({
    slug: "la-roche-posay-effaclar-duo",
    title: "LA ROCHE-POSAY Effaclar Duo+",
    brandName: "LA ROCHE-POSAY",
    brandSlug: "la-roche-posay",
    categoryName: "Cuidado facial",
    categorySlug: "cuidado-facial",
    price: 2400,
    featured: true,
  }),
  producto({
    slug: "heliocare-360-gel-oil-free",
    title: "Heliocare 360 Gel Oil Free SPF 50",
    brandName: "HELIOCARE",
    brandSlug: "heliocare",
    categoryName: "Protección solar",
    categorySlug: "proteccion-solar",
    price: 3200,
    isNew: true,
  }),
  producto({
    slug: "eucerin-ph5-locion",
    title: "EUCERIN pH5 Loción",
    brandName: "EUCERIN",
    brandSlug: "eucerin",
    categoryName: "Cuidado corporal",
    categorySlug: "cuidado-corporal",
    price: 1200,
    availability: { status: "out_of_stock", label: "Agotado" },
  }),
];

describe("normalizeForSearch", () => {
  it("quita acentos y baja a minúsculas en ambos lados de la comparación", () => {
    expect(normalizeForSearch("AVÈNE")).toBe("avene");
    expect(normalizeForSearch("Protección Solar")).toBe("proteccion solar");
    expect(normalizeForSearch("  Piel   Atópica ")).toBe("piel atopica");
  });
});

describe("isWithinOneEdit", () => {
  it("acepta una sustitución, una inserción o una omisión", () => {
    expect(isWithinOneEdit("avene", "avenne")).toBe(true); // inserción
    expect(isWithinOneEdit("avene", "aven")).toBe(true); // omisión
    expect(isWithinOneEdit("avene", "avenu")).toBe(true); // sustitución
    expect(isWithinOneEdit("avene", "avene")).toBe(true); // idénticas
  });

  it("rechaza dos o más diferencias", () => {
    expect(isWithinOneEdit("avene", "avnne2")).toBe(false);
    expect(isWithinOneEdit("avene", "eucerin")).toBe(false);
  });
});

describe("queryCatalog — búsqueda", () => {
  it("'avene' encuentra 'AVÈNE' pese al acento", () => {
    const r = queryCatalog(CATALOGO, { q: "avene" });
    expect(r.items.map((p) => p.slug)).toContain("avene-cleanance-comedomed");
    expect(r.usedFuzzy).toBe(false);
  });

  it("'roche posay' encuentra 'LA ROCHE-POSAY' pese al guion y al orden", () => {
    const r = queryCatalog(CATALOGO, { q: "roche posay" });
    expect(r.items[0]?.slug).toBe("la-roche-posay-effaclar-duo");
  });

  it("busca también por categoría y presentación, no solo por el título", () => {
    expect(queryCatalog(CATALOGO, { q: "proteccion solar" }).total).toBe(1);
  });

  it("exige TODAS las palabras, no cualquiera", () => {
    expect(queryCatalog(CATALOGO, { q: "avene heliocare" }).total).toBe(0);
  });

  it("tolera una errata SOLO cuando no hay ninguna coincidencia exacta", () => {
    const conErrata = queryCatalog(CATALOGO, { q: "avenne" });
    expect(conErrata.total).toBe(1);
    expect(conErrata.usedFuzzy).toBe(true);

    // "gel" sí casa exacto: no debe activarse la tolerancia ni traer ruido.
    const exacta = queryCatalog(CATALOGO, { q: "gel" });
    expect(exacta.usedFuzzy).toBe(false);
    expect(exacta.total).toBe(1);
  });

  it("sin coincidencias devuelve vacío, no el catálogo entero", () => {
    const r = queryCatalog(CATALOGO, { q: "bicicleta" });
    expect(r.items).toEqual([]);
    expect(r.total).toBe(0);
  });

  it("una consulta vacía o de una letra no filtra nada", () => {
    expect(queryCatalog(CATALOGO, { q: "" }).total).toBe(4);
    expect(queryCatalog(CATALOGO, { q: "a" }).total).toBe(4);
  });
});

describe("queryCatalog — filtros", () => {
  it("filtra por marca", () => {
    expect(queryCatalog(CATALOGO, { brandSlug: "eucerin" }).total).toBe(1);
  });

  it("filtra por categoría", () => {
    expect(queryCatalog(CATALOGO, { categorySlug: "cuidado-facial" }).total).toBe(2);
  });

  it("combina texto y filtro", () => {
    expect(
      queryCatalog(CATALOGO, { q: "cleanance", categorySlug: "cuidado-facial" }).total,
    ).toBe(1);
    expect(
      queryCatalog(CATALOGO, { q: "cleanance", categorySlug: "proteccion-solar" }).total,
    ).toBe(0);
  });
});

describe("queryCatalog — orden", () => {
  it("por precio ascendente y descendente", () => {
    expect(queryCatalog(CATALOGO, { sort: "precio-asc" }).items[0]?.price).toBe(1200);
    expect(queryCatalog(CATALOGO, { sort: "precio-desc" }).items[0]?.price).toBe(3200);
  });

  it("por nombre respeta el alfabeto español", () => {
    const nombres = queryCatalog(CATALOGO, { sort: "nombre" }).items.map((p) => p.title);
    expect(nombres[0]).toBe("AVÈNE Cleanance Comedomed");
  });

  it("'nuevos' pone delante lo marcado como nuevo", () => {
    expect(queryCatalog(CATALOGO, { sort: "nuevos" }).items[0]?.isNew).toBe(true);
  });

  it("por relevancia, lo agotado nunca va primero", () => {
    const r = queryCatalog(CATALOGO, { sort: "relevancia" });
    expect(r.items.at(-1)?.availability.status).toBe("out_of_stock");
  });
});

describe("queryCatalog — paginación", () => {
  it("respeta el tamaño de página y reporta el total sin paginar", () => {
    const r = queryCatalog(CATALOGO, { pageSize: 2, page: 1 });
    expect(r.items).toHaveLength(2);
    expect(r.total).toBe(4);
    expect(r.pageCount).toBe(2);
  });

  it("una página fuera de rango se ajusta a la última, no revienta", () => {
    const r = queryCatalog(CATALOGO, { pageSize: 2, page: 99 });
    expect(r.page).toBe(2);
    expect(r.items).toHaveLength(2);
  });

  it("una página inválida se ajusta a la primera", () => {
    expect(queryCatalog(CATALOGO, { page: 0 }).page).toBe(1);
    expect(queryCatalog(CATALOGO, { page: -5 }).page).toBe(1);
  });

  it("con catálogo vacío no divide por cero", () => {
    const r = queryCatalog([], { page: 3 });
    expect(r).toMatchObject({ items: [], total: 0, page: 1, pageCount: 0 });
  });
});
