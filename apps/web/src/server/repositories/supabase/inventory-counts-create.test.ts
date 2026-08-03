import { describe, it, expect } from "vitest";
import { createCountWithItems } from "./inventory-counts-create";

const ctx = { businessId: "biz1", branchId: "br1", userId: "u1" } as never;

const input = {
  countNumber: "CONT-9",
  branchId: "br1",
  countType: "full",
  status: "approved",
  items: [
    {
      productId: "p1",
      productSku: "SKU-1",
      productName: "Producto 1",
      expectedQuantity: 5,
      countedQuantity: 4,
      status: "shortage",
    },
  ],
} as never;

const CABECERA = {
  id: "c-nuevo",
  business_id: "biz1",
  branch_id: "br1",
  warehouse_id: "wh1",
  count_number: "CONT-9",
  count_type: "full",
  status: "approved",
  assigned_to: [],
  started_at: "2026-08-03T00:00:00Z",
  notes: null,
  scan_count: 0,
  item_count: 1,
  created_at: "2026-08-03T00:00:00Z",
  updated_at: "2026-08-03T00:00:00Z",
};

/** Cliente falso: la cabecera inserta bien, los ítems fallan o no según `opts`. */
function fakeClient(opts: { itemsFail: boolean }) {
  const deleted: Array<Record<string, string>> = [];
  const client = {
    from(table: string) {
      if (table === "inventory_counts") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { ...CABECERA }, error: null }),
            }),
          }),
          delete: () => ({
            eq: (col: string, val: string) => {
              deleted.push({ [col]: val });
              return {
                eq: (c2: string, v2: string) => {
                  deleted.push({ [c2]: v2 });
                  return Promise.resolve({ error: null });
                },
              };
            },
          }),
        };
      }
      return {
        insert: async () => ({ error: opts.itemsFail ? { message: "boom" } : null }),
      };
    },
    deleted,
  };
  return client as never;
}

describe("createCountWithItems", () => {
  it("borra la cabecera si falla el insert de ítems", async () => {
    const sb = fakeClient({ itemsFail: true });
    await expect(createCountWithItems(sb, ctx, input, "wh1")).rejects.toThrow();
    expect((sb as unknown as { deleted: unknown[] }).deleted).toEqual([
      { id: "c-nuevo" },
      { business_id: "biz1" },
    ]);
  });

  it("no borra nada cuando los ítems entran bien", async () => {
    const sb = fakeClient({ itemsFail: false });
    const out = await createCountWithItems(sb, ctx, input, "wh1");
    expect(out.id).toBe("c-nuevo");
    expect((sb as unknown as { deleted: unknown[] }).deleted).toEqual([]);
  });

  it("nunca envía difference_quantity, que es GENERATED ALWAYS", async () => {
    const enviados: Array<Record<string, unknown>> = [];
    const sb = {
      from(table: string) {
        if (table === "inventory_counts") {
          return {
            insert: () => ({
              select: () => ({ single: async () => ({ data: { ...CABECERA }, error: null }) }),
            }),
            delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
          };
        }
        return {
          insert: async (rows: Array<Record<string, unknown>>) => {
            enviados.push(...rows);
            return { error: null };
          },
        };
      },
    } as never;
    await createCountWithItems(sb, ctx, input, "wh1");
    expect(enviados[0]).not.toHaveProperty("difference_quantity");
  });
});
