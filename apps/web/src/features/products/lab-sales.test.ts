import { describe, it, expect } from "vitest";
import { computeLabSales, summarizeLabSales } from "./lab-sales";
import type { Laboratory, Product, Proforma } from "@/types";

const labs: Laboratory[] = [
  { id: "lab_a", businessId: "b1", name: "Lab A", country: "RD", createdAt: "", updatedAt: "" },
  { id: "lab_b", businessId: "b1", name: "Lab B", country: "ES", createdAt: "", updatedAt: "" },
  { id: "lab_c", businessId: "b1", name: "Lab C (sin ventas)", country: "FR", createdAt: "", updatedAt: "" },
];

const products = [
  { id: "p1", laboratoryId: "lab_a" },
  { id: "p2", laboratoryId: "lab_b" },
  { id: "p3" }, // sin laboratorio
] as unknown as Product[];

function pf(over: Partial<Proforma>): Proforma {
  return {
    id: "x",
    number: "PROF",
    customerName: "C",
    cashierId: "u",
    cashierName: "U",
    businessId: "b1",
    branchId: "br_santiago",
    items: [],
    subtotal: 0,
    discount: 0,
    itbis: 0,
    total: 0,
    status: "paid",
    payments: [],
    paid: 0,
    balance: 0,
    createdAt: "2026-06-10T10:00:00Z",
    updatedAt: "2026-06-10T10:00:00Z",
    ...over,
  } as Proforma;
}

const item = (productId: string, quantity: number, total: number) =>
  ({ productId, quantity, total } as never);

describe("computeLabSales", () => {
  const proformas: Proforma[] = [
    pf({ items: [item("p1", 2, 2000), item("p2", 1, 500)] }),
    pf({ items: [item("p1", 1, 1000)] }),
    pf({ items: [item("p3", 5, 9999)] }), // sin lab → ignorado
    pf({ status: "draft", items: [item("p1", 99, 99999)] }), // no es venta
  ];

  it("suma ventas por laboratorio y ordena descendente", () => {
    const rows = computeLabSales(labs, products, proformas);
    expect(rows.map((r) => r.lab.id)).toEqual(["lab_a", "lab_b", "lab_c"]);
    expect(rows[0]!.totalMoney).toBe(3000); // 2000 + 1000
    expect(rows[0]!.units).toBe(3);
    expect(rows[1]!.totalMoney).toBe(500);
  });

  it("asigna ranking y % frente al líder", () => {
    const rows = computeLabSales(labs, products, proformas);
    expect(rows[0]!.rank).toBe(1);
    expect(rows[0]!.percentOfLeader).toBe(100);
    expect(rows[1]!.percentOfLeader).toBe(Math.round((500 / 3000) * 100));
  });

  it("laboratorio sin ventas aparece con 0", () => {
    const rows = computeLabSales(labs, products, proformas);
    const c = rows.find((r) => r.lab.id === "lab_c")!;
    expect(c.totalMoney).toBe(0);
    expect(c.units).toBe(0);
    expect(c.percentOfLeader).toBe(0);
  });

  it("ignora productos sin laboratorio y estados que no son venta (no rompe)", () => {
    const rows = computeLabSales(labs, products, proformas);
    const total = rows.reduce((s, r) => s + r.totalMoney, 0);
    expect(total).toBe(3500); // excluye p3 (sin lab) y la draft
  });

  it("filtra por sucursal", () => {
    const rows = computeLabSales(labs, products, [
      pf({ branchId: "br_naco", items: [item("p1", 1, 700)] }),
      pf({ branchId: "br_santiago", items: [item("p2", 1, 300)] }),
    ], { branchId: "br_naco" });
    expect(rows.find((r) => r.lab.id === "lab_a")!.totalMoney).toBe(700);
    expect(rows.find((r) => r.lab.id === "lab_b")!.totalMoney).toBe(0);
  });

  it("filtra por rango de fechas", () => {
    const rows = computeLabSales(labs, products, [
      pf({ createdAt: "2026-01-01T10:00:00Z", items: [item("p1", 1, 100)] }),
      pf({ createdAt: "2026-06-15T10:00:00Z", items: [item("p1", 1, 900)] }),
    ], { from: "2026-06-01", to: "2026-06-30" });
    expect(rows.find((r) => r.lab.id === "lab_a")!.totalMoney).toBe(900);
  });

  it("sin ventas: todos en 0 y summary.hasSales=false", () => {
    const rows = computeLabSales(labs, products, []);
    const sum = summarizeLabSales(rows);
    expect(sum.hasSales).toBe(false);
    expect(sum.leader).toBeUndefined();
    expect(sum.totalMoney).toBe(0);
  });
});

describe("summarizeLabSales", () => {
  it("calcula líder, totales y top3", () => {
    const proformas = [pf({ items: [item("p1", 2, 2000), item("p2", 1, 500)] })];
    const rows = computeLabSales(labs, products, proformas);
    const sum = summarizeLabSales(rows);
    expect(sum.leader?.lab.id).toBe("lab_a");
    expect(sum.totalLabs).toBe(3);
    expect(sum.totalMoney).toBe(2500);
    expect(sum.totalUnits).toBe(3);
    expect(sum.top3.length).toBe(2); // sólo 2 con ventas
  });
});
