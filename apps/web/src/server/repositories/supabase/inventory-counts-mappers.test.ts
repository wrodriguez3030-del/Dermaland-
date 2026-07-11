import { describe, it, expect } from "vitest";
import {
  inventoryCountRowToTs,
  inventoryCountItemRowToTs,
  inventoryCountScanRowToTs,
} from "./mappers";

type CountRow = Parameters<typeof inventoryCountRowToTs>[0];
type ItemRow = Parameters<typeof inventoryCountItemRowToTs>[0];
type ScanRow = Parameters<typeof inventoryCountScanRowToTs>[0];

describe("inventoryCountRowToTs", () => {
  const base = {
    id: "c1",
    business_id: "biz1",
    branch_id: "br1",
    warehouse_id: "wh1",
    count_number: "CONT-1",
    count_type: "full",
    status: "approved",
    assigned_to: ["u1", "u2"],
    started_at: "2026-07-01T09:00:00Z",
    submitted_at: null,
    reviewed_at: null,
    approved_at: "2026-07-01T12:00:00Z",
    cancelled_at: null,
    reviewed_by: null,
    approved_by: "u9",
    notes: null,
    scan_count: 3,
    item_count: 2,
    created_at: "2026-07-01T08:00:00Z",
    updated_at: "2026-07-01T12:00:00Z",
  } as unknown as CountRow;

  it("mapea snake→camel y business/branch scope", () => {
    const c = inventoryCountRowToTs(base);
    expect(c.id).toBe("c1");
    expect(c.businessId).toBe("biz1");
    expect(c.branchId).toBe("br1");
    expect(c.countNumber).toBe("CONT-1");
    expect(c.countType).toBe("full");
    expect(c.status).toBe("approved");
    expect(c.assignedTo).toEqual(["u1", "u2"]);
    expect(c.approvedBy).toBe("u9");
    expect(c.scanCount).toBe(3);
    expect(c.itemCount).toBe(2);
  });

  it("null → undefined en opcionales; assigned_to null → []", () => {
    const c = inventoryCountRowToTs({
      ...base,
      assigned_to: null,
      submitted_at: null,
      notes: null,
      reviewed_by: null,
    } as unknown as CountRow);
    expect(c.assignedTo).toEqual([]);
    expect(c.submittedAt).toBeUndefined();
    expect(c.notes).toBeUndefined();
    expect(c.reviewedBy).toBeUndefined();
  });
});

describe("inventoryCountItemRowToTs", () => {
  const base = {
    id: "i1",
    business_id: "biz1",
    inventory_count_id: "c1",
    product_id: "p1",
    product_sku: "SKU-1",
    product_name: "Crema A",
    product_lot_id: "lot1",
    lot_number: "L-1",
    expires_at: "2026-12-31",
    warehouse_id: "wh1",
    expected_quantity: 10,
    counted_quantity: 8,
    difference_quantity: -2,
    status: "shortage",
    last_scan_at: "2026-07-01T10:00:00Z",
    created_at: "2026-07-01T08:00:00Z",
    updated_at: "2026-07-01T10:00:00Z",
  } as unknown as ItemRow;

  it("mapea campos y usa difference_quantity cuando viene", () => {
    const it = inventoryCountItemRowToTs(base);
    expect(it.inventoryCountId).toBe("c1");
    expect(it.productSku).toBe("SKU-1");
    expect(it.lotNumber).toBe("L-1");
    expect(it.expiresAt).toBe("2026-12-31");
    expect(it.expectedQuantity).toBe(10);
    expect(it.countedQuantity).toBe(8);
    expect(it.differenceQuantity).toBe(-2);
  });

  it("deriva difference (contado−esperado) si viene null", () => {
    const it = inventoryCountItemRowToTs({
      ...base,
      difference_quantity: null,
      expected_quantity: 5,
      counted_quantity: 8,
    } as unknown as ItemRow);
    expect(it.differenceQuantity).toBe(3);
  });

  it("null → undefined en lote/vencimiento", () => {
    const it = inventoryCountItemRowToTs({
      ...base,
      product_lot_id: null,
      lot_number: null,
      expires_at: null,
    } as unknown as ItemRow);
    expect(it.productLotId).toBeUndefined();
    expect(it.lotNumber).toBeUndefined();
    expect(it.expiresAt).toBeUndefined();
  });
});

describe("inventoryCountScanRowToTs", () => {
  const base = {
    id: "s1",
    business_id: "biz1",
    inventory_count_id: "c1",
    product_id: "p1",
    product_lot_id: null,
    branch_id: "br1",
    warehouse_id: "wh1",
    warehouse_location_id: null,
    barcode: "8400001",
    scanned_quantity: 1,
    scan_source: "camera",
    scanned_by: null,
    scanned_by_name: null,
    scanned_at: "2026-07-01T10:00:00Z",
    device_id: "dev1",
    offline_scan_id: "off1",
    sync_status: "synced",
    notes: null,
    created_at: "2026-07-01T10:00:00Z",
  } as unknown as ScanRow;

  it("mapea y usa '' cuando scanned_by/name son null", () => {
    const s = inventoryCountScanRowToTs(base);
    expect(s.inventoryCountId).toBe("c1");
    expect(s.branchId).toBe("br1");
    expect(s.barcode).toBe("8400001");
    expect(s.scanSource).toBe("camera");
    expect(s.scannedBy).toBe("");
    expect(s.scannedByName).toBe("");
    expect(s.warehouseLocationId).toBeUndefined();
    expect(s.deviceId).toBe("dev1");
    expect(s.offlineScanId).toBe("off1");
    expect(s.syncStatus).toBe("synced");
  });
});
