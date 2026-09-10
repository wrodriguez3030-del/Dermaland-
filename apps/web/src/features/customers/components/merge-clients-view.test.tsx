// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { MergeClientsView } from "./merge-clients-view";
import type { Customer } from "@/types";

afterEach(cleanup);

const cliente = (over: Partial<Customer>): Customer =>
  ({
    id: "id",
    businessId: "b",
    customerNumber: "CLI-1",
    firstName: "Ana",
    lastName: "Perez",
    source: "manual",
    tags: [],
    defaultBillingType: "consumo",
    skinType: "not_specified",
    totalSpent: 0,
    totalOrders: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    consents: [],
    ...over,
  }) as Customer;

const par = (over: { a?: Partial<Customer>; b?: Partial<Customer> } = {}) => ({
  a: cliente({ id: "a", firstName: "Ana", lastName: "Perez", totalOrders: 5, ...over.a }),
  b: cliente({ id: "b", firstName: "Beatriz", lastName: "Gomez", totalOrders: 1, ...over.b }),
  confidence: "high" as const,
  reasons: ["documento"],
});

function mockFetch(handlers: {
  duplicates?: unknown;
  merge?: (body: { primaryId: string; duplicateId: string; dryRun?: boolean }) => unknown;
}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.includes("/api/customers/duplicates")) {
      return Promise.resolve({ ok: true, json: async () => handlers.duplicates ?? { pairs: [] } });
    }
    if (url.includes("/api/customers/merge")) {
      const body = JSON.parse((init?.body as string) ?? "{}");
      return Promise.resolve({ ok: true, json: async () => handlers.merge?.(body) ?? { moved: [] } });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("MergeClientsView", () => {
  it("muestra cada par en una fila con dos checkboxes y un botón Unificar, sin pasos intermedios", async () => {
    mockFetch({ duplicates: { pairs: [par()] } });
    render(<MergeClientsView />);
    await waitFor(() => expect(screen.getAllByText(/Ana Perez/i).length).toBeGreaterThan(0));
    expect(screen.getByRole("checkbox", { name: /Ana Perez/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Beatriz Gomez/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^unificar$/i })).toBeInTheDocument();
    // Sin "Comparar": la fila ya trae todo lo necesario.
    expect(screen.queryByRole("button", { name: /comparar/i })).not.toBeInTheDocument();
  });

  it("preselecciona como receptor al que tiene más compras", async () => {
    mockFetch({ duplicates: { pairs: [par()] } });
    render(<MergeClientsView />);
    await waitFor(() => expect(screen.getAllByText(/Ana Perez/i).length).toBeGreaterThan(0));
    expect(screen.getByRole("checkbox", { name: /Ana Perez/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Beatriz Gomez/i })).not.toBeChecked();
  });

  it("marcar el otro checkbox cambia quién recibe", async () => {
    mockFetch({ duplicates: { pairs: [par()] } });
    render(<MergeClientsView />);
    await waitFor(() => expect(screen.getAllByText(/Ana Perez/i).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox", { name: /Beatriz Gomez/i }));
    expect(screen.getByRole("checkbox", { name: /Beatriz Gomez/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Ana Perez/i })).not.toBeChecked();
  });

  it("al pulsar Unificar calcula el impacto y pide confirmación antes de fusionar de verdad", async () => {
    let mergePosts = 0;
    mockFetch({
      duplicates: { pairs: [par()] },
      merge: (body) => {
        if (body.dryRun) return { moved: [{ table: "ar_promises", count: 3 }] };
        mergePosts++;
        return { moved: [{ table: "ar_promises", count: 3 }] };
      },
    });
    render(<MergeClientsView />);
    await waitFor(() => expect(screen.getAllByText(/Ana Perez/i).length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: /^unificar$/i }));
    await waitFor(() => expect(screen.getByText(/3 promesas de pago/i)).toBeInTheDocument());
    expect(mergePosts).toBe(0); // todavía no fusionó de verdad

    fireEvent.click(screen.getByRole("button", { name: /confirmar unificación/i }));
    await waitFor(() => expect(mergePosts).toBe(1));
    await waitFor(() => expect(screen.queryByText(/Ana Perez/i)).not.toBeInTheDocument());
  });

  it("respeta el receptor elegido por el usuario (no siempre el default)", async () => {
    const bodies: Array<{ primaryId: string; duplicateId: string; dryRun?: boolean }> = [];
    mockFetch({
      duplicates: { pairs: [par()] },
      merge: (body) => {
        bodies.push(body);
        return { moved: [] };
      },
    });
    render(<MergeClientsView />);
    await waitFor(() => expect(screen.getAllByText(/Ana Perez/i).length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("checkbox", { name: /Beatriz Gomez/i }));
    fireEvent.click(screen.getByRole("button", { name: /^unificar$/i }));
    await waitFor(() => expect(bodies.some((b) => b.dryRun)).toBe(true));
    const dryRunBody = bodies.find((b) => b.dryRun)!;
    expect(dryRunBody.primaryId).toBe("b");
    expect(dryRunBody.duplicateId).toBe("a");
  });

  it("sin pares, muestra el estado vacío", async () => {
    mockFetch({ duplicates: { pairs: [] } });
    render(<MergeClientsView />);
    await waitFor(() => expect(screen.getByText(/no se encontraron posibles duplicados/i)).toBeInTheDocument());
  });

  it("pagina la lista cuando hay más pares de los que caben en una página", async () => {
    const muchos = Array.from({ length: 30 }, (_, i) =>
      par({ a: { id: `a${i}`, firstName: `Cliente${i}` } }),
    );
    mockFetch({ duplicates: { pairs: muchos } });
    render(<MergeClientsView />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^unificar$/i }).length).toBe(25));
    expect(screen.getByText(/mostrando/i)).toBeInTheDocument();
  });

  it("el buscador filtra los pares por nombre, en cualquiera de los dos lados", async () => {
    const pares = [
      par({ a: { id: "a1", firstName: "Ana", lastName: "Perez" }, b: { id: "b1", firstName: "Ana", lastName: "Rodriguez" } }),
      par({ a: { id: "a2", firstName: "Juan", lastName: "Diaz" }, b: { id: "b2", firstName: "Juan", lastName: "Mejia" } }),
    ];
    mockFetch({ duplicates: { pairs: pares } });
    render(<MergeClientsView />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^unificar$/i }).length).toBe(2));

    fireEvent.change(screen.getByPlaceholderText(/buscar/i), { target: { value: "diaz" } });
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^unificar$/i }).length).toBe(1));
    expect(screen.getByText(/Juan Diaz/i)).toBeInTheDocument();
    expect(screen.queryByText(/Ana Perez/i)).not.toBeInTheDocument();
  });

  it("el buscador ignora tildes/mayúsculas y busca por documento o teléfono", async () => {
    const pares = [par({ a: { id: "a1", documentNumber: "001-2345678-9" } })];
    mockFetch({ duplicates: { pairs: pares } });
    render(<MergeClientsView />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^unificar$/i }).length).toBe(1));

    fireEvent.change(screen.getByPlaceholderText(/buscar/i), { target: { value: "0012345678" } });
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^unificar$/i }).length).toBe(1));
  });

  it("sin resultados de búsqueda (habiendo pares) lo dice distinto de «sin duplicados»", async () => {
    mockFetch({ duplicates: { pairs: [par()] } });
    render(<MergeClientsView />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^unificar$/i }).length).toBe(1));

    fireEvent.change(screen.getByPlaceholderText(/buscar/i), { target: { value: "zzzznadie" } });
    await waitFor(() => expect(screen.getByText(/ning[uú]n par coincide/i)).toBeInTheDocument());
    expect(screen.queryByText(/no se encontraron posibles duplicados/i)).not.toBeInTheDocument();
  });
});
