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
    expect(nota).toContain("histórico migrado de Alegra");
    expect(nota).toContain("suma las ventas del sistema y el histórico migrado");
    expect(nota).toBe(ALCANCE_TOTAL_GASTADO);
  });

  it("🔴 la columna de dinero se llama igual que en pantalla y en el Excel", () => {
    // Contra el LITERAL, no contra la constante: comparar la constante consigo
    // misma pasaría aunque alguien la cambiara y dejara los tres sitios
    // diciendo cosas distintas, que es justo lo que hay que impedir.
    const columna = spec.sections[0]!.table.columns.find((c) => c.key === "totalSpent");
    expect(columna!.header).toBe("Total gastado");
    expect(columna!.header).toBe(ETIQUETA_TOTAL_GASTADO);
  });
});
