// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EtiquetaOrigen } from "./etiqueta-origen";

describe("etiqueta de origen de una venta", () => {
  it("una venta de Alegra se ve marcada", () => {
    render(<EtiquetaOrigen origen="alegra" />);
    expect(screen.getByText(/Alegra/i)).toBeTruthy();
  });

  it("una venta del sistema no lleva etiqueta: es lo normal", () => {
    // Marcar lo normal convierte la etiqueta en ruido y deja de avisar.
    const { container } = render(<EtiquetaOrigen origen="sistema" />);
    expect(container.textContent?.trim()).toBe("");
  });

  it("la etiqueta dice que es histórico, no una venta del día", () => {
    render(<EtiquetaOrigen origen="alegra" />);
    expect(screen.getByTitle(/migrad/i)).toBeTruthy();
  });
});
