import { describe, it, expect } from "vitest";
import type { Customer, Proforma } from "@/types";
import { computeCustomersReport } from "./customer-metrics";
import { buildCustomersPdfSpec } from "./customers-report-pdf";
import { ALCANCE_TOTAL_GASTADO, ETIQUETA_TOTAL_GASTADO } from "./alcance-total-gastado";
import type { ReportPdfMeta } from "@/lib/reports/pdf/types";

/**
 * El PDF del reporte de clientes sale del edificio con una columna de dinero
 * que cuenta SOLO `proformas`. Con `proformas` a 0 filas, un cliente con 172
 * facturas migradas de Alegra se exporta con RD$0.00 — y su propia ficha, a dos
 * clics, enseña RD$X bajo la MISMA etiqueta «Total gastado».
 *
 * 🔴 `footnote` a nivel de `PdfSection` es lo ÚNICO que el motor pinta bajo una
 * tabla (`server/services/reports/report-pdf.ts`); una `note` dentro de `table`
 * se descarta en silencio. Por eso la prueba mira `footnote` y no otra clave.
 */
const META: ReportPdfMeta = {
  title: "Reporte de clientes",
  reportKind: "Reporte de clientes",
  periodLabel: "TODO",
  branchLabel: "TODAS",
  businessName: "DERMALAND",
  filtersLabel: "Sin filtros adicionales",
  generatedBy: "Wilson Rodríguez",
  generatedAtLabel: "06/09/2026 04:00 p. m.",
};

const CLIENTE = {
  id: "c1",
  businessId: "b",
  customerNumber: "CLI-000001",
  firstName: "MARIA",
  lastName: "PEREZ",
  source: "manual",
  tags: [],
  defaultBillingType: "consumo",
  skinType: "normal",
  totalSpent: 0,
  totalOrders: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  consents: [],
} as unknown as Customer;

describe("buildCustomersPdfSpec — qué cuenta «Total gastado»", () => {
  const spec = buildCustomersPdfSpec(
    computeCustomersReport([CLIENTE], [] as Proforma[]),
    META,
  );

  it("🔴 la sección lleva la nota de alcance en `footnote`, la única clave que el motor pinta", () => {
    const nota = spec.sections[0]!.footnote;
    expect(nota).toContain("solo las ventas del sistema");
    expect(nota).toContain("el histórico migrado de Alegra no entra");
    expect(nota).toBe(ALCANCE_TOTAL_GASTADO);
  });

  it("🔴 la columna de dinero NO se llama «Total gastado» a secas", () => {
    // Contra el literal: comparar con la constante haría que renombrarla a
    // «Total gastado» dejara la prueba en verde con el fallo dentro.
    const columna = spec.sections[0]!.table.columns.find((c) => c.key === "totalSpent");
    expect(columna!.header).toBe("Total gastado (sistema)");
    expect(columna!.header).toBe(ETIQUETA_TOTAL_GASTADO);
    expect(spec.kpis!.map((k) => k.label)).not.toContain("Total gastado");
  });
});
