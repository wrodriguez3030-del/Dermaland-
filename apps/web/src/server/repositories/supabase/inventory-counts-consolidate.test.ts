import { describe, it, expect } from "vitest";
import { consolidateCountItems } from "./inventory-counts-consolidate";

const ctx = { businessId: "biz1", branchId: "br1", userId: "u1" } as never;

const items = [
  {
    productId: "p1",
    productSku: "SKU-1",
    productName: "Producto 1",
    expectedQuantity: 5,
    countedQuantity: 4,
    status: "shortage" as const,
  },
];

/**
 * Cliente falso que registra las operaciones en orden para poder afirmar que
 * primero se borra lo viejo, luego se inserta y al final se actualiza.
 */
function fakeClient(opts?: { cabecera?: unknown; updateRows?: unknown[] }) {
  const ops: string[] = [];
  const insertados: Array<Record<string, unknown>> = [];
  const actualizado: Record<string, unknown> = {};
  const client = {
    ops,
    insertados,
    actualizado,
    from(table: string) {
      if (table === "inventory_count_items") {
        return {
          delete: () => ({
            eq: () => ({
              eq: () => {
                ops.push("delete-items");
                return Promise.resolve({ error: null });
              },
            }),
          }),
          insert: async (rows: Array<Record<string, unknown>>) => {
            ops.push("insert-items");
            insertados.push(...rows);
            return { error: null };
          },
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => {
                ops.push("select-count");
                return {
                  data:
                    opts?.cabecera === undefined
                      ? { id: "srv-1", warehouse_id: "wh1" }
                      : opts.cabecera,
                  error: null,
                };
              },
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          Object.assign(actualizado, patch);
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  // Un UPDATE de 0 filas NO es éxito: se devuelve lo que diga el test.
                  then: (res: (v: { data: unknown[]; error: null }) => unknown) => {
                    ops.push("update-count");
                    return Promise.resolve(
                      res({ data: opts?.updateRows ?? [{ id: "srv-1" }], error: null }),
                    );
                  },
                }),
              }),
            }),
          };
        },
      };
    },
  };
  return client as never;
}

describe("consolidateCountItems", () => {
  it("borra los ítems viejos, inserta los nuevos y fija el estado", async () => {
    const sb = fakeClient();
    await consolidateCountItems(sb, ctx, "srv-1", { items, status: "approved" });
    const c = sb as unknown as {
      ops: string[];
      insertados: Array<Record<string, unknown>>;
      actualizado: Record<string, unknown>;
    };
    expect(c.ops).toEqual([
      "select-count",
      "delete-items",
      "insert-items",
      "update-count",
    ]);
    expect(c.insertados).toHaveLength(1);
    expect(c.actualizado.status).toBe("approved");
    expect(c.actualizado.item_count).toBe(1);
  });

  it("hereda el almacén de la cabecera cuando el ítem no trae uno", async () => {
    const sb = fakeClient();
    await consolidateCountItems(sb, ctx, "srv-1", { items, status: "approved" });
    const c = sb as unknown as { insertados: Array<Record<string, unknown>> };
    expect(c.insertados[0]!.warehouse_id).toBe("wh1");
  });

  it("nunca envía difference_quantity, que es GENERATED ALWAYS", async () => {
    const sb = fakeClient();
    await consolidateCountItems(sb, ctx, "srv-1", { items, status: "adjusted" });
    const c = sb as unknown as { insertados: Array<Record<string, unknown>> };
    expect(c.insertados[0]).not.toHaveProperty("difference_quantity");
  });

  it("falla si el conteo no es de este negocio", async () => {
    const sb = fakeClient({ cabecera: null });
    await expect(
      consolidateCountItems(sb, ctx, "ajeno", { items, status: "approved" }),
    ).rejects.toThrow();
  });

  it("falla si el UPDATE no afecta ninguna fila", async () => {
    const sb = fakeClient({ updateRows: [] });
    await expect(
      consolidateCountItems(sb, ctx, "srv-1", { items, status: "approved" }),
    ).rejects.toThrow();
  });
});
