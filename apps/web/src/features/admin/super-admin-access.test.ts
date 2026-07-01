import { describe, it, expect } from "vitest";
import { canAccessSuperAdmin } from "./super-admin-access";

describe("canAccessSuperAdmin", () => {
  it("1. permite a super_admin", () => {
    expect(canAccessSuperAdmin({ isMock: false, role: "super_admin" })).toBe(true);
  });

  it("permite a un platform admin", () => {
    expect(canAccessSuperAdmin({ isMock: false, isPlatformAdmin: true })).toBe(true);
  });

  it("3. bloquea a un usuario normal (admin de empresa)", () => {
    expect(canAccessSuperAdmin({ isMock: false, isPlatformAdmin: false, role: "admin" })).toBe(false);
    expect(canAccessSuperAdmin({ isMock: false, role: "cashier" })).toBe(false);
    expect(canAccessSuperAdmin({ isMock: false })).toBe(false);
  });

  it("permite en modo demo (mock) para pruebas", () => {
    expect(canAccessSuperAdmin({ isMock: true, role: "cashier" })).toBe(true);
  });
});
