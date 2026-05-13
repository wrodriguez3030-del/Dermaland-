import { describe, expect, it } from "vitest";
import {
  getProductByBarcode,
  mockProductLots,
  selectFefoLot,
  totalStockForProduct,
} from "./catalog";
import { daysUntil } from "@/lib/utils/format";

describe("FEFO lot selection (R-INV-03)", () => {
  it("selectFefoLot devuelve el lote disponible más próximo a vencer", () => {
    // LRP Toleriane tiene 2 lotes disponibles: LRP24A (vence ~45 días) y LRP24B (~420 días)
    const lot = selectFefoLot("prod_lrp_001");
    expect(lot).toBeTruthy();
    expect(lot!.lotNumber).toBe("LRP24A");
  });

  it("selectFefoLot ignora lotes vencidos", () => {
    // Eucerin: lot_eu_002a está vencido (status=expired). Debe devolver el otro lote.
    const lot = selectFefoLot("prod_eu_002");
    expect(lot).toBeTruthy();
    expect(lot!.status).toBe("available");
    expect(daysUntil(lot!.expiresAt)).toBeGreaterThan(0);
  });

  it("selectFefoLot ignora lotes en cuarentena", () => {
    // ISDIN tiene un solo lote en cuarentena → no debe haber FEFO disponible.
    const lot = selectFefoLot("prod_isd_005");
    expect(lot).toBeUndefined();
  });

  it("selectFefoLot ignora lotes en recall", () => {
    // Isispharma tiene un solo lote en recall → tampoco.
    const lot = selectFefoLot("prod_isi_012");
    expect(lot).toBeUndefined();
  });
});

describe("Lote vencido / cuarentena bloqueados para venta (R-INV-02)", () => {
  it("totalStockForProduct cuenta solo lotes available", () => {
    // Eucerin Pigment: 6 vencidos + 28 disponibles → debe contar 28
    const stock = totalStockForProduct("prod_eu_002");
    expect(stock).toBe(28);
  });

  it("ningún lote vencido pasa el filtro de venta", () => {
    const expired = mockProductLots.filter((l) => l.status === "expired");
    expect(expired.length).toBeGreaterThan(0);
    for (const l of expired) {
      const fefo = selectFefoLot(l.productId);
      // Si hay otro lote disponible debe ser distinto al vencido.
      // Si no hay, fefo es undefined.
      if (fefo) expect(fefo.id).not.toBe(l.id);
    }
  });

  it("ningún lote en cuarentena pasa el filtro de venta", () => {
    const quarantined = mockProductLots.filter((l) => l.status === "quarantine");
    for (const l of quarantined) {
      const fefo = selectFefoLot(l.productId);
      if (fefo) expect(fefo.id).not.toBe(l.id);
    }
  });
});

describe("Búsqueda por barcode", () => {
  it("encuentra producto por barcode exacto", () => {
    const p = getProductByBarcode("8432598722845");
    expect(p?.sku).toBe("DERM-000034");
  });

  it("retorna undefined para barcode inexistente", () => {
    const p = getProductByBarcode("0000000000000");
    expect(p).toBeUndefined();
  });
});
