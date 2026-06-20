import { describe, it, expect, afterEach } from "vitest";
import {
  mockRepositories,
  __resetCustomerMockWrites,
} from "@/server/repositories/mock";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import type { RepoContext } from "@/server/repositories";

const ctx: RepoContext = { businessId: mockBusiness.id, userId: "usr_test" };

const baseInput = {
  businessId: mockBusiness.id,
  customerNumber: "",
  firstName: "Test",
  lastName: "Cliente",
  source: "manual" as const,
  tags: [] as string[],
  defaultBillingType: "consumo" as const,
  skinType: "not_specified" as const,
  totalSpent: 0,
  totalOrders: 0,
  consents: [] as { templateId: string; grantedAt: string }[],
  phone: "809-555-0000",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

afterEach(() => {
  __resetCustomerMockWrites();
});

describe("CustomerRepository (mock) — create", () => {
  it("create() agrega un cliente y lo lista", async () => {
    const created = await mockRepositories.customer.create(ctx, baseInput);
    expect(created.id).toBeTruthy();
    expect(created.firstName).toBe("Test");
    const all = await mockRepositories.customer.list(ctx);
    expect(all.some((c) => c.id === created.id)).toBe(true);
  });

  it("create() asigna businessId del ctx, no del input", async () => {
    const created = await mockRepositories.customer.create(ctx, {
      ...baseInput,
      businessId: "otro_biz",
    });
    expect(created.businessId).toBe(ctx.businessId);
  });
});

describe("CustomerRepository (mock) — update", () => {
  it("update() aplica patch de nombre", async () => {
    const created = await mockRepositories.customer.create(ctx, baseInput);
    const updated = await mockRepositories.customer.update(ctx, created.id, {
      firstName: "Modificado",
    });
    expect(updated.firstName).toBe("Modificado");
    expect(updated.lastName).toBe("Cliente");
  });

  it("update() sobre cliente seed aplica el patch", async () => {
    // cust_001 viene del seed
    const all = await mockRepositories.customer.list(ctx);
    const seed = all.find((c) => c.id === "cust_001");
    expect(seed).toBeTruthy();
    if (!seed) return;
    const updated = await mockRepositories.customer.update(ctx, seed.id, {
      notes: "Nota de prueba",
    });
    expect(updated.notes).toBe("Nota de prueba");
  });

  it("update() lanza si el cliente no existe", async () => {
    await expect(
      mockRepositories.customer.update(ctx, "no_existe", { firstName: "X" }),
    ).rejects.toThrow("Cliente no encontrado");
  });
});

describe("CustomerRepository (mock) — softDelete", () => {
  it("softDelete() lo saca del list", async () => {
    const created = await mockRepositories.customer.create(ctx, baseInput);
    expect((await mockRepositories.customer.list(ctx)).some((c) => c.id === created.id)).toBe(true);
    await mockRepositories.customer.softDelete(ctx, created.id);
    expect((await mockRepositories.customer.list(ctx)).some((c) => c.id === created.id)).toBe(false);
  });

  it("softDelete() oculta un cliente seed del list", async () => {
    const all = await mockRepositories.customer.list(ctx);
    const seed = all.find((c) => c.id === "cust_001");
    expect(seed).toBeTruthy();
    if (!seed) return;
    await mockRepositories.customer.softDelete(ctx, seed.id);
    const after = await mockRepositories.customer.list(ctx);
    expect(after.some((c) => c.id === "cust_001")).toBe(false);
  });
});

describe("CustomerRepository (mock) — list con search", () => {
  it("list() filtra por nombre", async () => {
    await mockRepositories.customer.create(ctx, {
      ...baseInput,
      firstName: "Única",
      lastName: "Prueba",
    });
    const r = await mockRepositories.customer.list(ctx, { search: "Única" });
    expect(r.some((c) => c.firstName === "Única")).toBe(true);
  });

  it("list() retorna clientes del business correcto", async () => {
    const all = await mockRepositories.customer.list(ctx);
    expect(all.every((c) => c.businessId === ctx.businessId)).toBe(true);
  });
});
