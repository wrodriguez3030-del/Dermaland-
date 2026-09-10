// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { CustomerSearchSelect } from "./customer-search-select";
import type { Customer } from "@/types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function cliente(o: Partial<Customer>): Customer {
  return {
    id: "c1",
    businessId: "b1",
    customerNumber: "CLI-0001",
    firstName: "María",
    lastName: "Peña",
    documentNumber: "001-1111111-1",
    phone: "809-555-0001",
    tags: [],
    defaultBillingType: "consumo",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...o,
  } as Customer;
}

function abrir() {
  fireEvent.click(screen.getByRole("button", { name: /Selecciona un cliente para facturar/ }));
}

describe("CustomerSearchSelect — búsqueda en el servidor", () => {
  it("al abrir SIN escribir, NO pide nada al servidor — evita bajar la base entera", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <CustomerSearchSelect
        value={null}
        onChange={() => {}}
        allowWalkIn={false}
      />,
    );
    abrir();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Escribe para buscar/)).toBeInTheDocument();
  });

  it("con 1 carácter todavía no busca (mínimo 2)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<CustomerSearchSelect value={null} onChange={() => {}} allowWalkIn={false} />);
    abrir();
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/), {
      target: { value: "a" },
    });
    await new Promise((r) => setTimeout(r, 350));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con 2+ caracteres busca en el servidor con un tope de resultados (nunca la base entera)", async () => {
    const maria = cliente({ id: "c1", firstName: "María" });
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ customers: String(url).includes("search=mar") ? [maria] : [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CustomerSearchSelect value={null} onChange={() => {}} allowWalkIn={false} />);
    abrir();
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/), {
      target: { value: "mar" },
    });
    await waitFor(() => expect(screen.getByText("María Peña")).toBeInTheDocument());
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("search=mar");
    expect(url).toContain("limit=");
  });

  it("seleccionar un resultado llama onChange y cierra el desplegable", async () => {
    const maria = cliente({ id: "c1", firstName: "María" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ customers: [maria] }) })),
    );
    const onChange = vi.fn();
    render(<CustomerSearchSelect value={null} onChange={onChange} allowWalkIn={false} />);
    abrir();
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/), {
      target: { value: "mar" },
    });
    await waitFor(() => expect(screen.getByText("María Peña")).toBeInTheDocument());
    fireEvent.click(screen.getByText("María Peña"));
    expect(onChange).toHaveBeenCalledWith(maria);
    expect(screen.queryByPlaceholderText(/Buscar por nombre/)).toBeNull();
  });

  it("sin resultados tras buscar, avisa y ofrece crear cliente nuevo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ customers: [] }) })),
    );
    render(<CustomerSearchSelect value={null} onChange={() => {}} allowWalkIn={false} />);
    abrir();
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/), {
      target: { value: "zzz" },
    });
    await waitFor(() =>
      expect(screen.getByText(/No se encontraron clientes/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Crear nuevo cliente/)).toBeInTheDocument();
  });

  it("si la búsqueda falla, avisa en vez de quedarse en blanco", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ error: "Fallo de red." }) })),
    );
    render(<CustomerSearchSelect value={null} onChange={() => {}} allowWalkIn={false} />);
    abrir();
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/), {
      target: { value: "mar" },
    });
    await waitFor(() => expect(screen.getByText(/Fallo de red\./)).toBeInTheDocument());
  });

  it("con un cliente ya seleccionado, lo muestra en el trigger sin pedir nada", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <CustomerSearchSelect
        value={cliente({ firstName: "Juan", lastName: "Gómez" })}
        onChange={() => {}}
        allowWalkIn={false}
      />,
    );
    expect(screen.getByText("Juan Gómez")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
