import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authorizeRole = vi.fn();
const getRepoContext = vi.fn(async () => ({ businessId: "biz-1", userId: "u1", userName: "Ana Admin" }));
const dryRunMergeImpact = vi.fn();
const mergeClients = vi.fn();
const auditLog = vi.fn();
const env = { DATA_SOURCE: "supabase" };

vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/server/auth/require-role", () => ({ authorizeRole }));
vi.mock("@/server/auth/context", () => ({ getRepoContext }));
vi.mock("@/lib/supabase/server", () => ({ createServer: async () => ({}) }));
vi.mock("@/server/services/customers/merge-clients", () => ({ dryRunMergeImpact, mergeClients }));
vi.mock("@/server/repositories", () => ({ getRepositories: () => ({ audit: { log: auditLog } }) }));

const { POST } = await import("./route");
const PRIMARY = "11111111-1111-4111-8111-111111111111";
const DUP = "22222222-2222-4222-8222-222222222222";
const pedir = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/customers/merge", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  env.DATA_SOURCE = "supabase";
  authorizeRole.mockReset().mockResolvedValue({ ok: true, session: {} });
  dryRunMergeImpact.mockReset().mockResolvedValue([{ table: "ar_promises", count: 3 }]);
  mergeClients.mockReset().mockResolvedValue({
    primaryId: PRIMARY,
    duplicateId: DUP,
    moved: [{ table: "ar_promises", count: 3 }],
  });
  auditLog.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/customers/merge", () => {
  it("400 si falta primaryId o duplicateId, o no son UUID", async () => {
    expect((await pedir({ primaryId: PRIMARY })).status).toBe(400);
    expect((await pedir({ primaryId: "no-uuid", duplicateId: DUP })).status).toBe(400);
  });

  it("400 si primaryId === duplicateId", async () => {
    expect((await pedir({ primaryId: PRIMARY, duplicateId: PRIMARY })).status).toBe(400);
  });

  it("dryRun:true cuenta el impacto y NO llama a mergeClients ni registra auditoría", async () => {
    const res = await pedir({ primaryId: PRIMARY, duplicateId: DUP, dryRun: true });
    expect(res.status).toBe(200);
    expect((await res.json()).moved).toEqual([{ table: "ar_promises", count: 3 }]);
    expect(mergeClients).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("sin dryRun fusiona de verdad y registra auditoría customer.merge", async () => {
    const res = await pedir({ primaryId: PRIMARY, duplicateId: DUP });
    expect(res.status).toBe(200);
    expect(mergeClients).toHaveBeenCalledWith(expect.anything(), PRIMARY, DUP);
    expect(auditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "customer.merge", entityId: PRIMARY }),
    );
  });

  it("403 si el rol no puede", async () => {
    authorizeRole.mockResolvedValue({ ok: false, res: new Response(null, { status: 403 }) });
    expect((await pedir({ primaryId: PRIMARY, duplicateId: DUP })).status).toBe(403);
  });

  it("409 en modo mock", async () => {
    env.DATA_SOURCE = "mock";
    expect((await pedir({ primaryId: PRIMARY, duplicateId: DUP })).status).toBe(409);
  });
});
