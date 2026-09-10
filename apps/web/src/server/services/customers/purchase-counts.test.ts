import { describe, expect, it } from "vitest";
import { getClientPurchaseCounts } from "./purchase-counts";

/**
 * 🔴 Reproducido en vivo el 10/09/2026: `client_purchase_counts()` sin
 * `.range()` devolvía exactamente 1000 filas — el mismo tope silencioso de
 * PostgREST que ya documentó `dermaland-postgrest-1000-cap`. Con ~6500
 * clientes reales con compras, la inmensa mayoría caía al `?? 0` en
 * "Unificar clientes" sin un solo error. Mismo patrón de prueba que
 * `api/incentives/route.test.ts`: un builder falso que sirve MÁS filas que
 * el corte de PostgREST, no un grep de `.range(`.
 */
const FILAS_DISPONIBLES = 1500;

function filaFalsa(i: number) {
  return { client_id: `cli-${i}`, purchases: i };
}

function fakeSupabase() {
  const builder = {
    range(from: number, to: number) {
      const hasta = Math.min(to + 1, FILAS_DISPONIBLES);
      const cantidad = Math.max(0, hasta - from);
      const data = Array.from({ length: cantidad }, (_, i) => filaFalsa(from + i));
      return Promise.resolve({ data, error: null });
    },
  };
  return { rpc: () => builder };
}

describe("getClientPurchaseCounts no se queda en las primeras 1000 filas de PostgREST", () => {
  it("trae las 1500 filas paginando, no solo las primeras 1000", async () => {
    const counts = await getClientPurchaseCounts(fakeSupabase());
    expect(counts.size).toBe(FILAS_DISPONIBLES);
    expect(counts.get("cli-1499")).toBe(1499); // la última fila, fuera de la 1ª página
  });
});
