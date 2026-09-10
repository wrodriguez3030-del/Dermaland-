// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SellerSelect } from "./seller-select";
import type { SellerOption } from "@/features/sales/seller-store";

afterEach(cleanup);

const VENDEDOR: SellerOption = {
  id: "s1",
  name: "Desteny Reynoso",
  role: "vendedor",
  branchIds: ["br1"],
};

describe("SellerSelect", () => {
  it("clic en el trigger abre el listado de vendedores", () => {
    render(<SellerSelect sellers={[VENDEDOR]} value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Buscar o seleccionar vendedor/ }));
    expect(screen.getByText("Desteny Reynoso")).toBeInTheDocument();
  });

  it("seleccionar un vendedor llama onChange y cierra el desplegable", () => {
    const onChange = vi.fn();
    render(<SellerSelect sellers={[VENDEDOR]} value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Buscar o seleccionar vendedor/ }));
    fireEvent.click(screen.getByText("Desteny Reynoso"));
    expect(onChange).toHaveBeenCalledWith(VENDEDOR);
  });

  it("🔴 con un vendedor seleccionado (botón «Quitar»), no anida un <button> dentro de otro <button>", () => {
    // Mismo bug que CustomerSearchSelect, visto en vivo el 10/09/2026:
    // <button> dentro de <button> revienta la hidratación. Solo se ve con
    // `value` puesto, porque el botón "Quitar vendedor" (✕) solo existe
    // entonces.
    const { container } = render(
      <SellerSelect sellers={[VENDEDOR]} value={VENDEDOR} onChange={() => {}} />,
    );
    for (const btn of container.querySelectorAll("button")) {
      expect(btn.parentElement?.closest("button") ?? null).toBeNull();
    }
  });

  it("el botón «Quitar vendedor» llama onChange(null) sin abrir el desplegable", () => {
    const onChange = vi.fn();
    render(<SellerSelect sellers={[VENDEDOR]} value={VENDEDOR} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Quitar vendedor" }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.queryByPlaceholderText("Buscar vendedor por nombre…")).toBeNull();
  });
});
