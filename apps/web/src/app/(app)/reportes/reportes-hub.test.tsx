// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { EstadoVentas, ResumenVentasApi } from "@/features/ventas/ventas-api";

/**
 * El índice de Reportes enseña cuatro cifras del negocio. Salían de
 * `proformas`, que tiene 0 filas porque el punto de venta propio todavía no ha
 * cobrado nada: el dueño abría Reportes y veía RD$0.00 en las cuatro teniendo
 * RD$48 454 899,08 migrados de Alegra.
 *
 * Estas pruebas fijan las tres cosas que no pueden volver a pasar: que cuente
 * el histórico, que mientras viaja NO enseñe un cero con cara de dato, y que si
 * falla lo diga en vez de callarlo.
 */

let estadoResumen: EstadoVentas<ResumenVentasApi>;

vi.mock("@/features/ventas/ventas-api", () => ({
  useResumenVentas: () => estadoResumen,
}));
vi.mock("@/features/sales/proforma-store", () => ({ useProformas: () => [] }));

const { default: ReportesHub } = await import("./page");

/** Las cifras reales de producción, para que el fallo se lea con el dato bueno. */
const HISTORICO: ResumenVentasApi = {
  total: 48454899.08,
  cantidad: 14743,
  itbis: 6087880.21,
  unidades: 38358,
  porOrigen: {
    sistema: { total: 0, cantidad: 0, itbis: 0, unidades: 0 },
    alegra: { total: 48454899.08, cantidad: 14743, itbis: 6087880.21, unidades: 38358 },
  },
};

beforeEach(() => {
  estadoResumen = { tipo: "listo", datos: HISTORICO };
});
afterEach(cleanup);

describe("índice de Reportes", () => {
  it("🔴 las cuatro cifras cuentan el histórico migrado, no solo el sistema", () => {
    render(<ReportesHub />);
    // Ventas e ITBIS con el formato de la casa; unidades y transacciones crudas.
    expect(screen.getByText(/48,454,899\.08/)).toBeInTheDocument();
    expect(screen.getByText(/6,087,880\.21/)).toBeInTheDocument();
    expect(screen.getByText("38358")).toBeInTheDocument();
    expect(screen.getByText("14743")).toBeInTheDocument();
    // Y ninguna se queda en el cero del sistema.
    expect(screen.queryByText("RD$0.00")).not.toBeInTheDocument();
  });

  it("🔴 mientras el histórico viaja NO enseña un cero que parezca un dato", () => {
    estadoResumen = { tipo: "cargando" };
    render(<ReportesHub />);
    expect(screen.getAllByText("Cargando…")).toHaveLength(4);
    expect(screen.queryByText("RD$0.00")).not.toBeInTheDocument();
  });

  it("🔴 si el histórico falla lo dice, en vez de pasar el cero por el total", () => {
    estadoResumen = { tipo: "error", mensaje: "No se pudo cargar el histórico migrado de Alegra." };
    render(<ReportesHub />);
    expect(screen.getByText(/No se pudo cargar el histórico migrado/i)).toBeInTheDocument();
    expect(screen.getByText(/cuentan solo las ventas del sistema/i)).toBeInTheDocument();
  });
});
