import { describe, expect, it, vi } from "vitest";

/**
 * `GET /api/incentives` — descubierto el 09/09/2026 desde el reporte del
 * dueño: "solo veo un vendedor en Incentivos de venta y en los demás menús
 * que aplican" (también «Reporte de comisión de ventas», el otro consumidor
 * de `useIncentives`).
 *
 * 🔴 Causa real: la ruta hacía UN `.select()` sin `.range()` sobre
 * `sales_incentives`. Con 2 051 filas reales (2 044 de un vendedor + 7 de
 * otro), PostgREST cortaba en SILENCIO a las 1 000 más recientes por
 * `earned_at desc` — que resultaron ser TODAS del mismo vendedor. Tanto
 * «Incentivos de venta» (`sellerOptions`) como «Reporte de comisión de
 * ventas» arman su filtro/ranking de vendedores contando sobre ese array ya
 * truncado: con la mitad desaparecida, veían un solo vendedor donde hay
 * varios — sin un solo error.
 *
 * Mismo patrón que la guarda de `lots/route.ts` en `rutas-con-limite.test.ts`:
 * esto EJECUTA el handler de verdad contra un Supabase falso que sirve
 * muchas más filas que el corte de PostgREST, en vez de comprobar el texto
 * del archivo — un grep de `.range(` habría dado falso verde si el fix se
 * hubiera quedado en UNA sola página con `.range(0, 999)`.
 */

const FILAS_DISPONIBLES = 2051;
/** Las últimas 7 filas (las "viejas", fuera de las primeras 1000 por fecha) son de otro vendedor. */
const CORTE_VENDEDOR_VIEJO = FILAS_DISPONIBLES - 7;

function filaDeIncentivoFalsa(i: number) {
  const esViejo = i >= CORTE_VENDEDOR_VIEJO;
  return {
    id: `inc-${i}`,
    sale_id: `sale-${i}`,
    seller_id: esViejo ? "seller-viejo" : "seller-nuevo",
    seller_name: esViejo ? "Vendedor Viejo" : "Vendedor Nuevo",
    rule_id: null,
    rule_name: null,
    rule_type: null,
    product_id: null,
    base_amount: 100,
    incentive_amount: 10,
    adjustment_amount: 0,
    status: "pending",
    earned_at: "2026-01-01T00:00:00.000Z",
    paid_at: null,
    payment_batch_id: null,
    proformas: null,
  };
}

vi.mock("@/server/auth/context", () => ({
  getSession: async () => ({ businessId: "biz-tope-test", user: { id: "u1" } }),
}));
vi.mock("@/lib/env", () => ({ env: { DATA_SOURCE: "supabase" } }));
vi.mock("@/lib/supabase/server", () => ({
  createServer: async () => {
    const builder: Record<string, unknown> = {
      from() {
        return builder;
      },
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      neq() {
        return builder;
      },
      gte() {
        return builder;
      },
      lte() {
        return builder;
      },
      order() {
        return builder;
      },
      range(from: number, to: number) {
        const hasta = Math.min(to + 1, FILAS_DISPONIBLES);
        const cantidad = Math.max(0, hasta - from);
        const data = Array.from({ length: cantidad }, (_, i) => filaDeIncentivoFalsa(from + i));
        return Promise.resolve({ data, error: null });
      },
    };
    return builder;
  },
}));

describe("/api/incentives no se queda en las primeras 1 000 filas de PostgREST", () => {
  it("trae las 2 051 filas, no solo las primeras 1 000", async () => {
    const { GET } = await import("./route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("http://localhost/api/incentives"));
    const body = (await res.json()) as { incentives: Array<{ sellerId: string }> };
    expect(body.incentives).toHaveLength(FILAS_DISPONIBLES);
  });

  it("🔴 con el corte roto, el vendedor viejo desaparecería del todo: aquí sigue", async () => {
    // Esto es lo que de verdad rompía en pantalla: `sellerOptions` (y el
    // ranking del reporte de comisión) se calculan contando los `sellerId`
    // distintos de este mismo array. Sin las últimas 7 filas, "Vendedor
    // Viejo" nunca aparecía como opción de filtro.
    const { GET } = await import("./route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("http://localhost/api/incentives"));
    const body = (await res.json()) as { incentives: Array<{ sellerId: string }> };
    const vendedoresDistintos = new Set(body.incentives.map((i) => i.sellerId));
    expect(vendedoresDistintos).toEqual(new Set(["seller-nuevo", "seller-viejo"]));
  });
});
