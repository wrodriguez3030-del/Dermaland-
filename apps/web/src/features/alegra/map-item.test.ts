import { describe, it, expect } from "vitest";
import item from "./__fixtures__/item-elta-uv-sport.json";
import { itemToDraft, barcodeOf, displayNameFor } from "./map-item";
import type { AlegraItem } from "./types";

const base = item as AlegraItem;

describe("itemToDraft", () => {
  it("precio CON ITBIS redondeado a 2, costo de inventario, nombre limpio, código del campo personalizado", () => {
    const d = itemToDraft(base);
    expect(d.price).toBe(2100); // 1779.661 × 1.18 = 2100.0000
    expect(d.cost).toBe(1156.78);
    expect(d.displayName).toBe("Elta MD UV Sport Broad Spectrum SPF 50");
    expect(d.alegraName).toBe("ELTA MD UV SPORT BROAD SPECTRUM SPF 50");
    expect(d.barcode).toBe("390205022878");
    expect(d.active).toBe(true);
    expect(d.alegraId).toBe("1288");
    expect(d.unit).toBe("unidad");
  });

  it("sin lista de precios o sin inventario → 0; inactivo → active=false; código vacío → null", () => {
    expect(itemToDraft({ ...base, price: [] }).price).toBe(0);
    expect(itemToDraft({ ...base, inventory: null }).cost).toBe(0);
    expect(itemToDraft({ ...base, status: "inactive" }).active).toBe(false);
    expect(barcodeOf({ ...base, customFields: [{ key: "barcode", value: "  " }] })).toBeNull();
    expect(barcodeOf({ ...base, customFields: [{ name: "Código de barras", value: "0390205022878" }] })).toBe("0390205022878");
    expect(barcodeOf({ ...base, customFields: undefined })).toBeNull();
  });

  it("prefiere la lista marcada como principal si hay varias", () => {
    const d = itemToDraft({
      ...base,
      price: [
        { idPriceList: "2", name: "Mayorista", price: 1000 },
        { idPriceList: "1", name: "General", price: 1779.661, main: true },
      ],
    });
    expect(d.price).toBe(2100);
  });

  it("el nombre limpio sigue emparejando con el de Alegra; si no, se conserva el crudo", () => {
    expect(displayNameFor("ZO LEUKOPLAST")).toBe("ZO Leukoplast");
    expect(itemToDraft({ ...base, name: "  ZO LEUKOPLAST " }).displayName).toBe("ZO Leukoplast");
  });
});
