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

const PAR = {
  a: cliente({ id: "a", firstName: "Ana", lastName: "Perez", totalOrders: 5 }),
  b: cliente({ id: "b", firstName: "Ana", lastName: "Perez", totalOrders: 1 }),
  confidence: "high" as const,
  reasons: ["documento"],
};

function mockFetchSequence(responses: Array<{ url: string; body: unknown }>) {
  const fetchMock = vi.fn((url: string) => {
    const hit = responses.find((r) => url.includes(r.url));
    return Promise.resolve({ ok: true, json: async () => hit?.body ?? {} });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("MergeClientsView", () => {
  it("muestra los pares detectados", async () => {
    mockFetchSequence([{ url: "/api/customers/duplicates", body: { pairs: [PAR] } }]);
    render(<MergeClientsView />);
    await waitFor(() => expect(screen.getAllByText(/Ana Perez/i).length).toBeGreaterThan(0));
  });

  it("sin pares, muestra el estado vacío", async () => {
    mockFetchSequence([{ url: "/api/customers/duplicates", body: { pairs: [] } }]);
    render(<MergeClientsView />);
    await waitFor(() => expect(screen.getByText(/no se encontraron posibles duplicados/i)).toBeInTheDocument());
  });

  it("al abrir un par, pide el dry-run y muestra el resumen de impacto", async () => {
    mockFetchSequence([
      { url: "/api/customers/duplicates", body: { pairs: [PAR] } },
      { url: "/api/customers/merge", body: { moved: [{ table: "ar_promises", count: 3 }] } },
    ]);
    render(<MergeClientsView />);
    await waitFor(() => expect(screen.getAllByText(/Ana Perez/i).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /comparar/i }));
    await waitFor(() => expect(screen.getByText(/3 promesas de pago/i)).toBeInTheDocument());
  });

  it("al confirmar, fusiona y el par desaparece de la lista", async () => {
    let mergePosts = 0;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("/api/customers/duplicates")) {
        return Promise.resolve({ ok: true, json: async () => ({ pairs: [PAR] }) });
      }
      if (url.includes("/api/customers/merge")) {
        const body = JSON.parse((init?.body as string) ?? "{}");
        if (body.dryRun) return Promise.resolve({ ok: true, json: async () => ({ moved: [{ table: "ar_promises", count: 3 }] }) });
        mergePosts++;
        return Promise.resolve({ ok: true, json: async () => ({ moved: [{ table: "ar_promises", count: 3 }] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MergeClientsView />);
    await waitFor(() => expect(screen.getAllByText(/Ana Perez/i).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /comparar/i }));
    await waitFor(() => screen.getByText(/3 promesas de pago/i));
    const unificarButtons = () => screen.getAllByRole("button", { name: /^unificar$/i });
    expect(unificarButtons()).toHaveLength(1);
    fireEvent.click(unificarButtons()[0]!);
    await waitFor(() => expect(unificarButtons().length).toBeGreaterThan(1));
    fireEvent.click(unificarButtons().slice(-1)[0]!);
    await waitFor(() => expect(mergePosts).toBe(1));
    await waitFor(() => expect(screen.queryByText(/Ana Perez/i)).not.toBeInTheDocument());
  });
});
