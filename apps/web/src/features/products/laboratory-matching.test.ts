import { describe, it, expect } from "vitest";
import type { Laboratory, Product } from "@/types";
import {
  matchProductLaboratory,
  planBackfill,
  normalize,
} from "./laboratory-matching";

function lab(name: string): Laboratory {
  return { id: `lab_${normalize(name).replace(/[^a-z0-9]+/g, "_")}`, businessId: "b", name, createdAt: "", updatedAt: "" };
}

const LABS: Laboratory[] = [
  lab("ISDIN"),
  lab("La Roche-Posay"),
  lab("Roche"), // farmacéutica — no debe robarse los productos "La Roche-Posay"
  lab("Eucerin"),
  lab("Avène"),
  lab("Bioderma"),
  lab("CeraVe"),
  lab("A-Derma"),
  lab("Sesderma"),
  lab("Uriage"),
  lab("Vichy"),
  lab("Heliocare"),
];

function product(p: Partial<Product>): Product {
  return { id: p.id ?? "p", businessId: "b", sku: p.sku ?? "SKU", name: p.name ?? "", brandId: p.brandId, laboratoryId: p.laboratoryId, unit: "u", cost: 0, price: 0, itbisRate: 18, minStock: 0, maxStock: 0, active: true, sellable: true, createdAt: "", updatedAt: "" } as Product;
}

describe("matchProductLaboratory", () => {
  it("1. asigna ISDIN a productos ISDIN", () => {
    expect(matchProductLaboratory(product({ name: "ISDIN Fotoprotector Fusion Water 50 ml" }), LABS)?.labName).toBe("ISDIN");
  });

  it("2. asigna La Roche-Posay (y NO Roche)", () => {
    expect(matchProductLaboratory(product({ name: "La Roche-Posay Toleriane Sensitive" }), LABS)?.labName).toBe("La Roche-Posay");
    expect(matchProductLaboratory(product({ name: "LRP Effaclar Gel" }), LABS)?.labName).toBe("La Roche-Posay");
  });

  it("3. asigna Eucerin, Sesderma, Uriage, Avène, Bioderma, CeraVe, Vichy, Heliocare", () => {
    const cases: [string, string][] = [
      ["Eucerin Sun Protection 50", "Eucerin"],
      ["Sesderma C-VIT Serum", "Sesderma"],
      ["Uriage Bariéderm Cica", "Uriage"],
      ["Avène Cleanance Comedomed", "Avène"],
      ["Bioderma Sensibio H2O", "Bioderma"],
      ["CeraVe Limpiador Espumoso", "CeraVe"],
      ["Vichy Minéral 89", "Vichy"],
      ["Heliocare 360 Gel Oil-Free", "Heliocare"],
    ];
    for (const [name, expected] of cases) {
      expect(matchProductLaboratory(product({ name }), LABS)?.labName).toBe(expected);
    }
  });

  it("asigna A-Derma con y sin guion", () => {
    expect(matchProductLaboratory(product({ name: "A-Derma Exomega Control" }), LABS)?.labName).toBe("A-Derma");
    expect(matchProductLaboratory(product({ name: "Aderma Foto Protect" }), LABS)?.labName).toBe("A-Derma");
  });

  it("prioriza la marca sobre el nombre", () => {
    const m = matchProductLaboratory(product({ name: "Crema hidratante genérica" }), LABS, "ISDIN");
    expect(m?.labName).toBe("ISDIN");
    expect(m?.reason).toMatch(/marca/);
  });

  it("5. sin match confiable devuelve null (pendiente)", () => {
    expect(matchProductLaboratory(product({ name: "Crema Genérica Nacional XYZ" }), LABS)).toBeNull();
  });
});

describe("planBackfill", () => {
  const products: Product[] = [
    product({ id: "p1", sku: "S1", name: "ISDIN Fotoprotector" }),
    product({ id: "p2", sku: "S2", name: "La Roche-Posay Effaclar" }),
    product({ id: "p3", sku: "S3", name: "Eucerin Sun" }),
    product({ id: "p4", sku: "S4", name: "Vichy ya asignado", laboratoryId: "lab_existente" }), // ya tiene
    product({ id: "p5", sku: "S5", name: "Producto Genérico Nacional" }), // pendiente
  ];

  it("4. no modifica productos que ya tienen laboratory_id", () => {
    const plan = planBackfill(products, LABS);
    expect(plan.alreadyAssigned).toBe(1);
    expect(plan.assignments.find((a) => a.productId === "p4")).toBeUndefined();
  });

  it("1-3. asigna los que tienen match y 5. deja pendientes los demás", () => {
    const plan = planBackfill(products, LABS);
    expect(plan.reviewed).toBe(5);
    expect(plan.assigned).toBe(3); // p1, p2, p3
    expect(plan.pendingCount).toBe(1); // p5
    expect(plan.pending[0]!.sku).toBe("S5");
    const byId = Object.fromEntries(plan.assignments.map((a) => [a.productId, a.labName]));
    expect(byId["p1"]).toBe("ISDIN");
    expect(byId["p2"]).toBe("La Roche-Posay");
    expect(byId["p3"]).toBe("Eucerin");
  });
});
