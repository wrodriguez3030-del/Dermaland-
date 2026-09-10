import { describe, expect, it, vi } from "vitest";
import { dryRunMergeImpact, mergeClients, MERGE_IMPACT_TABLES } from "./merge-clients";

function fakeCountBuilder(countsByTable: Record<string, number>) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () =>
            Promise.resolve({ count: countsByTable[table] ?? 0, error: null }),
        }),
      }),
    }),
  };
}

describe("dryRunMergeImpact", () => {
  it("cuenta las 7 tablas y devuelve una fila por tabla, en el orden de MERGE_IMPACT_TABLES", async () => {
    const sb = fakeCountBuilder({
      alegra_invoices: 14,
      ar_promises: 3,
      client_auth_links: 0,
      electronic_invoices: 0,
      electronic_invoices_legacy_20260906: 0,
      proformas: 0,
      web_orders: 1,
    });
    const impacts = await dryRunMergeImpact(sb, "biz-1", "dup-1");
    expect(impacts).toEqual(
      MERGE_IMPACT_TABLES.map(({ table }) => ({
        table,
        count: { alegra_invoices: 14, ar_promises: 3, web_orders: 1 }[table] ?? 0,
      })),
    );
  });

  it("propaga un error de Supabase como SupabaseRepositoryError", async () => {
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ count: null, error: { message: "boom" } }),
          }),
        }),
      }),
    };
    await expect(dryRunMergeImpact(sb, "biz-1", "dup-1")).rejects.toThrow();
  });
});

describe("mergeClients", () => {
  it("llama al RPC con los ids y mapea `moved` al mismo shape que el dry run", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { primaryId: "p1", duplicateId: "d1", moved: { alegra_invoices: 14, ar_promises: 3 } },
      error: null,
    });
    const sb = { rpc };
    const result = await mergeClients(sb, "p1", "d1");
    expect(rpc).toHaveBeenCalledWith("merge_clients", { p_primary_id: "p1", p_duplicate_id: "d1" });
    expect(result.moved.find((m) => m.table === "alegra_invoices")?.count).toBe(14);
    expect(result.moved.find((m) => m.table === "web_orders")?.count).toBe(0);
  });

  it("P0002 (no encontrado / ya unificado) se traduce a mensaje de usuario", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "P0002: no encontrado" } }) };
    await expect(mergeClients(sb, "p1", "d1")).rejects.toThrow(/no encontrado|pertenece|unificado/i);
  });

  it("P0003 (mismo cliente) se traduce a mensaje de usuario", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "P0003: no se puede" } }) };
    await expect(mergeClients(sb, "p1", "p1")).rejects.toThrow(/consigo mismo/i);
  });
});
