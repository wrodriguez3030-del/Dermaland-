import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import type {
  InventoryCount,
  InventoryCountItem,
  InventoryCountScan,
  InventoryMovement,
} from "@/types";
import {
  buildPhysicalCountReport,
  buildCountsList,
  type CountLookups,
} from "./physical-count-report";
import {
  physicalCountWorkbook,
  physicalCountXlsxBytes,
  physicalCountFilename,
  countsListWorkbook,
  countsListFilename,
} from "./physical-count-export";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PRODUCTS: Record<string, NonNullable<ReturnType<CountLookups["product"]>>> = {
  p1: { sku: "SKU-1", barcode: "8400001", name: "Crema A", brandId: "b1", categoryId: "c1", laboratoryId: "l1", cost: 100 },
  p2: { sku: "SKU-2", barcode: "8400002", name: "Crema B", brandId: "b1", categoryId: "c1", laboratoryId: "l1", cost: 50 },
  p3: { sku: "SKU-3", barcode: "8400003", name: "Crema C", brandId: "b2", categoryId: "c2", laboratoryId: "l2", cost: 200 },
};

const lookups: CountLookups = {
  product: (id) => PRODUCTS[id],
  lotUnitCost: () => undefined,
  brandName: (id) => ({ b1: "ISDIN", b2: "Avène" })[id ?? ""] ?? "",
  categoryName: (id) => ({ c1: "Facial", c2: "Corporal" })[id ?? ""] ?? "",
  labName: (id) => ({ l1: "Lab Uno", l2: "Lab Dos" })[id ?? ""] ?? "",
  branchName: () => "DermaLand Principal",
  userName: (id) => ({ u1: "Carlos Mejía", u2: "María Torres" })[id ?? ""] ?? "",
};

const count: InventoryCount = {
  id: "ic1",
  countNumber: "CONT-2026-05-05-001",
  businessId: "biz1",
  branchId: "br1",
  warehouseId: "wh1",
  countType: "full",
  status: "approved",
  assignedTo: ["u1"],
  startedAt: "2026-05-04T08:00:00Z",
  approvedAt: "2026-05-05T09:00:00Z",
  approvedBy: "u2",
  createdBy: "u1",
  notes: "Conteo mensual",
  scanCount: 6,
  itemCount: 3,
  createdAt: "2026-05-04T08:00:00Z",
  updatedAt: "2026-05-05T09:00:00Z",
};

function item(p: Partial<InventoryCountItem>): InventoryCountItem {
  return {
    id: p.id ?? "x",
    inventoryCountId: "ic1",
    productId: p.productId ?? "p1",
    productSku: p.productSku ?? "SKU-1",
    productName: p.productName ?? "Crema A",
    productLotId: p.productLotId ?? "lot1",
    lotNumber: p.lotNumber ?? "LRP24A",
    expiresAt: p.expiresAt ?? "2026-06-19",
    warehouseId: "wh1",
    expectedQuantity: p.expectedQuantity ?? 0,
    countedQuantity: p.countedQuantity ?? 0,
    differenceQuantity: p.differenceQuantity ?? 0,
    status: p.status ?? "match",
    lastScanAt: "2026-05-04T17:14:00Z",
  };
}

const items: InventoryCountItem[] = [
  item({ id: "i1", productId: "p1", productSku: "SKU-1", productName: "Crema A", expectedQuantity: 20, countedQuantity: 18, differenceQuantity: -2, status: "shortage" }),
  item({ id: "i2", productId: "p2", productSku: "SKU-2", productName: "Crema B", lotNumber: "L2", expectedQuantity: 10, countedQuantity: 10, differenceQuantity: 0, status: "match" }),
  item({ id: "i3", productId: "p3", productSku: "SKU-3", productName: "Crema C", lotNumber: "L3", expectedQuantity: 5, countedQuantity: 8, differenceQuantity: 3, status: "overage" }),
];

function scan(p: Partial<InventoryCountScan>): InventoryCountScan {
  return {
    id: p.id ?? "s",
    inventoryCountId: "ic1",
    productId: p.productId ?? "p1",
    productLotId: "lot1",
    branchId: "br1",
    warehouseId: "wh1",
    barcode: p.barcode ?? "8400001",
    scannedQuantity: p.scannedQuantity ?? 1,
    scanSource: p.scanSource ?? "camera",
    scannedBy: "u1",
    scannedByName: "Carlos Mejía",
    scannedAt: p.scannedAt ?? "2026-05-04T17:14:00Z",
    deviceId: "dev_pixel8",
    offlineScanId: "off_1",
    syncStatus: "synced",
  };
}

const scans: InventoryCountScan[] = [
  scan({ id: "s1", productId: "p1", scannedAt: "2026-05-04T17:10:00Z" }),
  scan({ id: "s2", productId: "p1", scannedAt: "2026-05-04T17:11:00Z" }),
  scan({ id: "s3", productId: "p3", barcode: "8400003", scannedAt: "2026-05-04T17:12:00Z" }),
  // Escaneo de un código sin producto en catálogo → "Productos no encontrados".
  scan({ id: "s4", productId: "p_unknown", barcode: "9999999", scannedAt: "2026-05-04T17:13:00Z" }),
];

const movements: InventoryMovement[] = [
  { id: "mov1", businessId: "biz1", branchId: "br1", productId: "p1", lotId: "lot1", warehouseId: "wh1", type: "adjustment_negative", quantity: -2, reason: "Ajuste por conteo físico CONT-2026-05-05-001", reference: "ic1", userId: "u2", userName: "María Torres", createdAt: "2026-05-05T09:02:00Z" },
  { id: "mov2", businessId: "biz1", branchId: "br1", productId: "p3", lotId: "lot3", warehouseId: "wh1", type: "adjustment_positive", quantity: 3, reason: "Ajuste por conteo físico CONT-2026-05-05-001 — sobrante", reference: "ic1", userId: "u2", userName: "María Torres", createdAt: "2026-05-05T09:02:00Z" },
  // Movimiento de OTRO conteo: no debe aparecer.
  { id: "mov3", businessId: "biz1", branchId: "br1", productId: "p2", warehouseId: "wh1", type: "adjustment_negative", quantity: -1, reference: "ic_otro", userId: "u2", userName: "María Torres", createdAt: "2026-05-05T09:02:00Z" },
];

function buildReport() {
  return buildPhysicalCountReport({
    count,
    items,
    scans,
    movements,
    businessName: "DermaLand",
    generatedAt: "2026-06-30T12:00:00Z",
    lookups,
  });
}

function rows(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Excel de inventario físico", () => {
  it("1 y 2-7. genera un libro con las 6 hojas requeridas", () => {
    const wb = physicalCountWorkbook(buildReport());
    expect(wb.SheetNames).toEqual([
      "Resumen",
      "Detalle contado",
      "Diferencias",
      "Escaneos",
      "Productos no encontrados",
      "Ajustes generados",
    ]);
  });

  it("2. la hoja Resumen trae negocio, código y KPIs", () => {
    const wb = physicalCountWorkbook(buildReport());
    const flat = JSON.stringify(rows(wb.Sheets["Resumen"]!));
    expect(flat).toContain("DermaLand");
    expect(flat).toContain("CONT-2026-05-05-001");
    expect(flat).toContain("TOTAL PRODUCTOS"); // bloque KPIs
    expect(flat).toContain("Conteo mensual"); // nota
  });

  it("3. Detalle contado trae todos los ítems con su estado", () => {
    const wb = physicalCountWorkbook(buildReport());
    const data = rows(wb.Sheets["Detalle contado"]!);
    expect(data[0]).toContain("Laboratorio");
    expect(data[0]).toContain("Estado");
    expect(data).toHaveLength(1 + 3); // header + 3 ítems
    const flat = JSON.stringify(data);
    expect(flat).toContain("Faltante");
    expect(flat).toContain("Correcto");
    expect(flat).toContain("Sobrante");
  });

  it("4 y 9. Diferencias solo lista ítems con diferencia y la calcula", () => {
    const wb = physicalCountWorkbook(buildReport());
    const data = rows(wb.Sheets["Diferencias"]!);
    expect(data).toHaveLength(1 + 2); // header + 2 (faltante + sobrante; no el match)
    const byProduct = Object.fromEntries(data.slice(1).map((r) => [r[0], r]));
    // Producto, SKU, Lote, Sucursal, Sistema, Contado, Diferencia, Tipo, Costo, Valor, Acción, Nota
    expect(byProduct["Crema A"]![6]).toBe(-2);
    expect(byProduct["Crema A"]![9]).toBe(-200); // -2 * 100
    expect(byProduct["Crema A"]![10]).toBe("Ajustar disminución");
    expect(byProduct["Crema C"]![6]).toBe(3);
    expect(byProduct["Crema C"]![9]).toBe(600); // 3 * 200
    expect(byProduct["Crema C"]![10]).toBe("Ajustar aumento");
  });

  it("5. Escaneos lista cada escaneo con cantidad acumulada", () => {
    const wb = physicalCountWorkbook(buildReport());
    const data = rows(wb.Sheets["Escaneos"]!);
    expect(data).toHaveLength(1 + 4);
    // p1 tiene dos escaneos: acumulada 1 luego 2 (col 9).
    const p1 = data.slice(1).filter((r) => r[2] === "Crema A");
    expect(p1.map((r) => r[9])).toEqual([1, 2]);
  });

  it("6. Productos no encontrados lista los códigos sin producto", () => {
    const wb = physicalCountWorkbook(buildReport());
    const data = rows(wb.Sheets["Productos no encontrados"]!);
    expect(data[0]).toContain("Código escaneado");
    const flat = JSON.stringify(data);
    expect(flat).toContain("9999999"); // el código sin producto
    expect(flat).toContain("Crear producto");
  });

  it("6b. Productos no encontrados muestra nota cuando no hay", () => {
    const report = buildReport();
    report.notFound = [];
    const wb = physicalCountWorkbook(report);
    const flat = JSON.stringify(rows(wb.Sheets["Productos no encontrados"]!));
    expect(flat).toContain("No se registraron códigos sin producto");
  });

  it("7. Ajustes generados lista solo los movimientos de este conteo", () => {
    const wb = physicalCountWorkbook(buildReport());
    const data = rows(wb.Sheets["Ajustes generados"]!);
    expect(data).toHaveLength(1 + 2); // mov1 + mov2 (mov3 es de otro conteo)
    const flat = JSON.stringify(data);
    expect(flat).toContain("María Torres");
    expect(flat).not.toContain("ic_otro");
  });

  it("7b. Ajustes generados muestra nota cuando no hubo ajustes", () => {
    const report = buildPhysicalCountReport({
      count, items, scans, movements: [], businessName: "DermaLand", generatedAt: "2026-06-30T12:00:00Z", lookups,
    });
    const wb = physicalCountWorkbook(report);
    const flat = JSON.stringify(rows(wb.Sheets["Ajustes generados"]!));
    expect(flat).toContain("No se generaron ajustes para este inventario físico.");
  });

  it("8. los totales/KPIs coinciden con el inventario", () => {
    const r = buildReport();
    expect(r.summary.productsShortage).toBe(1);
    expect(r.summary.productsOverage).toBe(1);
    expect(r.summary.productsMatch).toBe(1);
    expect(r.summary.shortageValue).toBe(200);
    expect(r.summary.overageValue).toBe(600);
    expect(r.summary.netDifferenceValue).toBe(400); // 600 - 200
    expect(r.summary.totalScans).toBe(4);
  });

  it("10. la lista exporta TODOS los conteos filtrados", () => {
    const list = buildCountsList([count, { ...count, id: "ic2", countNumber: "CONT-2" }, { ...count, id: "ic3", countNumber: "CONT-3" }], {
      branchName: () => "DermaLand Principal",
    });
    const wb = countsListWorkbook(list, "DermaLand", "2026-06-30T12:00:00Z");
    const data = rows(wb.Sheets["Conteos"]!);
    // 4 filas de encabezado/título + 3 conteos.
    const dataRows = data.filter((r) => String(r[0] ?? "").startsWith("CONT-"));
    expect(dataRows).toHaveLength(3);
  });

  it("11. aplica formato RD$ a los montos", () => {
    const wb = physicalCountWorkbook(buildReport());
    const resumen = wb.Sheets["Resumen"]!;
    expect(resumen["B20"]?.z).toContain("RD$"); // Valor estimado faltante
    const detalle = wb.Sheets["Detalle contado"]!;
    expect(detalle["M2"]?.z).toContain("RD$"); // Costo unitario, 1ª fila
    expect(detalle["N2"]?.z).toContain("RD$"); // Valor diferencia
  });

  it("12, 13, 14. no expone UUIDs, ni warehouse/almacén, ni SupabaseRepository", () => {
    const wb = physicalCountWorkbook(buildReport());
    const dump = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n]!)).join("\n");
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    expect(uuid.test(dump)).toBe(false);
    expect(dump).not.toContain("wh1"); // warehouse id
    expect(dump).not.toContain("br1"); // branch id
    expect(dump).not.toContain("p_unknown"); // product id
    expect(dump.toLowerCase()).not.toContain("warehouse");
    expect(dump.toLowerCase()).not.toContain("almacén");
    expect(dump).not.toContain("SupabaseRepository");
    // Sí debe mostrar los nombres legibles.
    expect(dump).toContain("DermaLand Principal");
    expect(dump).toContain("Lab Uno");
  });

  it("nombre de archivo seguro con sucursal y fecha", () => {
    expect(physicalCountFilename("DermaLand Principal", "2026-06-30T09:00:00Z")).toBe(
      "Inventario-fisico-DermaLand-Principal-2026-06-30.xlsx",
    );
    expect(countsListFilename("2026-06-30T09:00:00Z")).toBe(
      "Inventario-fisico-conteos-2026-06-30.xlsx",
    );
  });

  it("genera bytes .xlsx descargables y re-leíbles", () => {
    const bytes = physicalCountXlsxBytes(buildReport());
    const wb = XLSX.read(bytes, { type: "array" });
    expect(wb.SheetNames).toContain("Resumen");
    expect(wb.SheetNames).toContain("Ajustes generados");
  });
});
