// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import type { EstadoVentas, DesgloseVentasApi } from "@/features/ventas/ventas-api";

/**
 * El reporte de productos salía vacío porque leía solo `proformas`, que tiene 0
 * filas. Y no solo vacío: «Baja rotación (sin ventas)» listaba los 1 513
 * productos del catálogo como si ninguno se hubiera vendido jamás, teniendo
 * 1 248 con ventas reales en el histórico migrado. Una tabla que declara
 * muerto un producto que vende es peor que una tabla vacía.
 */

let estadoDesglose: EstadoVentas<DesgloseVentasApi>;

vi.mock("@/features/ventas/ventas-api", () => ({
  useDesgloseVentas: () => estadoDesglose,
}));
vi.mock("@/features/sales/proforma-store", () => ({ useProformas: () => [] }));
vi.mock("@/features/products/product-store", () => ({
  useProducts: () => [
    { id: "p-vendido", name: "Eucerin Protector Solar", sku: "DERM-1", minStock: 0 },
    { id: "p-parado", name: "Producto que nadie compra", sku: "DERM-2", minStock: 0 },
  ],
  useBrandsList: () => [],
  useCategoriesList: () => [],
  useLaboratoriesList: () => [],
}));
vi.mock("@/features/inventory/lot-store", () => ({
  useAllLots: () => [
    { id: "l1", productId: "p-vendido", status: "available", currentQuantity: 5, expiresAt: "2030-01-01" },
    { id: "l2", productId: "p-parado", status: "available", currentQuantity: 9, expiresAt: "2030-01-01" },
  ],
}));
vi.mock("@/features/auth/current-user", () => ({
  useCurrentUser: () => ({ fullName: "Dario" }),
}));

const { default: ReporteProductos } = await import("./page");

const MIGRADOS: DesgloseVentasApi = {
  filas: [
    {
      clave: "p-vendido",
      etiqueta: "Eucerin Protector Solar",
      origen: "alegra",
      cantidad: 586,
      total: 802773.07,
    },
  ],
  fuentes: ["alegra"],
};

beforeEach(() => {
  estadoDesglose = { tipo: "listo", datos: MIGRADOS };
});
afterEach(cleanup);

describe("reporte de productos con el histórico migrado", () => {
  it("🔴 el detalle de ventas enseña los productos del histórico, no «sin ventas»", () => {
    render(<ReporteProductos />);
    expect(screen.getAllByText("Eucerin Protector Solar").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Sin ventas de productos en el período/i)).not.toBeInTheDocument();
  });

  it("🔴 un producto CON ventas migradas deja de aparecer como baja rotación", () => {
    render(<ReporteProductos />);
    // Se mira DENTRO de la sección de baja rotación, no en toda la página: el
    // catálogo de márgenes nombra a los dos productos y confundiría la cuenta.
    const seccion = screen.getByText("Baja rotación (sin ventas)").closest("section");
    expect(seccion).not.toBeNull();
    const dentro = within(seccion!);
    // El que nadie compró sí está…
    expect(dentro.getByText("Producto que nadie compra")).toBeInTheDocument();
    // …y el que vendió RD$802 773 NO está marcado como muerto.
    expect(dentro.queryByText("Eucerin Protector Solar")).not.toBeInTheDocument();
  });

  it("🔴 avisa de que solo compara contra los 200 más vendidos", () => {
    render(<ReporteProductos />);
    expect(screen.getByText(/200 productos más vendidos del histórico migrado/i)).toBeInTheDocument();
  });

  it("🔴 si el histórico falla lo dice, en vez de pasar el vacío por «sin ventas»", () => {
    estadoDesglose = { tipo: "error", mensaje: "No se pudo cargar el histórico migrado de Alegra." };
    render(<ReporteProductos />);
    expect(screen.getByText(/No se pudo cargar el histórico migrado/i)).toBeInTheDocument();
  });
});
