import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";

/**
 * El servicio que crea cuentas y enseña claves en claro. Lo que se prueba aquí
 * son las cuatro cosas que, si fallan, no se notan hasta que ya pasó algo:
 *
 *  1. Una cuenta creada con OTRO id se deshace. Con las claves foráneas que
 *     apuntan a `users(id)` —incluido el vendedor de cada factura migrada— un
 *     id distinto es un usuario fantasma: entra, pero no es dueño de ninguna de
 *     sus ventas.
 *  2. El rastro se escribe ANTES de abrir el sobre. Al revés existiría el
 *     camino «se enseñó la clave y el registro se perdió».
 *  3. La clave NUNCA aparece en lo que se manda a auditoría.
 *  4. Un admin no puede tocar la clave de otro admin.
 */

const auditarOFallar = vi.fn(async () => {});
const contarAcciones = vi.fn(async () => 0);
const guardarClave = vi.fn(async () => {});
type ResultadoLeer =
  | { ok: true; datos: { clave: string; asignadaEl: string; asignadaPor: string | null } }
  | { ok: false; motivo: "no_gestionada" | "desincronizada" };

const leerClave = vi.fn(
  async (): Promise<ResultadoLeer> => ({
    ok: true,
    datos: { clave: "Clave-Guardada-234", asignadaEl: "2026-09-07T10:00:00Z", asignadaPor: "a1" },
  }),
);

/** Orden real de las llamadas, para poder afirmar QUÉ pasó antes que qué. */
const orden: string[] = [];

/** Forma mínima de una cuenta de Auth, para que el falso admita `null` y objeto. */
type CuentaFalsa = { id: string; email?: string; app_metadata?: Record<string, unknown> } | null;

const authAdmin = {
  getUserById: vi.fn(
    async (_id: string): Promise<{ data: { user: CuentaFalsa }; error: null }> => ({
      data: { user: null },
      error: null,
    }),
  ),
  createUser: vi.fn(
    async (attrs: { id?: string }): Promise<{ data: { user: CuentaFalsa }; error: null }> => ({
      data: { user: { id: String(attrs.id), email: "x@y.z" } },
      error: null,
    }),
  ),
  updateUserById: vi.fn(async () => ({ data: { user: {} }, error: null })),
  deleteUser: vi.fn(async () => {
    orden.push("deleteUser");
    return { data: {}, error: null };
  }),
  listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
};

const tablaFalsa = {
  update: vi.fn(() => tablaFalsa),
  eq: vi.fn(() => tablaFalsa),
  is: vi.fn(async () => ({ error: null })),
};

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({ auth: { admin: authAdmin }, from: () => tablaFalsa }),
}));
vi.mock("./auditoria-estricta", () => ({
  auditarOFallar: (...a: unknown[]) => {
    orden.push("auditar");
    return auditarOFallar(...(a as []));
  },
  contarAcciones: (...a: unknown[]) => contarAcciones(...(a as [])),
}));
vi.mock("./password-vault", () => ({
  guardarClave: (...a: unknown[]) => guardarClave(...(a as [])),
  leerClave: (...a: unknown[]) => {
    orden.push("abrirBoveda");
    return leerClave(...(a as []));
  },
}));

const { fijarClave, revelarClave } = await import("./access-service");

const actor = {
  id: "admin-1",
  role: "admin",
  isPlatformAdmin: false,
  businessId: "b1",
  nombre: "Dario",
};
const ficha = {
  id: "u-vendedora",
  businessId: "b1",
  email: "heidi@dermaland.local",
  fullName: "Heidi Pinales",
  role: "vendedor",
  branchIds: ["suc-1"],
};
const CLAVE = "Kx7m-Rt4p-Wq9s";

beforeEach(() => {
  process.env.USER_PASSWORD_VAULT_KEY = randomBytes(32).toString("base64");
  orden.length = 0;
  vi.clearAllMocks();
  authAdmin.getUserById.mockResolvedValue({ data: { user: null }, error: null });
  authAdmin.createUser.mockImplementation(async (attrs: { id?: string }) => ({
    data: { user: { id: String(attrs.id), email: "x@y.z" } },
    error: null,
  }));
  authAdmin.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
  contarAcciones.mockResolvedValue(0);
  leerClave.mockResolvedValue({
    ok: true,
    datos: { clave: "Clave-Guardada-234", asignadaEl: "2026-09-07T10:00:00Z", asignadaPor: "a1" },
  });
});

describe("fijarClave", () => {
  it("crea la cuenta con el MISMO id de la ficha", async () => {
    const r = await fijarClave(actor, ficha, CLAVE);
    expect(r).toEqual({ ok: true, cuentaCreada: true });
    expect(authAdmin.createUser.mock.calls[0]?.[0]).toMatchObject({
      id: "u-vendedora",
      email: "heidi@dermaland.local",
      email_confirm: true,
      app_metadata: expect.objectContaining({
        business_id: "b1",
        role: "vendedor",
        is_platform_admin: false,
      }),
    });
  });

  it("🔴 si Auth devuelve OTRO id, borra la cuenta y aborta", async () => {
    authAdmin.createUser.mockResolvedValue({
      data: { user: { id: "id-que-no-pedimos", email: "x@y.z" } },
      error: null,
    });
    const r = await fijarClave(actor, ficha, CLAVE);
    expect(r.ok).toBe(false);
    expect(authAdmin.deleteUser).toHaveBeenCalledWith("id-que-no-pedimos");
    // Y no se guarda nada en la bóveda de una cuenta que se deshizo.
    expect(guardarClave).not.toHaveBeenCalled();
  });

  it("si ya tiene cuenta, solo le cambia la clave", async () => {
    authAdmin.getUserById.mockResolvedValue({
      data: { user: { id: "u-vendedora", app_metadata: {} } },
      error: null,
    });
    const r = await fijarClave(actor, ficha, CLAVE);
    expect(r).toEqual({ ok: true, cuentaCreada: false });
    expect(authAdmin.createUser).not.toHaveBeenCalled();
    expect(authAdmin.updateUserById).toHaveBeenCalledWith("u-vendedora", { password: CLAVE });
  });

  it("🔴 la clave NUNCA viaja a auditoría", async () => {
    await fijarClave(actor, ficha, CLAVE);
    const escrito = JSON.stringify(auditarOFallar.mock.calls);
    expect(escrito).not.toContain(CLAVE);
    expect(escrito).toContain("users.access_created");
  });

  it("🔴 un admin NO le fija la clave a otro admin", async () => {
    const r = await fijarClave(actor, { ...ficha, role: "admin" }, CLAVE);
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(authAdmin.createUser).not.toHaveBeenCalled();
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it("🔴 una ficha de otro negocio es 404, no se toca", async () => {
    const r = await fijarClave(actor, { ...ficha, businessId: "OTRO" }, CLAVE);
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(authAdmin.getUserById).not.toHaveBeenCalled();
  });

  it("🔴 una clave que no cumple la política se rechaza sin tocar Auth", async () => {
    const r = await fijarClave(actor, ficha, "corta");
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(authAdmin.createUser).not.toHaveBeenCalled();
  });

  it("🔴 sin la llave del servidor NO guarda nada", async () => {
    delete process.env.USER_PASSWORD_VAULT_KEY;
    const r = await fijarClave(actor, ficha, CLAVE);
    expect(r).toMatchObject({ ok: false, status: 500 });
    expect(authAdmin.createUser).not.toHaveBeenCalled();
    expect(guardarClave).not.toHaveBeenCalled();
  });

  it("revoca las computadoras de confianza del usuario", async () => {
    await fijarClave(actor, ficha, CLAVE);
    expect(tablaFalsa.update).toHaveBeenCalledWith(
      expect.objectContaining({ revoke_reason: "password_reset" }),
    );
  });
});

describe("revelarClave", () => {
  it("devuelve la clave guardada", async () => {
    const r = await revelarClave(actor, ficha);
    expect(r).toMatchObject({ ok: true, datos: { clave: "Clave-Guardada-234" } });
  });

  it("🔴 el rastro se escribe ANTES de abrir la bóveda", async () => {
    await revelarClave(actor, ficha);
    expect(orden).toEqual(["auditar", "abrirBoveda"]);
  });

  it("🔴 si no se puede auditar, NO se enseña la clave", async () => {
    auditarOFallar.mockRejectedValueOnce(new Error("sin rastro"));
    await expect(revelarClave(actor, ficha)).rejects.toThrow();
    expect(leerClave).not.toHaveBeenCalled();
  });

  it("🔴 pasado el tope de consultas es 429 y no se abre nada", async () => {
    contarAcciones.mockResolvedValue(10);
    const r = await revelarClave(actor, ficha);
    expect(r).toMatchObject({ ok: false, status: 429 });
    expect(leerClave).not.toHaveBeenCalled();
  });

  it("🔴 un admin NO ve la clave de otro admin, y queda constancia del intento", async () => {
    const r = await revelarClave(actor, { ...ficha, role: "admin" });
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(leerClave).not.toHaveBeenCalled();
    expect(JSON.stringify(auditarOFallar.mock.calls)).toContain("users.password_view_denied");
  });

  it("una clave cambiada por fuera se dice, no se enseña una vieja", async () => {
    leerClave.mockResolvedValue({ ok: false, motivo: "desincronizada" });
    const r = await revelarClave(actor, ficha);
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect((r as { error: string }).error).toMatch(/por fuera del panel/i);
  });

  it("sin clave en la bóveda lo dice claro", async () => {
    leerClave.mockResolvedValue({ ok: false, motivo: "no_gestionada" });
    const r = await revelarClave(actor, ficha);
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect((r as { error: string }).error).toMatch(/no tiene clave asignada/i);
  });
});
