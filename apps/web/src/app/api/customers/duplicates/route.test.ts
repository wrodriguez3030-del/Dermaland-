import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authorizeRole = vi.fn();
const env = { DATA_SOURCE: "supabase" };

function fakeClientsBuilder(rows: unknown[]) {
  const q = {
    select: () => q,
    eq: () => q,
    is: () => q,
    order: () => q,
    range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
  };
  return { from: () => q };
}

vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/server/auth/require-role", () => ({ authorizeRole }));

const ROW = (over: Record<string, unknown>) => ({
  id: "id",
  business_id: "biz-1",
  customer_number: "CLI-1",
  first_name: "Ana",
  last_name: "Perez",
  document_type: null,
  document_number: null,
  phone: null,
  whatsapp: null,
  email: null,
  birth_date: null,
  address: null,
  city: null,
  province: null,
  source: "manual",
  tags: [],
  default_billing_type: "consumo",
  skin_type: "not_specified",
  total_spent: 0,
  total_orders: 0,
  last_visit_at: null,
  notes: null,
  consents: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  deleted_at: null,
  ...over,
});

let rows: unknown[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createServer: async () => fakeClientsBuilder(rows),
}));

const { GET } = await import("./route");
const pedir = () => GET(new NextRequest("http://localhost/api/customers/duplicates"));

beforeEach(() => {
  env.DATA_SOURCE = "supabase";
  authorizeRole.mockReset().mockResolvedValue({ ok: true, session: { businessId: "biz-1" } });
  rows = [];
});

describe("GET /api/customers/duplicates", () => {
  it("403 si el rol no puede (authorizeRole se llama con roles de riesgo)", async () => {
    authorizeRole.mockResolvedValue({
      ok: false,
      res: new Response(JSON.stringify({ error: "no" }), { status: 403 }),
    });
    const res = await pedir();
    expect(res.status).toBe(403);
  });

  it("devuelve los pares detectados entre TODOS los clientes activos del negocio", async () => {
    rows = [
      ROW({ id: "a", document_number: "00111111111" }),
      ROW({ id: "b", document_number: "00111111111" }),
      ROW({ id: "c", document_number: "00222222222" }),
    ];
    const res = await pedir();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pairs).toHaveLength(1);
    expect([body.pairs[0].a.id, body.pairs[0].b.id].sort()).toEqual(["a", "b"]);
  });

  it("409 en modo mock (solo disponible con Supabase)", async () => {
    env.DATA_SOURCE = "mock";
    const res = await pedir();
    expect(res.status).toBe(409);
  });
});
