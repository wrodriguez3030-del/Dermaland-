import { describe, expect, it } from "vitest";
import { resolveBranchWarehouseId } from "./product";
import { UserFacingRepositoryError } from "./client";

const BUSINESS = "00000000-0000-0000-0000-00000000d001";
const BRANCH = "00000000-0000-0000-0000-00000000b001";
const REAL_WAREHOUSE = "c1c90936-7b35-44af-8f86-74d209a576a0";

/**
 * Builder Supabase falso: encadena from/select/eq/order/limit y resuelve en
 * maybeSingle con el `result` dado. Registra si se consultó la tabla.
 */
function fakeSb(result: { data: unknown; error: unknown }) {
  const state = { queried: false };
  const builder: Record<string, unknown> = {
    from() {
      state.queried = true;
      return builder;
    },
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    maybeSingle() {
      return Promise.resolve(result);
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { sb: builder as any, state };
}

describe("resolveBranchWarehouseId", () => {
  it("respeta un warehouseId UUID válido provisto (no consulta la tabla)", async () => {
    const { sb, state } = fakeSb({ data: null, error: null });
    const id = await resolveBranchWarehouseId(sb, BUSINESS, BRANCH, REAL_WAREHOUSE);
    expect(id).toBe(REAL_WAREHOUSE);
    expect(state.queried).toBe(false);
  });

  it("resuelve el almacén real de la sucursal cuando llega un id mock sintético", async () => {
    const { sb, state } = fakeSb({ data: { id: REAL_WAREHOUSE, is_main: true }, error: null });
    // Esto es exactamente lo que manda la UI en modo Supabase (defaultWarehouseForBranch).
    const synthetic = `wh_default_${BRANCH}`;
    const id = await resolveBranchWarehouseId(sb, BUSINESS, BRANCH, synthetic);
    expect(id).toBe(REAL_WAREHOUSE);
    expect(state.queried).toBe(true);
  });

  it("resuelve también cuando no se provee warehouseId", async () => {
    const { sb } = fakeSb({ data: { id: REAL_WAREHOUSE, is_main: true }, error: null });
    const id = await resolveBranchWarehouseId(sb, BUSINESS, BRANCH, undefined);
    expect(id).toBe(REAL_WAREHOUSE);
  });

  it("error amigable si la sucursal no tiene almacén", async () => {
    const { sb } = fakeSb({ data: null, error: null });
    await expect(
      resolveBranchWarehouseId(sb, BUSINESS, BRANCH, `wh_default_${BRANCH}`),
    ).rejects.toBeInstanceOf(UserFacingRepositoryError);
    await expect(
      resolveBranchWarehouseId(sb, BUSINESS, BRANCH, `wh_default_${BRANCH}`),
    ).rejects.toThrow(/almacén/i);
  });

  it("traduce un error de Postgres (RLS) a mensaje amigable, sin prefijo técnico", async () => {
    const { sb } = fakeSb({ data: null, error: { code: "42501", message: "rls" } });
    let caught: Error | null = null;
    try {
      await resolveBranchWarehouseId(sb, BUSINESS, BRANCH, `wh_default_${BRANCH}`);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeInstanceOf(UserFacingRepositoryError);
    expect(caught?.message).not.toMatch(/SupabaseRepository/);
  });
});
