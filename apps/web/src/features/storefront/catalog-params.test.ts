import { describe, expect, it } from "vitest";
import {
  buildCatalogHref,
  CATALOG_BASE,
  hasActiveFilters,
  parseCatalogParams,
} from "./catalog-params";

describe("parseCatalogParams", () => {
  it("lee una URL normal", () => {
    expect(
      parseCatalogParams({ q: "avene", marca: "avene", categoria: "facial", orden: "precio-asc", pagina: "3" }),
    ).toEqual({
      q: "avene",
      brandSlug: "avene",
      categorySlug: "facial",
      sort: "precio-asc",
      page: 3,
    });
  });

  it("una URL vacía es una consulta válida", () => {
    expect(parseCatalogParams({})).toEqual({
      q: undefined,
      brandSlug: undefined,
      categorySlug: undefined,
      sort: "relevancia",
      page: 1,
    });
  });

  it("un orden desconocido cae a relevancia en vez de romper", () => {
    // Un enlace viejo, un rastreador probando o alguien tecleando a mano.
    expect(parseCatalogParams({ orden: "DROP TABLE products" }).sort).toBe("relevancia");
    expect(parseCatalogParams({ orden: "" }).sort).toBe("relevancia");
  });

  it("una página absurda cae a la 1", () => {
    for (const pagina of ["-4", "0", "abc", "", "1e9999"]) {
      const resultado = parseCatalogParams({ pagina });
      expect(resultado.page).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(resultado.page!)).toBe(true);
    }
    expect(parseCatalogParams({ pagina: "abc" }).page).toBe(1);
    expect(parseCatalogParams({ pagina: "-4" }).page).toBe(1);
  });

  it("con un parámetro repetido se queda con el primero", () => {
    expect(parseCatalogParams({ marca: ["avene", "isdin"] }).brandSlug).toBe("avene");
  });

  it("los espacios en blanco no cuentan como filtro", () => {
    expect(parseCatalogParams({ q: "   " }).q).toBeUndefined();
  });
});

describe("buildCatalogHref", () => {
  const base = parseCatalogParams({});

  it("no escribe los valores por defecto", () => {
    // La URL que se comparte por WhatsApp debe ser legible.
    expect(buildCatalogHref(base)).toBe("/tienda/catalogo");
    expect(buildCatalogHref(base, { brandSlug: "avene" })).toBe("/tienda/catalogo?marca=avene");
  });

  it("cambiar de filtro vuelve a la página 1", () => {
    // Estar en la página 7 y elegir una marca de 12 productos dejaría al
    // cliente mirando una lista vacía.
    const enPagina7 = parseCatalogParams({ pagina: "7" });
    expect(buildCatalogHref(enPagina7, { brandSlug: "isdin" })).toBe("/tienda/catalogo?marca=isdin");
  });

  it("cambiar de página conserva los filtros", () => {
    const conFiltros = parseCatalogParams({ q: "crema", marca: "avene", orden: "nombre" });
    expect(buildCatalogHref(conFiltros, { page: 2 })).toBe(
      "/tienda/catalogo?q=crema&marca=avene&orden=nombre&pagina=2",
    );
  });

  it("codifica el texto de búsqueda", () => {
    expect(buildCatalogHref(base, { q: "protección solar" })).toBe(
      "/tienda/catalogo?q=protecci%C3%B3n+solar",
    );
  });

  it("quitar un filtro lo saca de la URL", () => {
    const conMarca = parseCatalogParams({ marca: "avene", q: "crema" });
    expect(buildCatalogHref(conMarca, { brandSlug: undefined })).toBe("/tienda/catalogo?q=crema");
  });

  it("apunta a la rejilla, no a la portada", () => {
    // `/tienda` es la PORTADA. Si el destino por defecto volviera a ser
    // `/tienda`, cada filtro y cada paginación devolverían al visitante a los
    // estantes en vez de a sus resultados.
    expect(buildCatalogHref(base)).toBe(CATALOG_BASE);
    expect(CATALOG_BASE).toBe("/tienda/catalogo");
  });
});

describe("hasActiveFilters", () => {
  it("distingue el catálogo completo de uno filtrado", () => {
    expect(hasActiveFilters(parseCatalogParams({}))).toBe(false);
    expect(hasActiveFilters(parseCatalogParams({ orden: "nombre", pagina: "3" }))).toBe(false);
    expect(hasActiveFilters(parseCatalogParams({ marca: "avene" }))).toBe(true);
    expect(hasActiveFilters(parseCatalogParams({ q: "crema" }))).toBe(true);
  });
});
