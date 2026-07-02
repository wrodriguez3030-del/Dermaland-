// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FilterBar } from "./filter-bar";

afterEach(cleanup);

describe("FilterBar (colapsable en móvil)", () => {
  it("muestra el botón Filtros y alterna aria-expanded al tocarlo", () => {
    render(
      <FilterBar>
        <input placeholder="buscar" />
      </FilterBar>,
    );
    const btn = screen.getByRole("button", { name: /Filtros/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("los filtros hijos siempre están en el DOM (visibles en desktop vía md:flex)", () => {
    render(
      <FilterBar>
        <input placeholder="buscar" />
      </FilterBar>,
    );
    expect(screen.getByPlaceholderText("buscar")).toBeInTheDocument();
  });
});
