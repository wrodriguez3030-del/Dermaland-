// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ProductForm } from "./product-form";

// El formulario navega con useRouter; en test no hay App Router context.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

afterEach(cleanup);
beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* noop */
  }
});

describe("ProductForm — Precio y costo (auto)", () => {
  it("1. orden visual: Costo → ITBIS → Margen → Precio", () => {
    const { container } = render(<ProductForm mode="create" />);
    const html = container.innerHTML;
    const iCost = html.indexOf("Costo por unidad (DOP)");
    const iItbis = html.indexOf("ITBIS (%)");
    const iMargin = html.indexOf("Margen (%)");
    const iPrice = html.indexOf("Precio de venta (DOP)");
    expect(iCost).toBeGreaterThanOrEqual(0);
    expect(iCost).toBeLessThan(iItbis);
    expect(iItbis).toBeLessThan(iMargin);
    expect(iMargin).toBeLessThan(iPrice);
  });

  it("2. margen por defecto = 30%", () => {
    render(<ProductForm mode="create" />);
    const marginInput = screen.getByPlaceholderText("30") as HTMLInputElement;
    expect(marginInput.value).toBe("30");
  });

  it("3-6. costo 1000 + ITBIS 18% + margen 30% ⇒ precio 1534.00 (readonly)", () => {
    render(<ProductForm mode="create" />);
    // Precio arranca en 0.00 (sin costo) y es readonly (§5/§9).
    const price = screen.getByDisplayValue("0.00") as HTMLInputElement;
    expect(price).toHaveAttribute("readonly");

    fireEvent.change(screen.getByPlaceholderText("1000.00"), { target: { value: "1000" } });
    expect(screen.getByDisplayValue("1534.00")).toBeInTheDocument();
  });

  it("4. cambiar el ITBIS a 0% recalcula el precio (1300.00)", () => {
    render(<ProductForm mode="create" />);
    fireEvent.change(screen.getByPlaceholderText("1000.00"), { target: { value: "1000" } });
    // Select de ITBIS: cambiar a 0.
    const itbis = screen.getByDisplayValue("18%") as HTMLSelectElement;
    fireEvent.change(itbis, { target: { value: "0" } });
    expect(screen.getByDisplayValue("1300.00")).toBeInTheDocument();
  });

  it("5. cambiar el margen recalcula el precio (margen 0 ⇒ costo con ITBIS 1180.00)", () => {
    render(<ProductForm mode="create" />);
    fireEvent.change(screen.getByPlaceholderText("1000.00"), { target: { value: "1000" } });
    fireEvent.change(screen.getByPlaceholderText("30"), { target: { value: "0" } });
    expect(screen.getByDisplayValue("1180.00")).toBeInTheDocument();
  });

  it("9/10. el override manual (ADMIN) está disponible para el usuario admin", () => {
    render(<ProductForm mode="create" />);
    expect(screen.getByText(/Fijar precio manual/i)).toBeInTheDocument();
  });
});
