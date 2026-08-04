import { describe, expect, it } from "vitest";
import {
  publicImageUrl,
  toPublicProduct,
  type WebMetaRow,
  type WebProductRow,
} from "./public-product";

const SUPABASE_URL = "https://sntcvyozbhrgicwmtcoh.supabase.co";
const FOTO = `${SUPABASE_URL}/storage/v1/object/public/product-images/businesses/b1/products/p1/image.webp`;

function producto(over: Partial<WebProductRow> = {}): WebProductRow {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    name: "AVÈNE CICALFATE+ CREMA 40ML",
    presentation: "Tubo 40 ml",
    price: 1250.5,
    image_url: FOTO,
    brand_id: "b-1",
    category_id: "c-1",
    active: true,
    sellable: true,
    deleted_at: null,
    requires_prescription: false,
    controlled: false,
    ...over,
  };
}

function meta(over: Partial<WebMetaRow> = {}): WebMetaRow {
  return {
    product_id: "11111111-2222-3333-4444-555555555555",
    slug: "avene-cicalfate-crema-40ml",
    featured: false,
    is_new: false,
    web_title: null,
    web_summary: null,
    web_description: null,
    benefits: [],
    how_to_use: null,
    seo_title: null,
    seo_description: null,
    image_alt: null,
    ...over,
  };
}

describe("publicImageUrl", () => {
  it("acepta una foto del bucket público propio", () => {
    expect(publicImageUrl(FOTO, SUPABASE_URL)).toBe(FOTO);
  });

  it("rechaza el hotlink a un CDN ajeno", () => {
    // R-WEB-06: 12 productos apuntaban a cdn1.costatic.com. Publicarlos deja el
    // catálogo a merced de un tercero.
    expect(
      publicImageUrl("https://cdn1.costatic.com/img/producto.jpg", SUPABASE_URL),
    ).toBeNull();
  });

  it("rechaza una data-URL guardada dentro de la columna", () => {
    expect(publicImageUrl("data:image/png;base64,iVBORw0KGgo=", SUPABASE_URL)).toBeNull();
  });

  it("rechaza otro bucket del mismo Supabase", () => {
    // `dgii-certificates`, `purchase-docs`… nada fuera de las fotos de producto.
    expect(
      publicImageUrl(
        `${SUPABASE_URL}/storage/v1/object/public/dgii-certificates/cert.p12`,
        SUPABASE_URL,
      ),
    ).toBeNull();
  });

  it("rechaza http sin cifrar y rutas relativas", () => {
    expect(publicImageUrl(FOTO.replace("https://", "http://"), SUPABASE_URL)).toBeNull();
    expect(publicImageUrl("/imagenes/producto.webp", SUPABASE_URL)).toBeNull();
  });

  it("sin Supabase configurado no publica ninguna foto", () => {
    expect(publicImageUrl(FOTO, undefined)).toBeNull();
  });
});

describe("toPublicProduct", () => {
  it("usa el título comercial cuando existe y el nombre del catálogo cuando no", () => {
    expect(
      toPublicProduct({
        product: producto(),
        meta: meta(),
        availableQuantity: 3,
        supabaseUrl: SUPABASE_URL,
      }).title,
    ).toBe("AVÈNE CICALFATE+ CREMA 40ML");

    expect(
      toPublicProduct({
        product: producto(),
        meta: meta({ web_title: "Avène Cicalfate+ Crema reparadora" }),
        availableQuantity: 3,
        supabaseUrl: SUPABASE_URL,
      }).title,
    ).toBe("Avène Cicalfate+ Crema reparadora");
  });

  it("colapsa las existencias a un booleano con texto", () => {
    const conStock = toPublicProduct({
      product: producto(),
      meta: meta(),
      availableQuantity: 47,
      supabaseUrl: SUPABASE_URL,
    });
    expect(conStock.availability).toEqual({ status: "in_stock", label: "En existencia" });

    const sinStock = toPublicProduct({
      product: producto(),
      meta: meta(),
      availableQuantity: 0,
      supabaseUrl: SUPABASE_URL,
    });
    expect(sinStock.availability).toEqual({ status: "out_of_stock", label: "Agotado" });
  });

  it("NUNCA serializa la cantidad exacta de existencias", () => {
    // Si alguien añadiera `quantity` al objeto público, la tienda pasaría de
    // "En existencia" a revelar volumen de compra y rotación.
    const serializado = JSON.stringify(
      toPublicProduct({
        product: producto(),
        meta: meta(),
        availableQuantity: 47,
        supabaseUrl: SUPABASE_URL,
      }),
    );
    expect(serializado).not.toContain("47");
  });

  it("NUNCA serializa costo, margen, SKU, código de barras, business_id ni el UUID interno", () => {
    // La fila llega con campos internos de sobra: esta prueba es la que impide
    // que un `...spread` los publique.
    const filaSucia = {
      ...producto(),
      cost: 812.33,
      sku: "SKU-INTERNO-991",
      barcode: "7501234567890",
      business_id: "00000000-0000-0000-0000-00000000d001",
      min_stock: 5,
      max_stock: 90,
    } as WebProductRow;

    const publico = toPublicProduct({
      product: filaSucia,
      meta: meta(),
      availableQuantity: 4,
      supabaseUrl: SUPABASE_URL,
    });
    const serializado = JSON.stringify(publico);

    for (const prohibido of [
      "812.33",
      "SKU-INTERNO-991",
      "7501234567890",
      "00000000-0000-0000-0000-00000000d001",
      "11111111-2222-3333-4444-555555555555",
      "min_stock",
      "max_stock",
      "cost",
    ]) {
      expect(serializado).not.toContain(prohibido);
    }

    // Lista blanca cerrada: cualquier clave nueva obliga a pasar por aquí.
    expect(new Set(Object.keys(publico))).toEqual(
      new Set([
        "slug",
        "title",
        "summary",
        "description",
        "benefits",
        "howToUse",
        "brandName",
        "brandSlug",
        "categoryName",
        "categorySlug",
        "presentation",
        "price",
        "imageUrl",
        "imageAlt",
        "availability",
        "featured",
        "isNew",
        "seoTitle",
        "seoDescription",
      ]),
    );
  });

  it("sin foto válida deja imageUrl en null y no inventa un alt", () => {
    const publico = toPublicProduct({
      product: producto({ image_url: "https://cdn1.costatic.com/x.jpg" }),
      meta: meta({ image_alt: "Crema reparadora" }),
      availableQuantity: 1,
      supabaseUrl: SUPABASE_URL,
    });
    expect(publico.imageUrl).toBeNull();
    expect(publico.imageAlt).toBeUndefined();
  });

  it("limpia textos en blanco en vez de serializarlos", () => {
    const publico = toPublicProduct({
      product: producto({ presentation: "   " }),
      meta: meta({ web_summary: "  ", benefits: ["Calma", "  ", "Repara"] }),
      availableQuantity: 1,
      supabaseUrl: SUPABASE_URL,
    });
    expect(publico.presentation).toBeUndefined();
    expect(publico.summary).toBeUndefined();
    expect(publico.benefits).toEqual(["Calma", "Repara"]);
  });

  it("arrastra marca y categoría solo cuando se le pasan", () => {
    const conTaxonomia = toPublicProduct({
      product: producto(),
      meta: meta(),
      brand: { name: "Avène", slug: "avene" },
      category: { name: "Dermocosmética", slug: "dermocosmetica" },
      availableQuantity: 1,
      supabaseUrl: SUPABASE_URL,
    });
    expect(conTaxonomia.brandSlug).toBe("avene");
    expect(conTaxonomia.categoryName).toBe("Dermocosmética");

    const sinTaxonomia = toPublicProduct({
      product: producto({ brand_id: null }),
      meta: meta(),
      availableQuantity: 1,
      supabaseUrl: SUPABASE_URL,
    });
    expect(sinTaxonomia.brandName).toBeUndefined();
    expect(sinTaxonomia.brandSlug).toBeUndefined();
  });
});
