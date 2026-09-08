// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { useResumenInventario } from "./use-resumen-inventario";

/**
 * 🔴 El resumen de inventario NO se pide antes de saber qué sucursales hay.
 *
 * Las sucursales llegan por su propia petición, así que en el primer render la
 * lista está vacía. El panel pedía entonces DOS veces: una con `sucursales=`
 * vacío —que el servidor contesta con un 503— y otra con las de verdad, que
 * salía tarde porque iba detrás de la primera. Medido en producción el
 * 08/09/2026: la buena empezaba en el milisegundo 885 en vez de en el 552.
 *
 * Es un fallo que no se ve: la pantalla acaba enseñando los números correctos.
 */

const RESUMEN = {
  totalProductos: 1487,
  vencenPronto: { total: 12, criticos: 3, lista: [] },
  bloqueados: 4,
  bajoMinimo: { total: 1339, lista: [] },
};

const fetchOk = () =>
  vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ resumen: RESUMEN }) }),
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useResumenInventario", () => {
  it("🔴 con `activo` en false no pide NADA y se queda en cargando", async () => {
    const espia = fetchOk();
    vi.stubGlobal("fetch", espia);
    const { result } = renderHook(() => useResumenInventario([], false));
    // Se le da margen a un efecto que pudiera dispararse tarde.
    await new Promise((r) => setTimeout(r, 20));
    expect(espia).not.toHaveBeenCalled();
    expect(result.current.cargando).toBe(true);
    // 🔴 Y NO cae en ceros: un panel de ceros afirma «no hay nada bajo mínimo».
    expect(result.current.resumen).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("pide una sola vez cuando ya se sabe qué sucursales hay", async () => {
    const espia = fetchOk();
    vi.stubGlobal("fetch", espia);
    const { result } = renderHook(() => useResumenInventario(["b1", "b2"], true));
    await waitFor(() => expect(result.current.resumen).not.toBeNull());
    expect(espia).toHaveBeenCalledTimes(1);
    expect(String(espia.mock.calls[0]?.[0])).toContain("sucursales=b1%2Cb2");
    expect(result.current.resumen?.bajoMinimo.total).toBe(1339);
  });

  it("🔴 al encenderse pide con las sucursales que ya llegaron, no con la lista vacía", async () => {
    const espia = fetchOk();
    vi.stubGlobal("fetch", espia);
    const { rerender } = renderHook(
      ({ ids, activo }: { ids: string[]; activo: boolean }) => useResumenInventario(ids, activo),
      { initialProps: { ids: [] as string[], activo: false } },
    );
    rerender({ ids: ["b1"], activo: true });
    await waitFor(() => expect(espia).toHaveBeenCalledTimes(1));
    expect(String(espia.mock.calls[0]?.[0])).toContain("sucursales=b1");
  });

  it("un fallo deja `resumen` en null con su mensaje, nunca en ceros", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ error: "Faltan las sucursales." }),
        }),
      ),
    );
    const { result } = renderHook(() => useResumenInventario(["b1"], true));
    await waitFor(() => expect(result.current.error).toBe("Faltan las sucursales."));
    expect(result.current.resumen).toBeNull();
  });
});
