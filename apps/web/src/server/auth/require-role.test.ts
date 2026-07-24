// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UserRole } from "@/types";

vi.mock("server-only", () => ({}));

const getSessionMock = vi.fn();
vi.mock("./context", () => ({
  getSession: () => getSessionMock(),
}));

import { authorizeRole } from "./require-role";

/**
 * DL-01 (regresión): `authorizeRole` es la barrera de rol server-side que la RLS
 * (que solo valida business_id) no aporta. Un rol no permitido debe recibir 403
 * aunque esté autenticado; el platform admin siempre pasa.
 */
const sess = (role: UserRole, isPlatformAdmin = false) => ({
  user: { role },
  businessId: "biz-1",
  isPlatformAdmin,
});

describe("authorizeRole — DL-01", () => {
  beforeEach(() => getSessionMock.mockReset());

  it("401 cuando no hay sesión", async () => {
    getSessionMock.mockResolvedValue(null);
    const r = await authorizeRole(["admin"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.res.status).toBe(401);
  });

  it("403 cuando el rol NO está permitido (cajero intenta acción admin)", async () => {
    getSessionMock.mockResolvedValue(sess("cashier"));
    const r = await authorizeRole(["super_admin", "admin"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.res.status).toBe(403);
  });

  it("pasa y devuelve la sesión cuando el rol está permitido", async () => {
    getSessionMock.mockResolvedValue(sess("manager"));
    const r = await authorizeRole(["super_admin", "admin", "manager"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.user.role).toBe("manager");
  });

  it("el platform admin pasa aunque su rol de negocio no esté en la lista", async () => {
    getSessionMock.mockResolvedValue(sess("auditor", true));
    const r = await authorizeRole(["admin"]);
    expect(r.ok).toBe(true);
  });
});
