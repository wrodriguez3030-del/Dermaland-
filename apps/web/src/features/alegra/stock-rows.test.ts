import { describe, it, expect } from "vitest";
import item from "./__fixtures__/item-elta-uv-sport.json";
import { stockRowsFromItems } from "./stock-rows";
import type { AlegraItem } from "./types";

const base = item as AlegraItem;

describe("stockRowsFromItems", () => {
  it("usa el nombre de DermaLand del producto emparejado y las cantidades por almacén (1 = Principal, total = 1 + 2)", () => {
    const rows = stockRowsFromItems([base], (id) => (id === "1288" ? "Elta MD UV Sport Broad Spectrum SPF 50" : undefined));
    expect(rows).toEqual([{ rowNumber: 1, name: "Elta MD UV Sport Broad Spectrum SPF 50", qtyPrincipal: 1, qtyTotal: 1 }]);
  });

  it("suma la segunda sucursal en el total y omite ítems sin inventario o sin producto emparejado", () => {
    const conCutis: AlegraItem = {
      ...base,
      inventory: {
        warehouses: [
          { id: "1", name: "Principal", availableQuantity: 3 },
          { id: "2", name: "CUTIS", availableQuantity: 4 },
        ],
      },
    };
    expect(stockRowsFromItems([conCutis], () => "X")[0]).toMatchObject({ qtyPrincipal: 3, qtyTotal: 7 });
    expect(stockRowsFromItems([{ ...base, inventory: null }], () => "X")).toEqual([]);
    expect(stockRowsFromItems([base], () => undefined)).toEqual([]);
  });

  it("cantidades negativas o decimales se truncan a entero ≥ 0 (el motor rechaza negativos)", () => {
    const raro: AlegraItem = {
      ...base,
      inventory: {
        warehouses: [
          { id: "1", name: "Principal", availableQuantity: -2 },
          { id: "2", name: "CUTIS", availableQuantity: 2.7 },
        ],
      },
    };
    expect(stockRowsFromItems([raro], () => "X")[0]).toMatchObject({ qtyPrincipal: 0, qtyTotal: 2 });
  });

  it("numera las filas de forma correlativa saltándose las omitidas", () => {
    const rows = stockRowsFromItems([base, { ...base, id: "2" }, { ...base, id: "3" }], (id) =>
      id === "2" ? undefined : `Producto ${id}`,
    );
    expect(rows.map((r) => r.rowNumber)).toEqual([1, 2]);
    expect(rows.map((r) => r.name)).toEqual(["Producto 1288", "Producto 3"]);
  });

  it("ignora almacenes que no sean el 1 y el 2", () => {
    const conTercero: AlegraItem = {
      ...base,
      inventory: {
        warehouses: [
          { id: "1", name: "Principal", availableQuantity: 2 },
          { id: "2", name: "CUTIS", availableQuantity: 1 },
          { id: "3", name: "OTRO", availableQuantity: 99 },
        ],
      },
    };
    expect(stockRowsFromItems([conTercero], () => "X")[0]).toMatchObject({ qtyPrincipal: 2, qtyTotal: 3 });
  });
});
