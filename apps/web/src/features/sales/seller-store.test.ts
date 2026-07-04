import { describe, it, expect } from "vitest";
import { isEligibleSeller, eligibleSellers } from "./seller-store";
import type { User } from "@/types";

function user(overrides: Partial<User>): User {
  return {
    id: "u1",
    businessId: "b",
    email: "x@y.do",
    fullName: "Rosa Peralta",
    role: "cashier",
    branchIds: ["br_santiago"],
    twoFactorEnabled: false,
    status: "active",
    avatarColor: "#000",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  } as User;
}

describe("isEligibleSeller", () => {
  it("usuario activo con rol vendible y sucursal coincidente → elegible", () => {
    expect(isEligibleSeller(user({}), "br_santiago")).toBe(true);
  });

  it("usuario INACTIVO no es elegible", () => {
    expect(isEligibleSeller(user({ status: "disabled" }), "br_santiago")).toBe(
      false,
    );
  });

  it("rol no vendible (inventory/auditor) no es elegible", () => {
    expect(isEligibleSeller(user({ role: "inventory" }), "br_santiago")).toBe(
      false,
    );
    expect(isEligibleSeller(user({ role: "auditor" }), "br_santiago")).toBe(
      false,
    );
  });

  it("acepta admin/manager/supervisor/cashier + roles de venta", () => {
    for (const role of [
      "admin",
      "manager",
      "supervisor",
      "cashier",
      "vendedor",
      "sales",
    ] as const) {
      expect(
        isEligibleSeller(user({ role: role as User["role"] }), "br_santiago"),
      ).toBe(true);
    }
  });

  it("no pertenece a la sucursal seleccionada → no elegible", () => {
    expect(
      isEligibleSeller(user({ branchIds: ["br_sd_naco"] }), "br_santiago"),
    ).toBe(false);
  });

  it("sin branches asignadas = acceso global → elegible en cualquier sucursal", () => {
    expect(isEligibleSeller(user({ branchIds: [] }), "br_santiago")).toBe(true);
  });

  it("branchId null (aún cargando) no filtra por sucursal", () => {
    expect(isEligibleSeller(user({ branchIds: ["br_x"] }), null)).toBe(true);
  });
});

describe("eligibleSellers", () => {
  it("filtra inactivos y roles no vendibles, ordena por nombre", () => {
    const users = [
      user({ id: "1", fullName: "Zoe", role: "cashier" }),
      user({ id: "2", fullName: "Ana", role: "manager" }),
      user({ id: "3", fullName: "Beto", role: "inventory" }), // fuera
      user({ id: "4", fullName: "Carla", status: "disabled" }), // fuera
    ];
    const result = eligibleSellers(users, "br_santiago");
    expect(result.map((s) => s.name)).toEqual(["Ana", "Zoe"]);
  });

  it("al cambiar de sucursal cambia el conjunto elegible", () => {
    const users = [
      user({ id: "1", fullName: "Rosa", branchIds: ["br_santiago"] }),
      user({ id: "2", fullName: "Global", branchIds: [] }),
      user({ id: "3", fullName: "Naco", branchIds: ["br_sd_naco"] }),
    ];
    expect(eligibleSellers(users, "br_santiago").map((s) => s.name)).toEqual([
      "Global",
      "Rosa",
    ]);
    expect(eligibleSellers(users, "br_sd_naco").map((s) => s.name)).toEqual([
      "Global",
      "Naco",
    ]);
  });
});

describe("rol vendedor (nuevo)", () => {
  it("un usuario con rol 'vendedor' activo es elegible", () => {
    expect(
      isEligibleSeller(
        { role: "vendedor" as never, status: "active", branchIds: [] },
        "br_santiago",
      ),
    ).toBe(true);
  });
});
