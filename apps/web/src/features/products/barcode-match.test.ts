import { describe, it, expect } from "vitest";
import { barcodeVariants, sameBarcode, findByBarcodeOrSku } from "./barcode-match";

describe("barcodeVariants", () => {
  it("un UPC-A de 12 dígitos equivale al EAN-13 con cero delante", () => {
    expect(barcodeVariants("390205022878")).toEqual(["390205022878", "0390205022878"]);
  });

  it("un EAN-13 que empieza por 0 equivale al UPC-A sin el cero", () => {
    expect(barcodeVariants("0390205022878")).toEqual(["0390205022878", "390205022878"]);
  });

  it("un EAN-13 que NO empieza por 0 solo se representa a sí mismo", () => {
    expect(barcodeVariants("8413400011422")).toEqual(["8413400011422"]);
  });

  it("recorta espacios y no inventa variantes para SKU ni códigos cortos", () => {
    expect(barcodeVariants("  DERM-I00427 ")).toEqual(["DERM-I00427"]);
    expect(barcodeVariants("8400001")).toEqual(["8400001"]);
    expect(barcodeVariants("")).toEqual([]);
  });
});

describe("sameBarcode", () => {
  it("empareja el código guardado con cero delante contra el escaneo de 12 dígitos (Elta MD UV Sport, 2026-09-05)", () => {
    expect(sameBarcode("0390205022878", "390205022878")).toBe(true);
    expect(sameBarcode("390205022878", "0390205022878")).toBe(true);
  });

  it("no empareja códigos distintos ni vacíos", () => {
    expect(sameBarcode("0390205022878", "0390205022879")).toBe(false);
    expect(sameBarcode(null, "390205022878")).toBe(false);
    expect(sameBarcode("", "")).toBe(false);
  });
});

describe("findByBarcodeOrSku", () => {
  const items = [
    { id: "elta", sku: "DERM-I00427", barcode: "0390205022878" },
    { id: "bella", sku: "DERM-I00213", barcode: "8413400011422" },
    { id: "sinCodigo", sku: "DERM-000650", barcode: null },
  ];

  it("encuentra por código de barras exacto y por su variante UPC-A/EAN-13", () => {
    expect(findByBarcodeOrSku(items, "0390205022878")?.id).toBe("elta");
    expect(findByBarcodeOrSku(items, "390205022878")?.id).toBe("elta");
    expect(findByBarcodeOrSku(items, "8413400011422")?.id).toBe("bella");
  });

  it("cae al SKU sin distinguir mayúsculas cuando no hay código de barras", () => {
    expect(findByBarcodeOrSku(items, "derm-000650")?.id).toBe("sinCodigo");
  });

  it("devuelve undefined si nada coincide o el código viene vacío", () => {
    expect(findByBarcodeOrSku(items, "0000000000000")).toBeUndefined();
    expect(findByBarcodeOrSku(items, "   ")).toBeUndefined();
  });
});
