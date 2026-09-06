// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EtiquetaOrigen } from "./etiqueta-origen";

describe("etiqueta de origen de una venta", () => {
  it("una venta de Alegra se ve marcada como migrada (texto visible)", () => {
    render(<EtiquetaOrigen origen="alegra" />);
    // El texto visible debe decir que es histórico, no solo el nombre del sistema.
    // En tabletas no hay hover, así que el title no se ve: importa lo que dice el texto.
    expect(screen.getByText(/Migrada/i)).toBeTruthy();
    expect(screen.getByText(/Alegra/i)).toBeTruthy();
  });

  it("una venta del sistema no lleva etiqueta: es lo normal", () => {
    // Marcar lo normal convierte la etiqueta en ruido y deja de avisar.
    const { container } = render(<EtiquetaOrigen origen="sistema" />);
    expect(container.textContent?.trim()).toBe("");
  });

  it("el title explica que es histórico y no editable", () => {
    render(<EtiquetaOrigen origen="alegra" />);
    expect(screen.getByTitle(/migrad/i)).toBeTruthy();
  });
});
