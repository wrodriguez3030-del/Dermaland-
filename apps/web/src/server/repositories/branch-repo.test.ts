import { describe, it, expect } from "vitest";
import { mockRepositories } from "@/server/repositories/mock";
import { mockBranches, mockBusiness } from "@/lib/mock-data/tenancy";
import { BRANCH_BACKEND } from "@/features/tenancy/branch-store";
import type { RepoContext } from "@/server/repositories";

const ctx: RepoContext = { businessId: mockBusiness.id, userId: "usr_test" };

describe("BranchRepository (mock) — fuente única", () => {
  it("list() devuelve todas las sucursales del negocio (admin)", async () => {
    const all = await mockRepositories.branch.list(ctx);
    expect(all.length).toBe(mockBranches.length);
    expect(all.every((b) => b.businessId === mockBusiness.id)).toBe(true);
  });

  it("list({activeOnly}) excluye inactivas (operación)", async () => {
    const active = await mockRepositories.branch.list(ctx, { activeOnly: true });
    expect(active.every((b) => b.status === "active")).toBe(true);
    const allCount = (await mockRepositories.branch.list(ctx)).length;
    expect(active.length).toBeLessThanOrEqual(allCount);
  });

  it("byId respeta el business_id", async () => {
    const b = await mockRepositories.branch.byId(ctx, mockBranches[0]!.id);
    expect(b?.id).toBe(mockBranches[0]!.id);
  });

  it("create/update/softDelete no disponibles en mock (se usa store local)", async () => {
    await expect(mockRepositories.branch.create(ctx, {} as never)).rejects.toThrow();
    await expect(mockRepositories.branch.update(ctx, "x", {})).rejects.toThrow();
    await expect(mockRepositories.branch.softDelete(ctx, "x")).rejects.toThrow();
  });
});

describe("BRANCH_BACKEND", () => {
  it("por defecto es 'local' (sin NEXT_PUBLIC_DATA_SOURCE=supabase)", () => {
    expect(BRANCH_BACKEND).toBe("local");
  });
});
