import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * `GET /api/alegra/invoices/items` ejecutada de verdad, con el portero y la
 * consulta falsos.
 *
 * 🔴 Lo que protege: la ficha del cliente pinta los ítems de TODAS las compras
 * migradas que enseña, así que la ruta pasó de una factura a un puñado. Un
 * puñado sin tope es una URL que revienta (o una consulta que se lleva medio
 * histórico por accidente), y una ruta que devuelve `[]` en vez de un 400 ante
 * un id inválido es una celda vacía indistinguible de «esta factura no llevaba
 * nada» — el mismo fallo mudo que este bloque existe para cerrar.
 */

const authorizeRole = vi.fn();
const getRepoContext = vi.fn(async () => ({ businessId: "b1" }));
const lineasDeFacturas = vi.fn(async (_ctx: { businessId: string }, _ids: string[]) => [
  { invoiceId: "11111111-1111-4111-8111-111111111111", productId: null, name: "Crema", quantity: 2, total: 500 },
]);
const env = { DATA_SOURCE: "supabase" };

vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/server/auth/require-role", () => ({ authorizeRole }));
vi.mock("@/server/auth/context", () => ({ getRepoContext }));
vi.mock("@/server/repositories/supabase/client", () => ({
  toUserFacingMessage: (_e: unknown, porDefecto: string) => porDefecto,
}));
vi.mock("@/server/services/alegra/queries", () => ({ lineasDeFacturas }));

const { GET } = await import("./route");

const uuid = (n: number) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const pedir = (query: string) =>
  GET(new NextRequest(`http://localhost/api/alegra/invoices/items?${query}`));

beforeEach(() => {
  env.DATA_SOURCE = "supabase";
  authorizeRole.mockReset().mockResolvedValue({ ok: true });
  lineasDeFacturas.mockClear();
});

describe("GET /api/alegra/invoices/items", () => {
  it("sigue aceptando una sola factura (`invoiceId`)", async () => {
    const res = await pedir(`invoiceId=${uuid(1)}`);
    expect(res.status).toBe(200);
    expect(lineasDeFacturas.mock.calls[0]?.[1]).toEqual([uuid(1)]);
    expect((await res.json()).items).toHaveLength(1);
  });

  it("🔴 acepta varias facturas de una vez (`invoiceIds`)", async () => {
    const res = await pedir(`invoiceIds=${uuid(1)},${uuid(2)},${uuid(3)}`);
    expect(res.status).toBe(200);
    expect(lineasDeFacturas.mock.calls[0]?.[1]).toEqual([uuid(1), uuid(2), uuid(3)]);
  });

  it("🔴 más de 50 facturas es un 400, no una consulta gigante", async () => {
    const muchas = Array.from({ length: 51 }, (_, i) => uuid(i + 1)).join(",");
    const res = await pedir(`invoiceIds=${muchas}`);
    expect(res.status).toBe(400);
    expect(lineasDeFacturas).not.toHaveBeenCalled();
  });

  it("50 justas sí pasan: el tope no se pasa de estricto", async () => {
    const justas = Array.from({ length: 50 }, (_, i) => uuid(i + 1)).join(",");
    expect((await pedir(`invoiceIds=${justas}`)).status).toBe(200);
  });

  it("🔴 un id que no es uuid es un 400, no una lista vacía", async () => {
    const res = await pedir("invoiceIds=no-es-uuid");
    expect(res.status).toBe(400);
    expect(lineasDeFacturas).not.toHaveBeenCalled();
  });

  it("🔴 sin ningún parámetro es un 400", async () => {
    expect((await pedir("")).status).toBe(400);
    expect(lineasDeFacturas).not.toHaveBeenCalled();
  });

  it("respeta al portero: sin permiso no se consulta nada", async () => {
    authorizeRole.mockResolvedValue({
      ok: false,
      res: new Response(null, { status: 403 }),
    });
    expect((await pedir(`invoiceId=${uuid(1)}`)).status).toBe(403);
    expect(lineasDeFacturas).not.toHaveBeenCalled();
  });
});
