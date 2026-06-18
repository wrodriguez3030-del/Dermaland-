// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import NumeracionesPage from "./page";
import { clearLocalNumberings } from "@/features/dgii/numbering-store";

beforeEach(() => {
  window.localStorage.clear();
  clearLocalNumberings();
});
afterEach(cleanup);

describe("Numeraciones / Secuencias e-NCF", () => {
  it("muestra la columna Acciones y el botón Nueva numeración", () => {
    render(<NumeracionesPage />);
    expect(screen.getByText("Acciones")).toBeInTheDocument();
    expect(screen.getByText("Nueva numeración")).toBeInTheDocument();
  });

  it("mantiene el aviso de numeraciones no fiscales", () => {
    render(<NumeracionesPage />);
    expect(screen.getByText("mock/demo")).toBeInTheDocument();
  });

  it("cada fila tiene acciones con aria-label (Ver/Editar) e Historial", () => {
    render(<NumeracionesPage />);
    expect(screen.getAllByLabelText("Ver").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Editar").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Historial / uso").length).toBeGreaterThan(0);
  });

  it("Ver abre el detalle de la numeración (modal)", () => {
    render(<NumeracionesPage />);
    fireEvent.click(screen.getAllByLabelText("Ver")[0]!);
    expect(screen.getByText("Detalle de numeración")).toBeInTheDocument();
    expect(screen.getByText("Uso")).toBeInTheDocument();
  });

  it("Nueva numeración abre el formulario de creación", () => {
    render(<NumeracionesPage />);
    fireEvent.click(screen.getByText("Nueva numeración"));
    expect(screen.getByText("Nueva numeración", { selector: "h2" })).toBeInTheDocument();
  });
});
