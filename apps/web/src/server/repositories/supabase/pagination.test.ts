import { describe, expect, it, vi } from "vitest";
import { fetchAllPages } from "./pagination";

/**
 * Simula una fuente PostgREST: tiene `total` filas y NUNCA devuelve más de
 * `cap` por request (el tope real de Supabase es 1000). `fetchPage(from,to)`
 * respeta el rango pedido pero recorta al `cap`.
 */
function makeSource(total: number, cap = 1000) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const ranges: Array<[number, number]> = [];
  const fetchPage = vi.fn(async (from: number, to: number) => {
    ranges.push([from, to]);
    const end = Math.min(to + 1, from + cap); // el server corta en `cap`
    return rows.slice(from, end);
  });
  return { fetchPage, ranges };
}

describe("fetchAllPages", () => {
  it("trae TODAS las filas cuando exceden el tope de una página (1370 > 1000)", async () => {
    const { fetchPage, ranges } = makeSource(1370, 1000);
    const all = await fetchAllPages(fetchPage, 1000);
    expect(all).toHaveLength(1370);
    // 2 requests: [0..999] (1000 filas, sigue) y [1000..1999] (370, corta).
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("devuelve [] cuando no hay filas (una sola llamada)", async () => {
    const { fetchPage } = makeSource(0, 1000);
    const all = await fetchAllPages(fetchPage, 1000);
    expect(all).toHaveLength(0);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("maneja el borde de múltiplo exacto sin perder ni duplicar (1000 exactas)", async () => {
    const { fetchPage } = makeSource(1000, 1000);
    const all = await fetchAllPages(fetchPage, 1000);
    expect(all).toHaveLength(1000);
    // 1ª página llena → pide una 2ª que vuelve vacía → corta.
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("respeta el tope de seguridad de páginas (no hace loop infinito)", async () => {
    // Fuente "infinita": siempre devuelve una página llena.
    const fetchPage = vi.fn(async (_from: number, _to: number) =>
      Array.from({ length: 1000 }, (_, i) => ({ id: i })),
    );
    const all = await fetchAllPages(fetchPage, 1000, 3);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(all).toHaveLength(3000);
  });
});
