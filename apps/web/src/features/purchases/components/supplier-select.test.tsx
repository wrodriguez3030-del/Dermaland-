// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/features/products/catalog-store", () => ({
  useLaboratoriesList: () => [
    { id: "l1", name: "ISDIN", country: "España" },
    { id: "l2", name: "La Roche-Posay", country: "Francia" },
    { id: "l3", name: "Laboratorios Rowe", country: "República Dominicana" },
  ],
}));

import { SupplierSelect } from "./supplier-select";

afterEach(cleanup);

describe("SupplierSelect (Proveedor)", () => {
  it("1-2. muestra el combobox con placeholder y buscador vacío", () => {
    render(<SupplierSelect value="" onChange={vi.fn()} />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("placeholder", "Buscar proveedor o laboratorio...");
    expect(input).toHaveValue("");
  });

  it("3-4. busca laboratorios existentes y seleccionar llena el campo", () => {
    const onChange = vi.fn();
    render(<SupplierSelect value="" onChange={onChange} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "isdin" } }); // ignora mayúsculas
    fireEvent.mouseDown(screen.getByText("ISDIN"));
    expect(onChange).toHaveBeenCalledWith("ISDIN");
  });

  it("6. permite usar un proveedor libre que no está en el catálogo", () => {
    const onChange = vi.fn();
    render(<SupplierSelect value="" onChange={onChange} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Distribuidora XYZ" } });
    fireEvent.mouseDown(screen.getByText(/Usar .*Distribuidora XYZ.* como proveedor/));
    expect(onChange).toHaveBeenCalledWith("Distribuidora XYZ");
  });

  it("8. resalta cuando invalid", () => {
    render(<SupplierSelect value="" onChange={vi.fn()} invalid />);
    expect(screen.getByRole("combobox").className).toMatch(/border-rose-500/);
  });
});
