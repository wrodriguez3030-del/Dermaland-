// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  ReportHeader,
  ReportSummaryCards,
  ReportFiltersSummary,
  ReportFooter,
  ReportEmptyState,
  ReportBadge,
} from "./report-layout";

afterEach(cleanup);

describe("ReportHeader", () => {
  it("muestra negocio, título y generado por", () => {
    render(
      <ReportHeader
        businessName="DermaLand"
        title="Reporte de ventas"
        subtitle="Resumen"
        generatedBy="Wilson Rodríguez"
        generatedAt="29 jun 2026 14:00"
      />,
    );
    expect(screen.getByText("DermaLand")).toBeInTheDocument();
    expect(screen.getByText("Reporte de ventas")).toBeInTheDocument();
    expect(screen.getByText("Wilson Rodríguez")).toBeInTheDocument();
    // Iniciales del logo cuando no hay imagen
    expect(screen.getByText("D")).toBeInTheDocument();
  });
});

describe("ReportSummaryCards", () => {
  it("renderiza un KPI por item con su valor y etiqueta", () => {
    render(
      <ReportSummaryCards
        items={[
          { label: "Total facturado", value: "RD$1,000.00", tone: "primary" },
          { label: "Transacciones", value: 12 },
        ]}
      />,
    );
    expect(screen.getByText("RD$1,000.00")).toBeInTheDocument();
    expect(screen.getByText("Total facturado")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });
});

describe("ReportFiltersSummary", () => {
  it("muestra 'Sin filtros aplicados' cuando no hay filtros", () => {
    render(<ReportFiltersSummary filters={[]} />);
    expect(screen.getByText("Sin filtros aplicados")).toBeInTheDocument();
  });

  it("lista los filtros activos", () => {
    render(
      <ReportFiltersSummary
        filters={[
          { label: "Sucursal", value: "Principal" },
          { label: "Estado", value: "Pagada" },
        ]}
      />,
    );
    expect(screen.getByText("Principal")).toBeInTheDocument();
    expect(screen.getByText("Pagada")).toBeInTheDocument();
  });
});

describe("ReportEmptyState / ReportBadge / ReportFooter", () => {
  it("estado vacío muestra el mensaje", () => {
    render(<ReportEmptyState message="No hay datos." />);
    expect(screen.getByText("No hay datos.")).toBeInTheDocument();
  });

  it("badge renderiza su contenido", () => {
    render(<ReportBadge tone="high">Agotado</ReportBadge>);
    expect(screen.getByText("Agotado")).toBeInTheDocument();
  });

  it("footer muestra negocio y nombre del reporte", () => {
    render(
      <ReportFooter
        businessName="DermaLand"
        reportName="Reporte de inventario"
        generatedAt="29 jun 2026"
      />,
    );
    expect(screen.getByText("DermaLand")).toBeInTheDocument();
    expect(screen.getByText("Reporte de inventario")).toBeInTheDocument();
  });
});
