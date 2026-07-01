import { describe, it, expect } from "vitest";
import {
  parseSkuNumber,
  formatSku,
  nextSkuAfter,
  nextSkuFromSkus,
} from "./product-sku";

describe("product-sku", () => {
  it("formatea con ceros a 6 dígitos", () => {
    expect(formatSku(1)).toBe("DERM-000001");
    expect(formatSku(591)).toBe("DERM-000591");
    expect(formatSku(123456)).toBe("DERM-123456");
  });

  it("parsea el número del SKU e ignora los mal formados", () => {
    expect(parseSkuNumber("DERM-000591")).toBe(591);
    expect(parseSkuNumber("derm-000034")).toBe(34); // case-insensitive
    expect(parseSkuNumber("ABC-1")).toBeNull();
    expect(parseSkuNumber("DERM-XYZ")).toBeNull();
    expect(parseSkuNumber("")).toBeNull();
    expect(parseSkuNumber(null)).toBeNull();
  });

  it("3. genera DERM-000001 si no hay productos", () => {
    expect(nextSkuFromSkus([])).toBe("DERM-000001");
  });

  it("4 y 5. continúa desde el mayor SKU existente (DERM-000590 → DERM-000591)", () => {
    expect(nextSkuFromSkus(["DERM-000590"])).toBe("DERM-000591");
    expect(
      nextSkuFromSkus(["DERM-000001", "DERM-000590", "DERM-000034"]),
    ).toBe("DERM-000591");
  });

  it("ignora SKU mal formados para el cálculo del máximo (no rompe)", () => {
    expect(
      nextSkuFromSkus(["SKU-VIEJO", "DERM-000010", "codigo-externo", "DERM-000009"]),
    ).toBe("DERM-000011");
  });

  it("6. nextSkuAfter incrementa para evitar duplicados", () => {
    expect(nextSkuAfter("DERM-000591")).toBe("DERM-000592");
    expect(nextSkuAfter(null)).toBe("DERM-000001");
    expect(nextSkuAfter("basura")).toBe("DERM-000001");
  });
});
