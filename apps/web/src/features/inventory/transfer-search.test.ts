import { describe, it, expect } from "vitest";
import {
  matchesTransferSearch,
  type TransferSearchable,
  type ProductRef,
} from "./transfer-search";

const t: TransferSearchable = {
  transferNumber: "TR-0001",
  createdByName: "Rosa Peralta",
  items: [
    { productId: "p1", lotNumber: "L-2401" },
    { productId: "p2", lotNumber: "L-9988" },
  ],
};

const catalog: Record<string, ProductRef> = {
  p1: { name: "RADIOCARE Gel 100ml", barcode: "3282770396560" },
  p2: { name: "A-derma Crema", barcode: "7501234567890" },
};
const lookup = (id: string): ProductRef | undefined => catalog[id];

describe("matchesTransferSearch", () => {
  it("término vacío devuelve true", () => {
    expect(matchesTransferSearch(t, "", lookup)).toBe(true);
    expect(matchesTransferSearch(t, "   ", lookup)).toBe(true);
  });

  it("matchea por número de transferencia", () => {
    expect(matchesTransferSearch(t, "tr-0001", lookup)).toBe(true);
  });

  it("matchea por usuario", () => {
    expect(matchesTransferSearch(t, "rosa", lookup)).toBe(true);
  });

  it("matchea por NOMBRE de producto (regresión: antes fallaba)", () => {
    expect(matchesTransferSearch(t, "RADIOCARE", lookup)).toBe(true);
    expect(matchesTransferSearch(t, "radiocare", lookup)).toBe(true);
  });

  it("matchea por CÓDIGO DE BARRA de producto", () => {
    expect(matchesTransferSearch(t, "3282770396560", lookup)).toBe(true);
    expect(matchesTransferSearch(t, "328277", lookup)).toBe(true);
  });

  it("matchea por número de lote", () => {
    expect(matchesTransferSearch(t, "L-9988", lookup)).toBe(true);
  });

  it("no matchea un término que no está en ningún campo", () => {
    expect(matchesTransferSearch(t, "isispharma", lookup)).toBe(false);
  });

  it("tolera productos no encontrados en el lookup", () => {
    const missing = (): ProductRef | undefined => undefined;
    // Sin lookup el nombre no matchea, pero el lote sí sigue funcionando.
    expect(matchesTransferSearch(t, "L-2401", missing)).toBe(true);
    expect(matchesTransferSearch(t, "RADIOCARE", missing)).toBe(false);
  });
});
