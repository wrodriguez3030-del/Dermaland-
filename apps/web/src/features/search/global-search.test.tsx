// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { GlobalSearch } from "./global-search";
import type { GlobalSearchResults } from "./search-types";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
}));

const RESULTS: GlobalSearchResults = {
  query: "ISDIN",
  total: 2,
  groups: [
    {
      kind: "product",
      label: "Productos",
      items: [
        {
          kind: "product",
          id: "p1",
          title: "ISDIN Fotoprotector Fusion Water SPF 50",
          subtitle: "SKU DERM-000201",
          meta: "Stock: 998",
          href: "/productos/p1",
        },
      ],
    },
    {
      kind: "customer",
      label: "Clientes",
      items: [
        {
          kind: "customer",
          id: "c1",
          title: "WILLIAN R RODRIGUEZ",
          subtitle: "829-714-1975 · CLI-420678",
          href: "/clientes/c1",
        },
      ],
    },
  ],
};

beforeEach(() => {
  push.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => RESULTS,
    })) as unknown as typeof fetch,
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function typeQuery(value: string) {
  const input = screen.getByRole("searchbox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  return input;
}

describe("GlobalSearch", () => {
  it("1/3. acepta texto y muestra resultados agrupados (debounce)", async () => {
    render(<GlobalSearch />);
    typeQuery("ISDIN");
    expect(await screen.findByText("ISDIN Fotoprotector Fusion Water SPF 50")).toBeInTheDocument();
    expect(screen.getByText("Productos")).toBeInTheDocument();
    expect(screen.getByText("Clientes")).toBeInTheDocument();
    expect(screen.getByText("SKU DERM-000201")).toBeInTheDocument();
    expect(screen.getByText("Stock: 998")).toBeInTheDocument();
  });

  it("2. no dispara búsqueda con menos de 2 caracteres", async () => {
    render(<GlobalSearch />);
    typeQuery("I");
    await new Promise((r) => setTimeout(r, 400));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("14/15. click en un resultado navega a su detalle real", async () => {
    render(<GlobalSearch />);
    typeQuery("ISDIN");
    const item = await screen.findByText("ISDIN Fotoprotector Fusion Water SPF 50");
    fireEvent.click(item);
    expect(push).toHaveBeenCalledWith("/productos/p1");
  });

  it("17. Enter abre el resultado activo (primero por defecto)", async () => {
    render(<GlobalSearch />);
    const input = typeQuery("ISDIN");
    await screen.findByText("ISDIN Fotoprotector Fusion Water SPF 50");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/productos/p1");
  });

  it("17b. flecha abajo + Enter abre el segundo resultado", async () => {
    render(<GlobalSearch />);
    const input = typeQuery("ISDIN");
    await screen.findByText("ISDIN Fotoprotector Fusion Water SPF 50");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/clientes/c1");
  });

  it("18. Escape cierra el dropdown", async () => {
    render(<GlobalSearch />);
    const input = typeQuery("ISDIN");
    await screen.findByText("ISDIN Fotoprotector Fusion Water SPF 50");
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByText("ISDIN Fotoprotector Fusion Water SPF 50")).not.toBeInTheDocument(),
    );
  });

  it("22. error de red muestra mensaje amigable, sin detalles técnicos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch,
    );
    render(<GlobalSearch />);
    typeQuery("ISDIN");
    expect(
      await screen.findByText("No se pudo realizar la búsqueda. Intenta nuevamente."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PGRST|Supabase|500|stack/i)).not.toBeInTheDocument();
  });

  it("sin resultados muestra mensaje con el término", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ query: "zzz", groups: [], total: 0 }),
      })) as unknown as typeof fetch,
    );
    render(<GlobalSearch />);
    typeQuery("zzz");
    expect(await screen.findByText(/No encontramos resultados para/)).toBeInTheDocument();
  });
});
