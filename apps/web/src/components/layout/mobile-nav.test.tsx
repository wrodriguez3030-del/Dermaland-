// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/features/tenancy/branch-store", () => ({
  useCurrentBranch: () => ({
    branchId: "b1",
    branches: [
      { id: "b1", name: "DermaLand Principal" },
      { id: "b2", name: "Cutis" },
    ],
    setBranchId: vi.fn(),
  }),
}));

import { MobileNav } from "./mobile-nav";

afterEach(cleanup);

describe("MobileNav", () => {
  it("1. muestra el botón hamburguesa", () => {
    render(<MobileNav />);
    expect(screen.getByRole("button", { name: "Abrir menú" })).toBeInTheDocument();
  });

  it("2 y 3. al abrir muestra los módulos y el selector de sucursal", () => {
    render(<MobileNav />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
    // Módulos principales visibles.
    expect(screen.getByText("Ventas")).toBeInTheDocument();
    expect(screen.getByText("Inventario")).toBeInTheDocument();
    expect(screen.getByText("Inventario físico")).toBeInTheDocument();
    expect(screen.getByText("Reportes")).toBeInTheDocument();
    // Selector de sucursal (sincronizado con header/POS por el store).
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "DermaLand Principal" })).toBeInTheDocument();
    // Botón cerrar.
    expect(screen.getByRole("button", { name: "Cerrar menú" })).toBeInTheDocument();
  });

  it("10. incluye Súper Admin en el menú si tiene permiso", () => {
    render(<MobileNav showSuperAdmin />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
    expect(screen.getByText("Súper Admin")).toBeInTheDocument();
  });

  it("10b. oculta Súper Admin si NO tiene permiso", () => {
    render(<MobileNav showSuperAdmin={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
    expect(screen.queryByText("Súper Admin")).not.toBeInTheDocument();
  });

  it("cierra con la X", () => {
    render(<MobileNav />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
    expect(screen.getByText("Ventas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar menú" }));
    expect(screen.queryByText("Ventas")).not.toBeInTheDocument();
  });
});
