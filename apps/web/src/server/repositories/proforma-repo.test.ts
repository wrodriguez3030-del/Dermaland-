import { describe, it, expect, afterEach } from "vitest";
import {
  mockRepositories,
  __resetProformaMockWrites,
} from "@/server/repositories/mock";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import type { RepoContext } from "@/server/repositories";

const ctx: RepoContext = { businessId: mockBusiness.id, userId: "usr_test" };

const baseInput = {
  businessId: mockBusiness.id,
  branchId: "br_santiago",
  number: "PROF-TEST-001",
  customerName: "Walk-in / Consumidor final",
  cashierId: "usr_cashier_1",
  cashierName: "Rosa Peralta",
  items: [
    {
      productId: "prod_001",
      productSku: "SKU-001",
      productName: "Producto Test",
      quantity: 1,
      unitPrice: 100,
      itbisRate: 18,
      discount: 0,
      subtotal: 84.75,
      itbis: 15.25,
      total: 100,
    },
  ],
  subtotal: 84.75,
  discount: 0,
  itbis: 15.25,
  total: 100,
  status: "paid" as const,
  payments: [
    {
      id: "pay_test_1",
      proformaId: "prof_placeholder",
      method: "cash" as const,
      amount: 100,
      userId: "usr_cashier_1",
      userName: "Rosa Peralta",
      createdAt: new Date().toISOString(),
    },
  ],
  paid: 100,
  balance: 0,
  documentKind: "proforma" as const,
};

afterEach(() => {
  __resetProformaMockWrites();
});

describe("ProformaRepository (mock) — list", () => {
  it("list() retorna proformas del seed", async () => {
    const all = await mockRepositories.proforma.list(ctx);
    expect(Array.isArray(all)).toBe(true);
    expect(all.every((p) => p.businessId === ctx.businessId)).toBe(true);
  });

  it("list() filtra por businessId — otro tenant no ve proformas", async () => {
    const otherCtx: RepoContext = { businessId: "biz_otro", userId: "usr_otro" };
    const all = await mockRepositories.proforma.list(otherCtx);
    expect(all.every((p) => p.businessId === "biz_otro")).toBe(true);
  });
});

describe("ProformaRepository (mock) — create", () => {
  it("create() agrega una proforma y aparece en list()", async () => {
    const created = await mockRepositories.proforma.create(ctx, baseInput);
    expect(created.id).toBeTruthy();
    expect(created.customerName).toBe("Walk-in / Consumidor final");
    const all = await mockRepositories.proforma.list(ctx);
    expect(all.some((p) => p.id === created.id)).toBe(true);
  });

  it("create() asigna businessId del ctx, no del input", async () => {
    const created = await mockRepositories.proforma.create(ctx, {
      ...baseInput,
      businessId: "otro_biz",
    });
    expect(created.businessId).toBe(ctx.businessId);
  });

  it("create() es recuperable por byId()", async () => {
    const created = await mockRepositories.proforma.create(ctx, baseInput);
    const found = await mockRepositories.proforma.byId(ctx, created.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
  });
});

describe("ProformaRepository (mock) — byId", () => {
  it("byId() retorna null si no existe", async () => {
    const found = await mockRepositories.proforma.byId(ctx, "prof_no_existe");
    expect(found).toBeNull();
  });

  it("byId() no devuelve proformas de otro tenant", async () => {
    const created = await mockRepositories.proforma.create(ctx, baseInput);
    const otherCtx: RepoContext = { businessId: "biz_otro", userId: "usr_otro" };
    const found = await mockRepositories.proforma.byId(otherCtx, created.id);
    expect(found).toBeNull();
  });
});

describe("ProformaRepository (mock) — cancel", () => {
  it("cancel() marca la proforma como cancelled", async () => {
    const created = await mockRepositories.proforma.create(ctx, baseInput);
    await mockRepositories.proforma.cancel(ctx, created.id, "Cancelado por prueba");
    const found = await mockRepositories.proforma.byId(ctx, created.id);
    expect(found?.status).toBe("cancelled");
    expect(found?.notes).toBe("Cancelado por prueba");
  });

  it("cancel() lanza si la proforma no existe", async () => {
    await expect(
      mockRepositories.proforma.cancel(ctx, "prof_no_existe", "razón"),
    ).rejects.toThrow("no encontrada");
  });
});

describe("ProformaRepository (mock) — updateFull", () => {
  it("recalcula el total al cambiar la cantidad y conserva el número/comprobante", async () => {
    const created = await mockRepositories.proforma.create(ctx, baseInput);
    const updated = await mockRepositories.proforma.updateFull(ctx, created.id, {
      customerName: "Cliente Editado",
      items: [
        {
          productId: "prod_001",
          productSku: "SKU-001",
          productName: "Producto Test",
          quantity: 2, // era 1
          unitPrice: 118,
          itbisRate: 18,
          discount: 0,
          subtotal: 200,
          itbis: 36,
          total: 236,
        },
      ],
      payments: [
        {
          id: "pay_x",
          proformaId: created.id,
          method: "cash",
          amount: 236,
          userId: "usr_cashier_1",
          userName: "Rosa Peralta",
          createdAt: new Date().toISOString(),
        },
      ],
      discountPercent: 0,
    });
    expect(updated.total).toBe(236);
    expect(updated.itbis).toBe(36);
    expect(updated.customerName).toBe("Cliente Editado");
    // Blindaje fiscal: el número NO cambia.
    expect(updated.number).toBe(created.number);
    expect(updated.items[0]!.quantity).toBe(2);
  });

  it("aplica descuento global recalculando total e ITBIS", async () => {
    const created = await mockRepositories.proforma.create(ctx, baseInput);
    const updated = await mockRepositories.proforma.updateFull(ctx, created.id, {
      items: [
        {
          productId: "prod_001",
          productSku: "SKU-001",
          productName: "Producto Test",
          quantity: 1,
          unitPrice: 118,
          itbisRate: 18,
          discount: 0,
          subtotal: 100,
          itbis: 18,
          total: 118,
        },
      ],
      payments: baseInput.payments,
      discountPercent: 10,
    });
    // 118 - 10% = 106.2 ; ITBIS escala proporcionalmente.
    expect(updated.total).toBe(106.2);
    expect(updated.discountPercent).toBe(10);
  });
});

describe("ProformaRepository (mock) — convertToEcf", () => {
  it("convertToEcf() lanza — requiere DGII activo (Fase G bloqueada)", async () => {
    await expect(
      mockRepositories.proforma.convertToEcf(ctx, "prof_any"),
    ).rejects.toThrow("convertToEcf() requiere DGII activo");
  });
});
