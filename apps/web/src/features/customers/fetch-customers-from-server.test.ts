import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCustomersFromServer } from "./customer-store";

afterEach(() => vi.unstubAllGlobals());

describe("fetchCustomersFromServer", () => {
  it("sin opciones pide /api/customers sin parámetros", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ customers: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchCustomersFromServer();
    expect(fetchMock).toHaveBeenCalledWith("/api/customers", { cache: "no-store" });
  });

  it("con `search` arma la consulta con el término codificado", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ customers: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchCustomersFromServer({ search: "María Peña" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/customers?search=Mar%C3%ADa+Pe%C3%B1a",
      { cache: "no-store" },
    );
  });

  it("con `limit` lo agrega a la consulta — para NO pedir la base entera desde un autocompletar", async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({ customers: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchCustomersFromServer({ search: "ana", limit: 10 });
    const url = fetchMock.mock.calls[0]?.[0];
    expect(url).toContain("search=ana");
    expect(url).toContain("limit=10");
  });

  it("una respuesta no-OK lanza con el mensaje del cuerpo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: "Sesión expirada." }),
      })),
    );
    await expect(fetchCustomersFromServer()).rejects.toThrow("Sesión expirada.");
  });
});
