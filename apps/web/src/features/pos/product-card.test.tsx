// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ProductCard } from "./product-card";

afterEach(cleanup);

const BASE = {
  name: "A-derma Crema DE Ducha Hidratante 500 ML",
  sku: "DERM-I00059",
  price: 850,
  minStock: 5,
  onAdd: () => {},
  onViewBranchStock: () => {},
};

describe("ProductCard — POS", () => {
  it("con stock vendible muestra badge y botón Agregar activo", () => {
    render(
      <ProductCard {...BASE} stockHere={130} availableElsewhere={false} lotNumber="L1" />,
    );
    expect(screen.getByText("130 unid. aquí")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /Agregar .* al carrito/ });
    expect(btn).toBeEnabled();
  });

  it("click en la TARJETA agrega al carrito", () => {
    const onAdd = vi.fn();
    render(
      <ProductCard {...BASE} onAdd={onAdd} stockHere={130} availableElsewhere={false} />,
    );
    // Click sobre el nombre → burbujea al contenedor clickable.
    fireEvent.click(screen.getByText(BASE.name));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("click en el BOTÓN Agregar agrega al carrito", () => {
    const onAdd = vi.fn();
    render(
      <ProductCard {...BASE} onAdd={onAdd} stockHere={10} availableElsewhere={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Agregar .* al carrito/ }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("dos clicks llaman onAdd dos veces (el incremento lo maneja el carrito)", () => {
    const onAdd = vi.fn();
    render(
      <ProductCard {...BASE} onAdd={onAdd} stockHere={10} availableElsewhere={false} />,
    );
    const btn = screen.getByRole("button", { name: /Agregar .* al carrito/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onAdd).toHaveBeenCalledTimes(2);
  });

  it("sin stock aquí pero disponible en otra sucursal: botón 'Ver stock' → onViewBranchStock", () => {
    const onAdd = vi.fn();
    const onViewBranchStock = vi.fn();
    render(
      <ProductCard
        {...BASE}
        onAdd={onAdd}
        onViewBranchStock={onViewBranchStock}
        stockHere={0}
        availableElsewhere
      />,
    );
    expect(screen.getByText("Sin stock aquí")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ver stock/ }));
    expect(onViewBranchStock).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("sin stock en ninguna sucursal: botón desactivado y no dispara acciones", () => {
    const onAdd = vi.fn();
    const onViewBranchStock = vi.fn();
    render(
      <ProductCard
        {...BASE}
        onAdd={onAdd}
        onViewBranchStock={onViewBranchStock}
        stockHere={0}
        availableElsewhere={false}
      />,
    );
    const btn = screen.getByRole("button", { name: /sin stock/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    fireEvent.click(screen.getByText(BASE.name));
    expect(onAdd).not.toHaveBeenCalled();
    expect(onViewBranchStock).not.toHaveBeenCalled();
  });

  it("muestra la razón de bloqueo (cuarentena) cuando aplica", () => {
    render(
      <ProductCard
        {...BASE}
        stockHere={0}
        availableElsewhere={false}
        blockLabel="Lote en cuarentena"
      />,
    );
    expect(screen.getAllByText("Lote en cuarentena").length).toBeGreaterThan(0);
  });

  it("no muestra almacén/warehouse ni UUIDs", () => {
    render(<ProductCard {...BASE} stockHere={130} availableElsewhere={false} />);
    const txt = document.body.textContent ?? "";
    expect(txt).not.toMatch(/almac[eé]n/i);
    expect(txt).not.toMatch(/warehouse/i);
    expect(txt).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });
});
