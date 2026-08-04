import { describe, expect, it } from "vitest";
import {
  breadcrumbJsonLd,
  productJsonLd,
  serializeJsonLd,
  storeJsonLd,
} from "./structured-data";
import type { PublicProduct, StorefrontTenant } from "./types";

const BASE = "https://dermaland.vercel.app";

const tenant: StorefrontTenant = {
  businessId: "00000000-0000-0000-0000-00000000d001",
  siteName: "DermaLand",
  whatsappPhone: "+1 809-226-5252",
  branches: [
    {
      slug: "e-leon-jimenez",
      name: "E. León Jiménez",
      address: "Calle E. León Jiménez No. 47",
      city: "Santiago de los Caballeros",
      phone: "+1 809-226-5252",
    },
  ],
};

function producto(over: Partial<PublicProduct> = {}): PublicProduct {
  return {
    slug: "avene-cicalfate-crema",
    title: "Avène Cicalfate+ Crema",
    brandName: "Avène",
    brandSlug: "avene",
    categoryName: "Cuidado facial",
    categorySlug: "cuidado-facial",
    benefits: [],
    price: 1880,
    imageUrl: `${BASE}/foto.webp`,
    availability: { status: "in_stock", label: "En existencia" },
    featured: false,
    isNew: false,
    ...over,
  };
}

describe("serializeJsonLd", () => {
  it("impide cerrar la etiqueta <script> desde el contenido", () => {
    // Un nombre de producto con `</script>` cerraría la etiqueta y el navegador
    // ejecutaría lo que viniera detrás.
    const veneno = { name: "</script><img src=x onerror=alert(1)>" };
    const salida = serializeJsonLd(veneno);
    expect(salida).not.toContain("</script>");
    expect(salida).not.toContain("<img");
    // Sigue siendo JSON válido y con el mismo contenido.
    expect(JSON.parse(salida)).toEqual(veneno);
  });

  it("no toca el resto del texto", () => {
    expect(JSON.parse(serializeJsonLd({ n: "Avène Cicalfate+ 40 ml" }))).toEqual({
      n: "Avène Cicalfate+ 40 ml",
    });
  });
});

describe("productJsonLd", () => {
  it("publica precio, moneda y disponibilidad en el vocabulario de schema.org", () => {
    const datos = productJsonLd(producto(), tenant, BASE) as Record<string, never>;
    const oferta = datos.offers as unknown as Record<string, string>;
    expect(oferta.price).toBe("1880.00");
    expect(oferta.priceCurrency).toBe("DOP");
    expect(oferta.availability).toBe("https://schema.org/InStock");
    expect(oferta.url).toBe(`${BASE}/tienda/producto/avene-cicalfate-crema`);
  });

  it("lo agotado se declara agotado, no se oculta", () => {
    const agotado = producto({
      availability: { status: "out_of_stock", label: "Agotado" },
    });
    const oferta = (productJsonLd(agotado, tenant, BASE) as Record<string, never>)
      .offers as unknown as Record<string, string>;
    expect(oferta.availability).toBe("https://schema.org/OutOfStock");
  });

  it("omite lo que no existe en vez de publicar campos vacíos", () => {
    const datos = productJsonLd(
      producto({ imageUrl: null, brandName: undefined, summary: undefined }),
      tenant,
      BASE,
    );
    expect(datos).not.toHaveProperty("image");
    expect(datos).not.toHaveProperty("brand");
    expect(datos).not.toHaveProperty("description");
  });

  it("NUNCA publica nada interno", () => {
    const serializado = serializeJsonLd(productJsonLd(producto(), tenant, BASE));
    expect(serializado).not.toContain("00000000-0000-0000-0000-00000000d001");
    expect(serializado).not.toContain("cost");
    expect(serializado).not.toContain("inventoryLevel");
  });
});

describe("breadcrumbJsonLd", () => {
  it("numera las migas en orden", () => {
    const datos = breadcrumbJsonLd(producto(), BASE) as Record<string, never>;
    const items = datos.itemListElement as unknown as { position: number; name: string }[];
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(items.map((i) => i.name)).toEqual([
      "Tienda",
      "Cuidado facial",
      "Avène Cicalfate+ Crema",
    ]);
  });

  it("las migas apuntan a las MISMAS direcciones que los enlaces visibles", () => {
    // Apuntaban a `/tienda?categoria=…`, que hoy redirige. Un rastro de migas
    // hacia un 307 le dice a Google que la ruta declarada no es la servida.
    const items = (breadcrumbJsonLd(producto(), BASE) as Record<string, never>)
      .itemListElement as unknown as { item: string }[];
    expect(items[1]?.item).toBe(`${BASE}/tienda/categoria/cuidado-facial`);
  });

  it("sin categoría son solo dos escalones", () => {
    const sinCategoria = producto({ categoryName: undefined, categorySlug: undefined });
    const items = (breadcrumbJsonLd(sinCategoria, BASE) as Record<string, never>)
      .itemListElement as unknown as unknown[];
    expect(items).toHaveLength(2);
  });
});

describe("storeJsonLd", () => {
  it("declara las sucursales con su nombre COMERCIAL", () => {
    const datos = storeJsonLd(tenant, BASE) as Record<string, never>;
    const lugares = datos.location as unknown as { name: string }[];
    expect(lugares[0]!.name).toBe("E. León Jiménez");
    // Nunca el nombre interno del sistema.
    expect(serializeJsonLd(datos)).not.toContain("DermaLand Principal");
  });
});
