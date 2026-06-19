import { describe, it, expect } from "vitest";
import { mockRepositories } from "@/server/repositories/mock";
import { mockBusiness, mockBranches } from "@/lib/mock-data/tenancy";
import type { RepoContext } from "@/server/repositories";

const ctx: RepoContext = {
  businessId: mockBusiness.id,
  branchId: mockBranches[0]?.id ?? "br_santiago",
  userId: "usr_test",
};

describe("CashRegisterRepository (mock) — current", () => {
  it("current() devuelve la sesión abierta del seed o null", async () => {
    const session = await mockRepositories.cashRegister.current(ctx);
    // El seed puede tener o no sesión abierta; lo importante es que no lanza.
    expect(session === null || typeof session === "object").toBe(true);
    if (session !== null) {
      expect(session.businessId).toBe(ctx.businessId);
      expect(session.status).toBe("open");
    }
  });

  it("current() filtra por businessId — otro tenant no ve la sesión", async () => {
    const otherCtx: RepoContext = {
      businessId: "biz_otro",
      userId: "usr_otro",
    };
    const session = await mockRepositories.cashRegister.current(otherCtx);
    expect(session).toBeNull();
  });
});

describe("CashRegisterRepository (mock) — history", () => {
  it("history() devuelve array (puede estar vacío)", async () => {
    const sessions = await mockRepositories.cashRegister.history(ctx);
    expect(Array.isArray(sessions)).toBe(true);
  });

  it("history() respeta límite 30 por defecto", async () => {
    const sessions = await mockRepositories.cashRegister.history(ctx);
    expect(sessions.length).toBeLessThanOrEqual(30);
  });

  it("history() filtra por businessId", async () => {
    const sessions = await mockRepositories.cashRegister.history(ctx);
    expect(sessions.every((s) => s.businessId === ctx.businessId)).toBe(true);
  });

  it("history() con límite personalizado", async () => {
    const sessions = await mockRepositories.cashRegister.history(ctx, 5);
    expect(sessions.length).toBeLessThanOrEqual(5);
  });
});

describe("CashRegisterRepository (mock) — open / close", () => {
  it("open() lanza — requiere backend Supabase", async () => {
    await expect(
      mockRepositories.cashRegister.open(ctx, 1000),
    ).rejects.toThrow("open() requiere backend Supabase");
  });

  it("close() lanza — requiere backend Supabase", async () => {
    await expect(
      mockRepositories.cashRegister.close(ctx, "sess_fake_001", 1500),
    ).rejects.toThrow("close() requiere backend Supabase");
  });
});
