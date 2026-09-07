import { describe, it, expect } from "vitest";
import { computeLabSales, computeLabProductSales, summarizeLabSales } from "./lab-sales";
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

const richItem = (productId: string, sku: string, name: string, quantity: number, total: number) =>
  ({ productId, productSku: sku, productName: name, quantity, total } as never);

describe("computeLabSales — transacciones, productos y sin laboratorio", () => {
  it("cuenta transacciones distintas y productos distintos por laboratorio", () => {
    const rows = computeLabSales(labs, products, [
      pf({ id: "s1", items: [item("p1", 1, 100), item("p2", 1, 50)] }),
      pf({ id: "s2", items: [item("p1", 2, 200)] }),
    ]);
    const a = rows.find((r) => r.lab.id === "lab_a")!;
    expect(a.transactions).toBe(2); // s1 y s2
    expect(a.productsSold).toBe(1); // solo p1
    expect(rows.find((r) => r.lab.id === "lab_b")!.transactions).toBe(1);
  });

  it("incluye la fila 'Sin laboratorio' solo con includeUnassigned", () => {
    const pfs = [pf({ items: [item("p3", 5, 9999)] })]; // p3 sin laboratorio
    expect(computeLabSales(labs, products, pfs).some((r) => r.isUnassigned)).toBe(false);
    const withU = computeLabSales(labs, products, pfs, { includeUnassigned: true });
    const none = withU.find((r) => r.isUnassigned)!;
    expect(none.lab.name).toBe("Sin laboratorio");
    expect(none.totalMoney).toBe(9999);
    const sum = summarizeLabSales(withU);
    expect(sum.hasUnassigned).toBe(true);
    expect(sum.totalLabs).toBe(3); // no cuenta "Sin laboratorio" como laboratorio
    expect(sum.totalMoney).toBe(9999); // sí suma en el acumulado
  });

  it("desglosa ventas por producto dentro del laboratorio", () => {
    const prod = computeLabProductSales(labs, products, [
      pf({ items: [richItem("p1", "SKU1", "Prod 1", 2, 200), richItem("p1", "SKU1", "Prod 1", 1, 100)] }),
    ]);
    const p1 = prod.find((r) => r.productId === "p1")!;
    expect(p1.labName).toBe("Lab A");
    expect(p1.units).toBe(3);
    expect(p1.total).toBe(300);
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

/**
 * 🔴 El ranking tiene que contar TAMBIÉN el histórico migrado de Alegra.
 *
 * La pantalla «Productos → Laboratorios» salía entera en cero —RD$0.00, 0
 * unidades, «— Sin ventas», 80 barras planas— porque solo miraba `proformas`,
 * y `proformas` tiene CERO filas: el punto de venta propio no ha cobrado nada
 * y los RD$48,4 millones del negocio están en `alegra_invoices`.
 *
 * Los importes de estas pruebas son los REALES medidos en producción el
 * 07/09/2026, para que se note si alguien cambia el criterio de suma.
 */
describe("computeLabSales con el histórico de Alegra", () => {
  const labA = { id: "lab-a", name: "La Roche-Posay" } as Laboratory;
  const labB = { id: "lab-b", name: "Eucerin" } as Laboratory;

  it("🔴 suma las ventas de Alegra aunque no haya ni una proforma", () => {
    const rows = computeLabSales([labA, labB], [], [], {}, [
      { laboratorioId: "lab-a", total: 4_990_824.43, unidades: 2119, facturas: 1827, productos: 40 },
      { laboratorioId: "lab-b", total: 4_293_999.98, unidades: 2885, facturas: 2388, productos: 55 },
    ]);
    expect(rows[0]?.lab.id).toBe("lab-a");
    expect(rows[0]?.totalMoney).toBeCloseTo(4_990_824.43, 2);
    expect(rows[0]?.units).toBe(2119);
    expect(rows[0]?.transactions).toBe(1827);
    expect(rows[0]?.productsSold).toBe(40);
    expect(rows[1]?.lab.id).toBe("lab-b");
    // El ranking se recalcula con las dos mitades juntas, no con la del sistema.
    expect(rows[0]?.rank).toBe(1);
    expect(rows[1]?.percentOfLeader).toBe(86);
  });

  it("🔴 los RD$9,5 millones sin laboratorio NO se pierden: van a «Sin laboratorio»", () => {
    // Es el 20% del histórico. Descartarlos haría que el ranking no cuadrara
    // con el total del negocio, que es el descuadre mudo que hay que evitar.
    const rows = computeLabSales([labA], [], [], { includeUnassigned: true }, [
      { laboratorioId: "lab-a", total: 4_990_824.43, unidades: 2119, facturas: 1827, productos: 40 },
      { laboratorioId: "", total: 9_500_943.07, unidades: 13887, facturas: 6373, productos: 300 },
    ]);
    const sin = rows.find((r) => r.isUnassigned);
    expect(sin, "falta la fila «Sin laboratorio»").toBeDefined();
    expect(sin?.totalMoney).toBeCloseTo(9_500_943.07, 2);
    expect(sin?.units).toBe(13887);
    // Y sigue sin contar como laboratorio del ranking.
    expect(sin?.rank).toBe(0);
  });

  it("🔴 un laboratorio que ya no existe no se cuela ni se pierde", () => {
    // Una fila de Alegra con un `laboratorioId` que no está en el catálogo
    // (borrado, o de otro negocio) cae en «Sin laboratorio», nunca inventa una
    // fila nueva ni desaparece del total.
    const rows = computeLabSales([labA], [], [], { includeUnassigned: true }, [
      { laboratorioId: "lab-fantasma", total: 1000, unidades: 3, facturas: 2, productos: 1 },
    ]);
    expect(rows.filter((r) => !r.isUnassigned)).toHaveLength(1);
    expect(rows.find((r) => r.isUnassigned)?.totalMoney).toBe(1000);
  });

  it("suma las dos mitades cuando hay proformas Y Alegra", () => {
    const producto = { id: "p1", laboratoryId: "lab-a" } as Product;
    const proforma = {
      id: "pf1", status: "paid", branchId: "b1", createdAt: "2026-06-01T12:00:00Z",
      items: [{ productId: "p1", quantity: 2, total: 500 }],
    } as unknown as Proforma;
    const rows = computeLabSales([labA], [producto], [proforma], {}, [
      { laboratorioId: "lab-a", total: 1500, unidades: 5, facturas: 3, productos: 1 },
    ]);
    expect(rows[0]?.totalMoney).toBe(2000);
    expect(rows[0]?.units).toBe(7);
    // Una venta del sistema + tres facturas de Alegra.
    expect(rows[0]?.transactions).toBe(4);
  });

  it("sin datos de Alegra se comporta exactamente como antes", () => {
    const sinParametro = computeLabSales([labA, labB], [], [], {});
    const conVacio = computeLabSales([labA, labB], [], [], {}, []);
    expect(conVacio).toEqual(sinParametro);
  });
});
