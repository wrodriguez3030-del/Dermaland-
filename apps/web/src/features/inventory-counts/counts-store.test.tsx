// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { useCounts, useCount, useCountsReport } from "./counts-store";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const CONTEO = {
  id: "srv-1",
  businessId: "biz1",
  branchId: "br1",
  warehouseId: "wh1",
  countNumber: "INV-1",
  countType: "full",
  status: "approved",
  assignedTo: [],
  scanCount: 0,
  itemCount: 0,
  createdAt: "2026-08-03T00:00:00Z",
  updatedAt: "2026-08-03T00:00:00Z",
};

/**
 * La regla: 409 significa "backend en modo local" y ahí los datos de demo son
 * correctos. Un fallo de red NO significa eso — enseñar demo en producción
 * sería mostrar inventarios que no existen como si fueran reales.
 */
describe("counts-store: de dónde salen los datos", () => {
  it("con 409 (backend en modo local) muestra los datos de demostración", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 409 })));
    const { result } = renderHook(() => useCounts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBe("mock");
    expect(result.current.counts.length).toBeGreaterThan(0);
  });

  it("si la red falla NO inventa conteos: lista vacía y estado de error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("sin red");
      }),
    );
    const { result } = renderHook(() => useCounts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBe("error");
    expect(result.current.counts).toEqual([]);
  });

  it("si la API responde 500 tampoco inventa conteos", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    const { result } = renderHook(() => useCounts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBe("error");
    expect(result.current.counts).toEqual([]);
  });

  it("con datos reales los devuelve tal cual", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ counts: [CONTEO] }), { status: 200 }),
      ),
    );
    const { result } = renderHook(() => useCounts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBe("supabase");
    expect(result.current.counts).toHaveLength(1);
  });

  it("el detalle con red caída no cae a demo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("sin red");
      }),
    );
    const { result } = renderHook(() => useCount("srv-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBe("error");
    expect(result.current.count).toBeNull();
  });

  it("el reporte con red caída no cae a demo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("sin red");
      }),
    );
    const { result } = renderHook(() => useCountsReport());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBe("error");
    expect(result.current.counts).toEqual([]);
    expect(result.current.items).toEqual([]);
  });
});
