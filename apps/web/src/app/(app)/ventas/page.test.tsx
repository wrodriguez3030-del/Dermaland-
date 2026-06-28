// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import VentasPage from "./page";

afterEach(cleanup);

describe("Ventas / Facturas — acceso al POS", () => {
  it("muestra el botón 'POS / Nueva venta' que enlaza a /pos", () => {
    render(<VentasPage />);
    const btn = screen.getByText("POS / Nueva venta");
    expect(btn).toBeInTheDocument();
    // El botón vive dentro de un <a href="/pos">.
    const link = btn.closest("a");
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute("href", "/pos");
    expect(link).toHaveAttribute("aria-label", "Ir a POS / Nueva venta");
  });
});
