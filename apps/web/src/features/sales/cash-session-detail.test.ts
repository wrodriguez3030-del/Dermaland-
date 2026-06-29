import { describe, it, expect } from "vitest";
import type { CashRegisterSession, PaymentMethod, Proforma } from "@/types";
import { computeShiftDetail, type CashShiftMovement } from "./cash-session-detail";

const SESSION_ID = "sess_1";

function session(over: Partial<CashRegisterSession> = {}): CashRegisterSession {
  return {
    id: SESSION_ID,
    sessionNumber: "CAJA-001",
    cashierId: "u1",
    cashierName: "Rosa Peralta",
    branchId: "b1",
    businessId: "biz1",
    openedAt: "2026-06-29T13:00:00Z",
    openingAmount: 1000,
    expectedCash: 1000,
    totals: {} as Record<PaymentMethod, number>,
    proformaIds: [],
    status: "open",
    createdAt: "2026-06-29T13:00:00Z",
    updatedAt: "2026-06-29T13:00:00Z",
    ...over,
  } as CashRegisterSession;
}

let seq = 0;
function sale(
  method: PaymentMethod,
  amount: number,
  over: Partial<Proforma> = {},
): Proforma {
  seq += 1;
  return {
    id: `p${seq}`,
    number: `PROF-${seq}`,
    customerName: "Cliente",
    cashierId: "u1",
    cashierName: "Rosa",
    branchId: "b1",
    cashRegisterSessionId: SESSION_ID,
    items: [],
    subtotal: amount,
    discount: 0,
    itbis: 0,
    total: amount,
    status: "paid",
    payments: [
      { id: `pay${seq}`, proformaId: `p${seq}`, method, amount, userId: "u1", userName: "Rosa", createdAt: "x" },
    ],
    paid: amount,
    balance: 0,
    createdAt: "2026-06-29T13:30:00Z",
    updatedAt: "2026-06-29T13:30:00Z",
    ...over,
  } as Proforma;
}

describe("computeShiftDetail — desglose por método", () => {
  it("agrega efectivo, tarjeta (procesadores), transferencia y otros", () => {
    const d = computeShiftDetail(session(), [
      sale("cash", 500),
      sale("card", 300),
      sale("azul", 200), // cuenta como tarjeta
      sale("transfer", 400),
      sale("paypal", 100), // otros
    ]);
    expect(d.salesCash).toBe(500);
    expect(d.salesCard).toBe(500); // card 300 + azul 200
    expect(d.salesTransfer).toBe(400);
    expect(d.salesOther).toBe(100);
    expect(d.totalSales).toBe(1500);
  });

  it("ignora proformas de otra sesión y las anuladas", () => {
    const d = computeShiftDetail(session(), [
      sale("cash", 500),
      sale("cash", 999, { cashRegisterSessionId: "otra" }),
      sale("cash", 777, { status: "cancelled" }),
    ]);
    expect(d.salesCash).toBe(500);
    expect(d.totalSales).toBe(500);
  });
});

describe("computeShiftDetail — dinero esperado en caja (solo efectivo)", () => {
  it("tarjeta y transferencia NO aumentan el efectivo físico", () => {
    const d = computeShiftDetail(session({ openingAmount: 1000 }), [
      sale("cash", 500),
      sale("card", 9000),
      sale("transfer", 8000),
    ]);
    // base 1000 + efectivo 500 = 1500 (tarjeta/transferencia fuera)
    expect(d.expectedCash).toBe(1500);
    // total de movimientos sí incluye todo: 1000+500+9000+8000
    expect(d.totalShiftMovements).toBe(18500);
  });

  it("ingresos suman y retiros/devoluciones restan (solo efectivo)", () => {
    const movements: CashShiftMovement[] = [
      { type: "income", amount: 200 },
      { type: "withdrawal", amount: 150 },
      { type: "refund", amount: 50 },
      { type: "withdrawal", amount: 999, method: "card" }, // no efectivo → ignora
    ];
    const d = computeShiftDetail(session({ openingAmount: 1000 }), [sale("cash", 500)], movements);
    // 1000 + 500 + 200 - 50 - 150 = 1500
    expect(d.expectedCash).toBe(1500);
    expect(d.cashIncome).toBe(200);
    expect(d.cashWithdrawal).toBe(150);
    expect(d.refundsCash).toBe(50);
  });

  it("calcula la diferencia cuando hay efectivo contado", () => {
    const d = computeShiftDetail(
      session({ openingAmount: 1000, countedCash: 1450 }),
      [sale("cash", 500)],
    );
    // esperado = 1500, contado = 1450 → diferencia -50
    expect(d.expectedCash).toBe(1500);
    expect(d.difference).toBe(-50);
  });

  it("sin conteo, diferencia es null", () => {
    const d = computeShiftDetail(session(), [sale("cash", 500)]);
    expect(d.countedCash).toBeNull();
    expect(d.difference).toBeNull();
  });
});
