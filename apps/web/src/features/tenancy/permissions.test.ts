import { describe, expect, it } from "vitest";
import {
  canManageBranches,
  canReceiveBelowShelfLife,
  canSwitchBillingBranch,
} from "./permissions";
import type { UserRole } from "@/types";

const ALL_ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "manager",
  "cashier",
  "inventory",
  "supervisor",
  "auditor",
  "vendedor",
];

describe("canSwitchBillingBranch", () => {
  it("permite a super_admin, admin y manager elegir la sucursal a facturar", () => {
    expect(canSwitchBillingBranch("super_admin")).toBe(true);
    expect(canSwitchBillingBranch("admin")).toBe(true);
    expect(canSwitchBillingBranch("manager")).toBe(true);
  });

  it("bloquea al resto de roles (cajero/vendedor/inventario/etc.)", () => {
    const blocked: UserRole[] = [
      "cashier",
      "inventory",
      "supervisor",
      "auditor",
      "vendedor",
    ];
    for (const role of blocked) {
      expect(canSwitchBillingBranch(role)).toBe(false);
    }
  });

  it("cubre todos los roles conocidos (sin ambigüedad)", () => {
    for (const role of ALL_ROLES) {
      expect(typeof canSwitchBillingBranch(role)).toBe("boolean");
    }
  });

  it("usa el mismo conjunto de roles que canManageBranches (gestión = cambio de facturación)", () => {
    for (const role of ALL_ROLES) {
      expect(canSwitchBillingBranch(role)).toBe(canManageBranches(role));
    }
  });
});

describe("canReceiveBelowShelfLife", () => {
  it("solo admin/manager/super_admin pueden forzar recepción bajo mínimo", () => {
    expect(canReceiveBelowShelfLife("super_admin")).toBe(true);
    expect(canReceiveBelowShelfLife("admin")).toBe(true);
    expect(canReceiveBelowShelfLife("manager")).toBe(true);
    expect(canReceiveBelowShelfLife("cashier")).toBe(false);
    expect(canReceiveBelowShelfLife("vendedor")).toBe(false);
    expect(canReceiveBelowShelfLife("inventory")).toBe(false);
  });
});
