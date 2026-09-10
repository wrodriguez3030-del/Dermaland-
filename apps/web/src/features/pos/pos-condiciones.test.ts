import { describe, it, expect } from "vitest";
import { productosPorCondicion, CONDICIONES_POS } from "./pos-condiciones";
import type { Product } from "@/types";

let contador = 0;
function producto(o: Partial<Product>): Product {
  contador += 1;
  return {
    id: `prod-${contador}`,
    businessId: "biz-1",
    sku: `DERM-${String(contador).padStart(6, "0")}`,
    name: "Producto genérico",
    unit: "unidad",
    requiresPrescription: false,
    controlled: false,
    cost: 0,
    price: 100,
    itbisRate: 18,
    minStock: 0,
    maxStock: 0,
    active: true,
    sellable: true,
    createdAt: "2026-07-02T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
    ...o,
  } as Product;
}

describe("productosPorCondicion", () => {
  it("«Acné» encuentra por MARCA aunque el producto nunca diga «acné» — igual que la tienda", () => {
    const cleanance = producto({ name: "Cleanance Gel Limpiador 200 ML" });
    const otro = producto({ name: "Lipikar Bálsamo AP+M 400 ML" });
    const resultado = productosPorCondicion([cleanance, otro], "acne");
    expect(resultado).toEqual([cleanance]);
  });

  it("«Caspa» encuentra por MARCA (Kelual)", () => {
    const kelual = producto({ name: "Kelual DS Champú 125 ML" });
    const otro = producto({ name: "Anthelios XL Fluido 50 ML" });
    expect(productosPorCondicion([kelual, otro], "caspa")).toEqual([kelual]);
  });

  it("«Manchas» encuentra por MARCA (Pigmentclar)", () => {
    const pigmentclar = producto({ name: "Pigmentclar Sérum 30 ML" });
    const otro = producto({ name: "Cleanance Gel 200 ML" });
    expect(productosPorCondicion([pigmentclar, otro], "manchas")).toEqual([pigmentclar]);
  });

  it("«Caída de cabello» encuentra por CUALQUIERA de sus dos términos (caída Y cabello)", () => {
    const anticaida = producto({ name: "Anticaída Neoptide Loción 100 ML" });
    const champu = producto({ name: "Champú Capilar Fortificante 200 ML" });
    const otro = producto({ name: "Cleanance Gel 200 ML" });
    const resultado = productosPorCondicion([anticaida, champu, otro], "caida-cabello");
    expect(resultado).toEqual([anticaida, champu]);
  });

  it("también encuentra por `keywords`/`useType`, no solo por el nombre", () => {
    const p = producto({
      name: "Fluido Facial 50 ML",
      useType: "protección solar",
      keywords: ["bloqueador", "spf50"],
    });
    expect(productosPorCondicion([p], "filtro-seca")).toEqual([p]);
  });

  it("los dos filtros solares (seca/grasa) prefieren el `skinType` cuando existe", () => {
    const paraSeca = producto({ name: "Anthelios Crema 50 ML", skinType: "Piel seca" });
    const paraGrasa = producto({ name: "Anthelios Fluido Mate 50 ML", skinType: "Piel grasa" });
    expect(productosPorCondicion([paraSeca, paraGrasa], "filtro-seca")).toEqual([paraSeca]);
    expect(productosPorCondicion([paraSeca, paraGrasa], "filtro-grasa")).toEqual([paraGrasa]);
  });

  it("🔴 si NINGÚN solar trae `skinType`, no deja la lista vacía — enseña todos los que sí protegen del sol", () => {
    const a = producto({ name: "Anthelios XL Fluido 50 ML" });
    const b = producto({ name: "Photoderm Spray SPF50 200 ML" });
    const resultado = productosPorCondicion([a, b], "filtro-seca");
    expect(resultado).toEqual([a, b]);
  });

  it("una clave de condición desconocida no revienta: devuelve la lista vacía", () => {
    const p = producto({ name: "Cleanance Gel 200 ML" });
    expect(productosPorCondicion([p], "no-existe")).toEqual([]);
  });

  it("CONDICIONES_POS trae las 6 etiquetas exactas pedidas, en orden", () => {
    expect(CONDICIONES_POS.map((c) => c.label)).toEqual([
      "Manchas",
      "Acné",
      "Caspa",
      "Caída de cabello",
      "Filtro solar piel seca",
      "Filtro solar piel grasa",
    ]);
  });
});
