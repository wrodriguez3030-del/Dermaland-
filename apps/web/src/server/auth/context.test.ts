import { describe, it, expect } from "vitest";
import { readAuthClaims } from "./auth-claims";

/**
 * SEC-001 (regresión): los claims de autorización deben leerse SOLO de
 * `app_metadata`. `user_metadata` es escribible por el propio usuario
 * (`auth.updateUser`) y NUNCA debe influir en business_id / role /
 * is_platform_admin — de lo contrario un usuario se auto-escala a Súper Admin
 * o cambia de tenant.
 */
describe("readAuthClaims — SEC-001", () => {
  it("lee de app_metadata", () => {
    const c = readAuthClaims({
      app_metadata: {
        business_id: "biz-A",
        role: "admin",
        is_platform_admin: true,
        branch_id: "br-1",
        branch_ids: ["br-1", "br-2"],
        full_name: "Ana",
      },
    });
    expect(c.businessId).toBe("biz-A");
    expect(c.role).toBe("admin");
    expect(c.isPlatformAdmin).toBe(true);
    expect(c.branchId).toBe("br-1");
    expect(c.branchIds).toEqual(["br-1", "br-2"]);
  });

  it("IGNORA user_metadata aunque intente escalar (el vector de SEC-001)", () => {
    // Un usuario normal (app_metadata sin admin) que se auto-modifica el
    // user_metadata para volverse platform admin / cambiar de empresa.
    const attacker = {
      app_metadata: { business_id: "biz-A", role: "cashier", is_platform_admin: false },
      // user_metadata NO se pasa a readAuthClaims — se ignora por diseño.
      user_metadata: { business_id: "biz-VICTIMA", role: "admin", is_platform_admin: true },
    } as { app_metadata?: Record<string, unknown> };
    const c = readAuthClaims(attacker);
    expect(c.businessId).toBe("biz-A"); // NO biz-VICTIMA
    expect(c.role).toBe("cashier"); // NO admin
    expect(c.isPlatformAdmin).toBe(false); // NO true
  });

  it("defaults seguros: sin claims → cashier, no platform admin, sin business", () => {
    const c = readAuthClaims({ app_metadata: {} });
    expect(c.businessId).toBeNull();
    expect(c.role).toBe("cashier");
    expect(c.isPlatformAdmin).toBe(false);
    expect(c.branchIds).toEqual([]);
  });
});
