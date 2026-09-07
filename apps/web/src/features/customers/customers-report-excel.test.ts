import { describe, it, expect } from "vitest";
import type { Customer, Proforma } from "@/types";
import { computeCustomersReport } from "./customer-metrics";
import { buildCustomersWorkbookSpec } from "./customers-report-excel";
import {
  ALCANCE_TOTAL_GASTADO,
  ETIQUETA_TOTAL_GASTADO,
  ETIQUETA_TOTAL_GASTADO_ACUMULADO,
} from "./alcance-total-gastado";
import type { ReportMeta } from "@/lib/reports/excel/types";

const META: ReportMeta = {
  title: "Reporte de clientes",
  rangeLabel: "Todo",
  branchLabel: "Todas las sucursales",
  filtersLabel: "Sin filtros adicionales",
  generatedBy: "Wilson Rodríguez",
  generatedAtLabel: "06/07/2026 04:00 p. m.",
};

function customer(o: Partial<Customer>): Customer {
  return {
    id: "c1",
    businessId: "b",
    customerNumber: "CLI-420678",
    firstName: "WILLIAN R",
    lastName: "RODRIGUEZ",
    documentNumber: "031-0327428-2",
    phone: "829-714-1975",
    source: "manual",
    tags: [],
    defaultBillingType: "consumo",
    skinType: "normal",
    totalSpent: 0,
    totalOrders: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    consents: [],
    ...o,
  } as Customer;
}

function sale(o: Partial<Proforma>): Proforma {
  return {
    id: `p_${Math.random().toString(36).slice(2, 8)}`,
    businessId: "b",
    branchId: "br_1",
    number: "B0200001247",
    customerName: "WILLIAN R RODRIGUEZ",
    cashierId: "u",
    cashierName: "Rosa",
    items: [],
    subtotal: 100,
    discount: 0,
    itbis: 18,
    total: 2181.75,
    paid: 2181.75,
    balance: 0,
    status: "paid",
    documentKind: "invoice",
    payments: [],
    createdAt: "2026-07-03T10:00:00Z",
    updatedAt: "2026-07-03T10:00:00Z",
    ...o,
  } as Proforma;
}

describe("buildCustomersWorkbookSpec — paridad con perfil/pantalla", () => {
  const willian = customer({ id: "cust_willian" });
  const sales = Array.from({ length: 16 }, (_, i) =>
    sale({ id: `v${i}`, customerId: "cust_willian", total: 2181.75 }),
  );
  const rows = computeCustomersReport([willian], sales);
  const spec = buildCustomersWorkbookSpec(rows, META);

  it("genera las hojas esperadas", () => {
    expect(spec.sheets.map((s) => s.name)).toEqual([
      "Resumen",
      "Clientes por gasto",
      "Clientes frecuentes",
      "Ticket promedio",
      "Última visita",
      "Segmentación",
    ]);
  });

  it("total gastado y compras coinciden con la capa de métricas (16 / 34908)", () => {
    const table = spec.sheets[1]!.tables[0]!;
    const row = table.rows[0]!;
    expect(row.purchases).toBe(16);
    expect(Number(row.totalSpent)).toBeCloseTo(34908, 2);
    expect(table.totals!.purchases).toBe(16);
    expect(Number(table.totals!.totalSpent)).toBeCloseTo(34908, 2);
  });

  it("KPI Resumen: total acumulado = suma de filas", () => {
    const kpis = spec.sheets[0]!.kpis!;
    const total = kpis.find((k) => k.label === ETIQUETA_TOTAL_GASTADO_ACUMULADO);
    expect(Number(total!.value)).toBeCloseTo(34908, 2);
  });

  it("🔴 TODAS las hojas dicen que el gasto es solo del sistema (sin Alegra)", () => {
    // El Excel sale del edificio. Su columna de dinero cuenta solo `proformas`
    // —con `proformas` a 0 filas, un cliente con 172 facturas migradas exporta
    // RD$0.00— mientras la ficha de ese mismo cliente enseña RD$X bajo la
    // MISMA etiqueta. `TableSpec` no tiene clave de nota: el único texto que el
    // motor pinta encima de una tabla es su `title`, y ahí va el alcance.
    expect(ALCANCE_TOTAL_GASTADO).toContain("solo las ventas del sistema");
    for (const hoja of spec.sheets) {
      for (const tabla of hoja.tables) {
        if (tabla.columns.some((c) => c.key === "totalSpent")) {
          expect(tabla.title).toContain(ALCANCE_TOTAL_GASTADO);
          // Contra el literal: si la constante se renombrara a «Total gastado»
          // volvería la colisión con la ficha y la prueba tiene que verlo.
          const columna = tabla.columns.find((c) => c.key === "totalSpent")!;
          expect(columna.header).toBe("Total gastado (sistema)");
          expect(columna.header).toBe(ETIQUETA_TOTAL_GASTADO);
        }
      }
    }
  });

  it("nunca usa la columna estática totalSpent del cliente", () => {
    const stale = customer({ id: "cust_willian", totalSpent: 99999, totalOrders: 99 });
    const r = computeCustomersReport([stale], sales);
    const s = buildCustomersWorkbookSpec(r, META);
    expect(Number(s.sheets[1]!.tables[0]!.rows[0]!.totalSpent)).toBeCloseTo(34908, 2);
  });
});
