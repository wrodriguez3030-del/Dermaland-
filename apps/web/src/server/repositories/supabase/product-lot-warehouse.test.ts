import { describe, expect, it } from "vitest";
import { resolveBranchWarehouseId } from "./product";
import { ensureDefaultWarehouseForBranch } from "./warehouse";
import { UserFacingRepositoryError } from "./client";

const BUSINESS = "00000000-0000-0000-0000-00000000d001";
const BRANCH = "00000000-0000-0000-0000-00000000b001";
const REAL_WAREHOUSE = "c1c90936-7b35-44af-8f86-74d209a576a0";
const NEW_WAREHOUSE = "11111111-2222-3333-4444-555555555555";

/**
 * Builder Supabase falso. Encadena from/select/eq/order/limit/insert y resuelve
 * en `maybeSingle` (lecturas) o `single` (insert).
 *
 *  - `selectResults`: resultados consumidos en orden por cada `maybeSingle()`
 *    (1º = búsqueda de almacén existente, 2º = re-consulta tras carrera).
 *  - `insertResult`: resultado del `single()` que cierra el insert.
 *
 * Registra inserts y conteos para poder afirmar idempotencia / no-duplicación.
 */
function makeSb(opts: {
  selectResults?: Array<{ data: unknown; error: unknown }>;
  insertResult?: { data: unknown; error: unknown };
}) {
  const selectResults = opts.selectResults ?? [];
  const calls = { from: 0, inserts: [] as unknown[], maybeSingle: 0 };
  const builder: Record<string, unknown> = {
    from() {
      calls.from += 1;
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
    insert(row: unknown) {
      calls.inserts.push(row);
      return builder;
    },
    maybeSingle() {
      const r = selectResults[calls.maybeSingle] ?? { data: null, error: null };
      calls.maybeSingle += 1;
      return Promise.resolve(r);
    },
    single() {
      return Promise.resolve(opts.insertResult ?? { data: null, error: null });
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { sb: builder as any, calls };
}

describe("resolveBranchWarehouseId", () => {
  it("respeta un warehouseId UUID válido provisto (no consulta la tabla)", async () => {
    const { sb, calls } = makeSb({});
    const id = await resolveBranchWarehouseId(sb, BUSINESS, BRANCH, REAL_WAREHOUSE);
    expect(id).toBe(REAL_WAREHOUSE);
    expect(calls.from).toBe(0);
    expect(calls.inserts).toHaveLength(0);
  });

  it("resuelve el almacén real de la sucursal cuando llega un id mock sintético", async () => {
    const { sb, calls } = makeSb({
      selectResults: [{ data: { id: REAL_WAREHOUSE, is_main: true }, error: null }],
    });
    // Esto es exactamente lo que manda la UI en modo Supabase (defaultWarehouseForBranch).
    const synthetic = `wh_default_${BRANCH}`;
    const id = await resolveBranchWarehouseId(sb, BUSINESS, BRANCH, synthetic);
    expect(id).toBe(REAL_WAREHOUSE);
    expect(calls.inserts).toHaveLength(0); // ya existía → no crea nada
  });

  it("resuelve también cuando no se provee warehouseId", async () => {
    const { sb } = makeSb({
      selectResults: [{ data: { id: REAL_WAREHOUSE, is_main: true }, error: null }],
    });
    const id = await resolveBranchWarehouseId(sb, BUSINESS, BRANCH, undefined);
    expect(id).toBe(REAL_WAREHOUSE);
  });

  it("crea automáticamente la ubicación interna si la sucursal no tiene almacén", async () => {
    // Caso DermaLand Cutis: la sucursal real no tenía fila en `warehouses`.
    const { sb, calls } = makeSb({
      selectResults: [{ data: null, error: null }], // no existe
      insertResult: { data: { id: NEW_WAREHOUSE }, error: null },
    });
    const id = await resolveBranchWarehouseId(sb, BUSINESS, BRANCH, `wh_default_${BRANCH}`);
    expect(id).toBe(NEW_WAREHOUSE);
    expect(calls.inserts).toHaveLength(1);
    const row = calls.inserts[0] as Record<string, unknown>;
    expect(row.business_id).toBe(BUSINESS);
    expect(row.branch_id).toBe(BRANCH);
    expect(row.is_main).toBe(true);
    expect(row.code).toBe(`auto-${BRANCH}`); // determinista → idempotente
  });

  it("traduce un error de Postgres (RLS) a mensaje amigable, sin prefijo técnico", async () => {
    const { sb } = makeSb({
      selectResults: [{ data: null, error: { code: "42501", message: "rls" } }],
    });
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

describe("ensureDefaultWarehouseForBranch", () => {
  it("es idempotente: si ya existe el almacén lo devuelve y NO inserta", async () => {
    const { sb, calls } = makeSb({
      selectResults: [{ data: { id: REAL_WAREHOUSE, is_main: true }, error: null }],
    });
    const id = await ensureDefaultWarehouseForBranch(sb, BUSINESS, BRANCH);
    expect(id).toBe(REAL_WAREHOUSE);
    expect(calls.inserts).toHaveLength(0);
  });

  it("crea el almacén interno cuando falta (asociado a business y branch)", async () => {
    const { sb, calls } = makeSb({
      selectResults: [{ data: null, error: null }],
      insertResult: { data: { id: NEW_WAREHOUSE }, error: null },
    });
    const id = await ensureDefaultWarehouseForBranch(sb, BUSINESS, BRANCH);
    expect(id).toBe(NEW_WAREHOUSE);
    expect(calls.inserts).toHaveLength(1);
  });

  it("ante carrera (23505) re-consulta y devuelve el almacén ganador (no duplica)", async () => {
    const { sb, calls } = makeSb({
      selectResults: [
        { data: null, error: null }, // 1ª: no existe → intenta insertar
        { data: { id: REAL_WAREHOUSE }, error: null }, // re-consulta tras 23505
      ],
      insertResult: { data: null, error: { code: "23505", message: "dup" } },
    });
    const id = await ensureDefaultWarehouseForBranch(sb, BUSINESS, BRANCH);
    expect(id).toBe(REAL_WAREHOUSE);
    expect(calls.inserts).toHaveLength(1); // intentó 1 insert; el ganador ya estaba
  });
});
