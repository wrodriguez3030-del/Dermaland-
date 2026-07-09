import { describe, it, expect } from "vitest";
import {
  matchProducts,
  matchCustomers,
  matchDocuments,
  matchLots,
  type ProductRecord,
  type CustomerRecord,
  type DocumentRecord,
  type LotRecord,
} from "./search-match";

const products: ProductRecord[] = [
  {
    id: "p1",
    name: "ISDIN Fotoprotector Fusion Water SPF 50",
    sku: "DERM-000201",
    barcode: "8470001834561",
    brandName: "ISDIN",
    categoryName: "Protección solar",
    labName: "ISDIN",
    stock: 998,
  },
  { id: "p2", name: "La Roche-Posay Toleriane", sku: "DERM-000202", stock: 12 },
];

const customers: CustomerRecord[] = [
  {
    id: "c1",
    customerNumber: "CLI-420678",
    firstName: "WILLIAN R",
    lastName: "RODRIGUEZ",
    phone: "829-714-1975",
    documentNumber: "031-0327428-2",
    email: "willian@correo.com",
  },
];

const docs: DocumentRecord[] = [
  { id: "d1", number: "B0200001247", customerName: "WILLIAN R RODRIGUEZ", total: 2268, documentKind: "invoice" },
  { id: "d2", ecfNumber: "E3200000095", number: "", customerName: "Ana", total: 1500, documentKind: "invoice" },
  { id: "d3", number: "PROF-2026-89236", customerName: "Luis", total: 900, documentKind: "proforma" },
];

const lots: LotRecord[] = [
  {
    id: "l1",
    productId: "p1",
    lotNumber: "DSFSDF",
    productName: "ISDIN Fotoprotector Fusion Water SPF 50",
    branchName: "Sucursal Principal",
    currentQuantity: 998,
    expiresAt: "2026-07-10",
    status: "available",
  },
];

describe("matchProducts (§16 3-5)", () => {
  it("3. por nombre 'ISDIN'", () => {
    const r = matchProducts("ISDIN", products);
    expect(r).toHaveLength(1);
    expect(r[0]!.title).toContain("ISDIN");
    expect(r[0]!.subtitle).toBe("SKU DERM-000201");
    expect(r[0]!.meta).toBe("Stock: 998");
    expect(r[0]!.href).toBe("/productos/p1");
  });
  it("4. por SKU 'DERM-000201'", () => {
    expect(matchProducts("DERM-000201", products).map((r) => r.id)).toEqual(["p1"]);
  });
  it("5. por código de barra '8470001834561'", () => {
    expect(matchProducts("8470001834561", products).map((r) => r.id)).toEqual(["p1"]);
  });
  it("por categoría 'Protección solar'", () => {
    expect(matchProducts("Protección", products).map((r) => r.id)).toEqual(["p1"]);
  });
});

describe("matchCustomers (§16 6-9)", () => {
  it("6. por nombre 'WILLIAN'", () => {
    const r = matchCustomers("WILLIAN", customers);
    expect(r).toHaveLength(1);
    expect(r[0]!.title).toBe("WILLIAN R RODRIGUEZ");
    expect(r[0]!.href).toBe("/clientes/c1");
  });
  it("7. por teléfono normalizado '8297141975' (guardado con guiones)", () => {
    expect(matchCustomers("8297141975", customers).map((r) => r.id)).toEqual(["c1"]);
  });
  it("7b. por teléfono formateado '829-714-1975'", () => {
    expect(matchCustomers("829-714-1975", customers).map((r) => r.id)).toEqual(["c1"]);
  });
  it("8. por cédula normalizada '03103274282'", () => {
    expect(matchCustomers("03103274282", customers).map((r) => r.id)).toEqual(["c1"]);
  });
  it("9. por email", () => {
    expect(matchCustomers("willian@correo.com", customers).map((r) => r.id)).toEqual(["c1"]);
  });
});

describe("matchDocuments (§16 10-12)", () => {
  it("10. factura B02 abre /ventas/[id]", () => {
    const r = matchDocuments("B0200001247", docs);
    expect(r).toHaveLength(1);
    expect(r[0]!.kind).toBe("invoice");
    expect(r[0]!.href).toBe("/ventas/d1");
    expect(r[0]!.meta).toBe("RD$2,268.00");
  });
  it("11. e-CF E32 abre /ventas/[id] y muestra el e-NCF", () => {
    const r = matchDocuments("E3200000095", docs);
    expect(r[0]!.title).toBe("E3200000095");
    expect(r[0]!.href).toBe("/ventas/d2");
  });
  it("12. proforma PROF-… abre /proformas/[id]", () => {
    const r = matchDocuments("PROF-2026-89236", docs);
    expect(r[0]!.kind).toBe("proforma");
    expect(r[0]!.href).toBe("/proformas/d3");
  });
});

describe("matchLots (§16 13)", () => {
  it("13. por número de lote muestra producto + sucursal + stock + vencimiento", () => {
    const r = matchLots("DSFSDF", lots);
    expect(r).toHaveLength(1);
    expect(r[0]!.title).toBe("Lote DSFSDF");
    expect(r[0]!.subtitle).toContain("ISDIN");
    expect(r[0]!.meta).toContain("Sucursal Principal");
    expect(r[0]!.meta).toContain("Stock: 998");
    expect(r[0]!.meta).toContain("Vence 10/07/2026");
    expect(r[0]!.href).toBe("/productos/p1"); // detalle del producto, nunca 404
  });
  it("también matchea por producto asociado", () => {
    expect(matchLots("Fotoprotector", lots).map((r) => r.id)).toEqual(["l1"]);
  });
});

describe("21. ningún resultado expone UUID técnico en title/subtitle/meta", () => {
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i;
  it("los campos visibles no contienen UUIDs", () => {
    const all = [
      ...matchProducts("ISDIN", products),
      ...matchCustomers("WILLIAN", customers),
      ...matchDocuments("B02", docs),
      ...matchLots("DSFSDF", lots),
    ];
    for (const it of all) {
      expect(uuid.test(it.title)).toBe(false);
      expect(uuid.test(it.subtitle ?? "")).toBe(false);
      expect(uuid.test(it.meta ?? "")).toBe(false);
    }
  });
});
