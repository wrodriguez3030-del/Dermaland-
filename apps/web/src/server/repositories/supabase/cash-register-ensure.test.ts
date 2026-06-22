import { describe, expect, it } from "vitest";
import { ensureCashRegisterForBranch } from "./sales";
import { UserFacingRepositoryError } from "./client";

const BUSINESS = "00000000-0000-0000-0000-00000000d001";
const BRANCH = "0a1fd664-ea36-4df0-8634-902eb293a021";
const EXISTING = "cr-existing-1";
const NEW = "cr-new-1";

/**
 * Fake Supabase: encadena from/select/eq/limit/insert y resuelve en
 * `maybeSingle` (lecturas) o `single` (insert). Registra inserts para afirmar
 * idempotencia / no-duplicación.
 */
function makeSb(opts: {
  selectResults?: Array<{ data: unknown; error: unknown }>;
  insertResult?: { data: unknown; error: unknown };
}) {
  const selectResults = opts.selectResults ?? [];
  const calls = { inserts: [] as unknown[], maybeSingle: 0 };
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

describe("ensureCashRegisterForBranch", () => {
  it("devuelve la caja existente sin insertar (idempotente)", async () => {
    const { sb, calls } = makeSb({
      selectResults: [{ data: { id: EXISTING }, error: null }],
    });
    const id = await ensureCashRegisterForBranch(sb, BUSINESS, BRANCH);
    expect(id).toBe(EXISTING);
    expect(calls.inserts).toHaveLength(0);
  });

  it("crea la caja automáticamente cuando falta (causa raíz del error)", async () => {
    const { sb, calls } = makeSb({
      selectResults: [{ data: null, error: null }],
      insertResult: { data: { id: NEW }, error: null },
    });
    const id = await ensureCashRegisterForBranch(sb, BUSINESS, BRANCH);
    expect(id).toBe(NEW);
    expect(calls.inserts).toHaveLength(1);
    const row = calls.inserts[0] as Record<string, unknown>;
    expect(row.business_id).toBe(BUSINESS);
    expect(row.branch_id).toBe(BRANCH);
    expect(row.is_active).toBe(true);
    expect(row.code).toBe(`auto-${BRANCH}`); // determinista → idempotente
  });

  it("ante carrera (23505) re-consulta y devuelve la ganadora (no duplica)", async () => {
    const { sb, calls } = makeSb({
      selectResults: [
        { data: null, error: null }, // no existe → intenta insertar
        { data: { id: EXISTING }, error: null }, // re-consulta tras 23505
      ],
      insertResult: { data: null, error: { code: "23505", message: "dup" } },
    });
    const id = await ensureCashRegisterForBranch(sb, BUSINESS, BRANCH);
    expect(id).toBe(EXISTING);
    expect(calls.inserts).toHaveLength(1);
  });

  it("error de Postgres (RLS) se traduce a mensaje amigable sin prefijo técnico", async () => {
    const { sb } = makeSb({
      selectResults: [{ data: null, error: { code: "42501", message: "rls" } }],
    });
    let caught: Error | null = null;
    try {
      await ensureCashRegisterForBranch(sb, BUSINESS, BRANCH);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeInstanceOf(UserFacingRepositoryError);
    expect(caught?.message).not.toMatch(/SupabaseRepository/);
  });
});
