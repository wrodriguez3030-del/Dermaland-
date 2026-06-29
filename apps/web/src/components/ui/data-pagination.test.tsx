// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, renderHook, act } from "@testing-library/react";
import {
  DataPagination,
  paginationBounds,
  usePagination,
} from "./data-pagination";

afterEach(cleanup);

describe("paginationBounds", () => {
  it("calcula límites y total de páginas", () => {
    expect(paginationBounds(1, 25, 1354)).toMatchObject({
      totalPages: 55,
      current: 1,
      from: 1,
      to: 25,
    });
    expect(paginationBounds(55, 25, 1354)).toMatchObject({ from: 1351, to: 1354 });
  });

  it("maneja lista vacía", () => {
    expect(paginationBounds(1, 25, 0)).toMatchObject({
      totalPages: 1,
      from: 0,
      to: 0,
    });
  });

  it("clampa páginas fuera de rango", () => {
    expect(paginationBounds(99, 25, 1354).current).toBe(55);
  });
});

describe("DataPagination (componente)", () => {
  const setup = (props: Partial<React.ComponentProps<typeof DataPagination>> = {}) => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    render(
      <DataPagination
        page={1}
        pageSize={25}
        total={1354}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        {...props}
      />,
    );
    return { onPageChange, onPageSizeChange };
  };

  it("1. muestra el total correcto con el texto esperado", () => {
    setup();
    expect(
      screen.getByText(/Mostrando/).textContent?.replace(/\s+/g, " "),
    ).toContain("de 1,354 registros");
    expect(screen.getByText(/1–25/)).toBeInTheDocument();
  });

  it("2. cambiar página llama onPageChange", () => {
    const { onPageChange } = setup();
    fireEvent.click(screen.getByLabelText("Página siguiente"));
    expect(onPageChange).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByLabelText("Última página"));
    expect(onPageChange).toHaveBeenCalledWith(55);
  });

  it("3. cambiar pageSize llama onPageSizeChange", () => {
    const { onPageSizeChange } = setup();
    fireEvent.change(screen.getByLabelText("Registros por página"), {
      target: { value: "50" },
    });
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it("deshabilita Anterior/Primera en la primera página", () => {
    setup({ page: 1 });
    expect(screen.getByLabelText("Primera página")).toBeDisabled();
    expect(screen.getByLabelText("Página anterior")).toBeDisabled();
    expect(screen.getByLabelText("Página siguiente")).not.toBeDisabled();
  });

  it("muestra estado de carga sin filtrar datos técnicos", () => {
    setup({ isLoading: true });
    expect(screen.getByText("Cargando registros…")).toBeInTheDocument();
  });
});

describe("usePagination (hook)", () => {
  const items = Array.from({ length: 1354 }, (_, i) => i + 1);

  it("4. rebana la página actual sin tocar el orden", () => {
    const { result } = renderHook(() => usePagination(items));
    expect(result.current.pageSize).toBe(25);
    expect(result.current.total).toBe(1354);
    expect(result.current.pageItems[0]).toBe(1);
    expect(result.current.pageItems).toHaveLength(25);
    act(() => result.current.setPage(2));
    expect(result.current.pageItems[0]).toBe(26);
  });

  it("5. cambiar pageSize resetea a la página 1", () => {
    const { result } = renderHook(() => usePagination(items));
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    act(() => result.current.setPageSize(50));
    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(50);
    expect(result.current.pageItems).toHaveLength(50);
  });

  it("6. cambiar resetKey (filtros) resetea a la página 1", () => {
    const { result, rerender } = renderHook(
      ({ key }) => usePagination(items, { resetKey: key }),
      { initialProps: { key: "a" } },
    );
    act(() => result.current.setPage(4));
    expect(result.current.page).toBe(4);
    rerender({ key: "b" }); // cambió el filtro
    expect(result.current.page).toBe(1);
  });

  it("se ajusta si la lista encoge por debajo de la página actual", () => {
    const { result, rerender } = renderHook(
      ({ data }: { data: number[] }) => usePagination(data),
      { initialProps: { data: items } },
    );
    act(() => result.current.setPage(55));
    expect(result.current.page).toBe(55);
    rerender({ data: items.slice(0, 30) }); // ahora solo 2 páginas
    expect(result.current.page).toBe(2);
    expect(result.current.total).toBe(30);
  });

  it("respeta initialPageSize", () => {
    const { result } = renderHook(() => usePagination(items, { initialPageSize: 10 }));
    expect(result.current.pageSize).toBe(10);
    expect(result.current.pageItems).toHaveLength(10);
  });
});
