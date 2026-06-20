import { describe, it, expect, afterEach } from "vitest";
import {
  mockRepositories,
  __resetPurchasesMockWrites,
  __resetLookupsMockWrites,
} from "@/server/repositories/mock";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import type { RepoContext } from "@/server/repositories";

const ctx: RepoContext = { businessId: mockBusiness.id, userId: "usr_test" };

afterEach(() => {
  __resetPurchasesMockWrites();
  __resetLookupsMockWrites();
});

// ─── SupplierInvoice ─────────────────────────────────────────────────────────

const baseInvoiceInput = {
  businessId: mockBusiness.id,
  supplierName: "Farmacéutica ABC",
  number: "FAC-0001",
  issueDate: "2026-06-01",
  branchId: "branch_001",
  items: [
    {
      name: "Crema hidratante",
      quantity: 2,
      unitCost: 500,
      itbis: 90,
      total: 1090,
    },
  ],
};

describe("SupplierInvoiceRepository (mock) — create", () => {
  it("create() agrega una factura y la lista", async () => {
    const created = await mockRepositories.supplierInvoice.create(ctx, baseInvoiceInput);
    expect(created.id).toBeTruthy();
    expect(created.supplierName).toBe("Farmacéutica ABC");
    const all = await mockRepositories.supplierInvoice.list(ctx);
    expect(all.some((i) => i.id === created.id)).toBe(true);
  });

  it("create() asigna businessId del ctx", async () => {
    const created = await mockRepositories.supplierInvoice.create(ctx, {
      ...baseInvoiceInput,
      businessId: "otro_biz",
    });
    expect(created.businessId).toBe(ctx.businessId);
  });

  it("create() calcula total correctamente", async () => {
    const created = await mockRepositories.supplierInvoice.create(ctx, baseInvoiceInput);
    // subtotal=1000, itbis=90, discount=0, total=1090
    expect(created.total).toBe(1090);
  });
});

describe("SupplierInvoiceRepository (mock) — update", () => {
  it("update() aplica patch de status", async () => {
    const created = await mockRepositories.supplierInvoice.create(ctx, baseInvoiceInput);
    const updated = await mockRepositories.supplierInvoice.update(ctx, created.id, { status: "pagada" });
    expect(updated.status).toBe("pagada");
  });

  it("update() lanza si no existe", async () => {
    await expect(
      mockRepositories.supplierInvoice.update(ctx, "no_existe", { status: "pagada" }),
    ).rejects.toThrow("Factura no encontrada");
  });
});

describe("SupplierInvoiceRepository (mock) — softDelete", () => {
  it("softDelete() la saca del list", async () => {
    const created = await mockRepositories.supplierInvoice.create(ctx, baseInvoiceInput);
    await mockRepositories.supplierInvoice.softDelete(ctx, created.id);
    const all = await mockRepositories.supplierInvoice.list(ctx);
    expect(all.some((i) => i.id === created.id)).toBe(false);
  });
});

// ─── Expense ─────────────────────────────────────────────────────────────────

const baseExpenseInput = {
  businessId: mockBusiness.id,
  date: "2026-06-01",
  category: "Suministros",
  payee: "Tienda X",
  concept: "Papel de impresora",
  amount: 250,
  method: "efectivo" as const,
  branchId: "branch_001",
};

describe("ExpenseRepository (mock) — create", () => {
  it("create() agrega un gasto y lo lista", async () => {
    const created = await mockRepositories.expense.create(ctx, baseExpenseInput);
    expect(created.id).toBeTruthy();
    expect(created.concept).toBe("Papel de impresora");
    const all = await mockRepositories.expense.list(ctx);
    expect(all.some((e) => e.id === created.id)).toBe(true);
  });

  it("create() asigna businessId del ctx", async () => {
    const created = await mockRepositories.expense.create(ctx, {
      ...baseExpenseInput,
      businessId: "otro_biz",
    });
    expect(created.businessId).toBe(ctx.businessId);
  });

  it("create() status es 'pagado' por defecto", async () => {
    const created = await mockRepositories.expense.create(ctx, baseExpenseInput);
    expect(created.status).toBe("pagado");
  });
});

describe("ExpenseRepository (mock) — update", () => {
  it("update() aplica patch de status", async () => {
    const created = await mockRepositories.expense.create(ctx, baseExpenseInput);
    const updated = await mockRepositories.expense.update(ctx, created.id, { status: "anulado" });
    expect(updated.status).toBe("anulado");
  });

  it("update() lanza si no existe", async () => {
    await expect(
      mockRepositories.expense.update(ctx, "no_existe", { status: "anulado" }),
    ).rejects.toThrow("Gasto no encontrado");
  });
});

describe("ExpenseRepository (mock) — softDelete", () => {
  it("softDelete() lo saca del list", async () => {
    const created = await mockRepositories.expense.create(ctx, baseExpenseInput);
    await mockRepositories.expense.softDelete(ctx, created.id);
    const all = await mockRepositories.expense.list(ctx);
    expect(all.some((e) => e.id === created.id)).toBe(false);
  });
});

describe("ExpenseRepository (mock) — list con filtros", () => {
  it("list() filtra por petty=true", async () => {
    await mockRepositories.expense.create(ctx, { ...baseExpenseInput, petty: true });
    await mockRepositories.expense.create(ctx, { ...baseExpenseInput, concept: "No menor", petty: false });
    const pettyList = await mockRepositories.expense.list(ctx, { petty: true });
    expect(pettyList.every((e) => e.petty)).toBe(true);
  });
});

// ─── RecurringExpense ─────────────────────────────────────────────────────────

const baseRecurringInput = {
  businessId: mockBusiness.id,
  name: "Alquiler oficina",
  category: "Alquiler",
  amount: 15000,
  frequency: "mensual" as const,
  startDate: "2026-01-01",
  branchId: "branch_001",
  method: "transferencia" as const,
};

describe("RecurringExpenseRepository (mock) — create", () => {
  it("create() agrega un pago recurrente y lo lista", async () => {
    const created = await mockRepositories.recurringExpense.create(ctx, baseRecurringInput);
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Alquiler oficina");
    expect(created.status).toBe("active");
    const all = await mockRepositories.recurringExpense.list(ctx);
    expect(all.some((r) => r.id === created.id)).toBe(true);
  });
});

describe("RecurringExpenseRepository (mock) — update", () => {
  it("update() cambia status a inactive", async () => {
    const created = await mockRepositories.recurringExpense.create(ctx, baseRecurringInput);
    const updated = await mockRepositories.recurringExpense.update(ctx, created.id, { status: "inactive" });
    expect(updated.status).toBe("inactive");
  });
});

describe("RecurringExpenseRepository (mock) — softDelete", () => {
  it("softDelete() lo saca del list", async () => {
    const created = await mockRepositories.recurringExpense.create(ctx, baseRecurringInput);
    await mockRepositories.recurringExpense.softDelete(ctx, created.id);
    const all = await mockRepositories.recurringExpense.list(ctx);
    expect(all.some((r) => r.id === created.id)).toBe(false);
  });
});

// ─── Acciones secundarias ─────────────────────────────────────────────────────

describe("SupplierInvoiceRepository (mock) — void", () => {
  it("void() cambia status a anulada", async () => {
    const created = await mockRepositories.supplierInvoice.create(ctx, baseInvoiceInput);
    const voided = await mockRepositories.supplierInvoice.void(ctx, created.id);
    expect(voided.status).toBe("anulada");
  });

  it("void() lanza si no existe", async () => {
    await expect(
      mockRepositories.supplierInvoice.void(ctx, "no_existe"),
    ).rejects.toThrow("Factura no encontrada");
  });
});

describe("SupplierInvoiceRepository (mock) — registerPayment", () => {
  it("registerPayment() parcial actualiza paid y status=parcial", async () => {
    const created = await mockRepositories.supplierInvoice.create(ctx, baseInvoiceInput);
    const paid = await mockRepositories.supplierInvoice.registerPayment(ctx, created.id, 500, "efectivo");
    expect(paid.paid).toBe(500);
    expect(paid.status).toBe("parcial");
  });

  it("registerPayment() completo actualiza paid y status=pagada", async () => {
    const created = await mockRepositories.supplierInvoice.create(ctx, baseInvoiceInput);
    const paid = await mockRepositories.supplierInvoice.registerPayment(ctx, created.id, created.total, "transferencia");
    expect(paid.paid).toBe(paid.total);
    expect(paid.status).toBe("pagada");
  });

  it("registerPayment() no permite monto <= 0", async () => {
    const created = await mockRepositories.supplierInvoice.create(ctx, baseInvoiceInput);
    await expect(
      mockRepositories.supplierInvoice.registerPayment(ctx, created.id, 0, "efectivo"),
    ).rejects.toThrow("El monto debe ser mayor a 0.");
  });

  it("registerPayment() no permite pagar factura anulada", async () => {
    const created = await mockRepositories.supplierInvoice.create(ctx, baseInvoiceInput);
    await mockRepositories.supplierInvoice.void(ctx, created.id);
    await expect(
      mockRepositories.supplierInvoice.registerPayment(ctx, created.id, 100, "efectivo"),
    ).rejects.toThrow("La factura está anulada.");
  });
});

describe("ExpenseRepository (mock) — void", () => {
  it("void() cambia status a anulado", async () => {
    const created = await mockRepositories.expense.create(ctx, baseExpenseInput);
    const voided = await mockRepositories.expense.void(ctx, created.id);
    expect(voided.status).toBe("anulado");
  });

  it("void() lanza si no existe", async () => {
    await expect(
      mockRepositories.expense.void(ctx, "no_existe"),
    ).rejects.toThrow("Gasto no encontrado");
  });
});

describe("RecurringExpenseRepository (mock) — setActive", () => {
  it("setActive(false) pone status=inactive", async () => {
    const created = await mockRepositories.recurringExpense.create(ctx, baseRecurringInput);
    const updated = await mockRepositories.recurringExpense.setActive(ctx, created.id, false);
    expect(updated.status).toBe("inactive");
  });

  it("setActive(true) pone status=active desde inactive", async () => {
    const created = await mockRepositories.recurringExpense.create(ctx, baseRecurringInput);
    await mockRepositories.recurringExpense.setActive(ctx, created.id, false);
    const reactivated = await mockRepositories.recurringExpense.setActive(ctx, created.id, true);
    expect(reactivated.status).toBe("active");
  });
});

describe("RecurringExpenseRepository (mock) — generateRun", () => {
  it("generateRun() crea un expense y retorna run con expenseId", async () => {
    const created = await mockRepositories.recurringExpense.create(ctx, baseRecurringInput);
    const { expense: exp, run } = await mockRepositories.recurringExpense.generateRun(ctx, created.id);
    expect(exp.id).toBeTruthy();
    expect(exp.concept).toContain("recurrente");
    expect(exp.amount).toBe(baseRecurringInput.amount);
    expect(run.expenseId).toBe(exp.id);
    expect(run.paidAt).toBeTruthy();
  });

  it("generateRun() lanza si el recurrente está inactivo", async () => {
    const created = await mockRepositories.recurringExpense.create(ctx, baseRecurringInput);
    await mockRepositories.recurringExpense.setActive(ctx, created.id, false);
    await expect(
      mockRepositories.recurringExpense.generateRun(ctx, created.id),
    ).rejects.toThrow("inactivo");
  });

  it("generateRun() lanza si no existe", async () => {
    await expect(
      mockRepositories.recurringExpense.generateRun(ctx, "no_existe"),
    ).rejects.toThrow("no encontrado");
  });
});

// ─── Lookups: SupplierRepository / ExpenseCategoryRepository ─────────────────

describe("SupplierRepository (mock) — list + create", () => {
  it("list() empieza vacío por tenant", async () => {
    const all = await mockRepositories.supplier.list(ctx);
    expect(all).toEqual([]);
  });

  it("create() agrega un proveedor y lo lista", async () => {
    const created = await mockRepositories.supplier.create(ctx, { name: "Farmacéutica DEF", rnc: "123456789" });
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Farmacéutica DEF");
    expect(created.rnc).toBe("123456789");
    const all = await mockRepositories.supplier.list(ctx);
    expect(all.some((s) => s.id === created.id)).toBe(true);
  });

  it("create() asigna businessId del ctx", async () => {
    const created = await mockRepositories.supplier.create(ctx, { name: "Test" });
    expect(created.businessId).toBe(ctx.businessId);
  });

  it("list() no mezcla tenants", async () => {
    await mockRepositories.supplier.create(ctx, { name: "Proveedor A" });
    const otherCtx: RepoContext = { businessId: "biz_otro", userId: "usr_otro" };
    const otherList = await mockRepositories.supplier.list(otherCtx);
    expect(otherList).toEqual([]);
  });
});

describe("ExpenseCategoryRepository (mock) — list + create", () => {
  it("list() empieza vacío por tenant", async () => {
    const all = await mockRepositories.expenseCategory.list(ctx);
    expect(all).toEqual([]);
  });

  it("create() agrega una categoría y la lista", async () => {
    const created = await mockRepositories.expenseCategory.create(ctx, { name: "Seguros" });
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Seguros");
    const all = await mockRepositories.expenseCategory.list(ctx);
    expect(all.some((c) => c.id === created.id)).toBe(true);
  });

  it("create() asigna businessId del ctx", async () => {
    const created = await mockRepositories.expenseCategory.create(ctx, { name: "Test" });
    expect(created.businessId).toBe(ctx.businessId);
  });
});
