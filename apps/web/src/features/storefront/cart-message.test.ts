import { describe, expect, it } from "vitest";
import type { CartSummary } from "./cart";
import { cartInquiryMessage } from "./cart-message";
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
