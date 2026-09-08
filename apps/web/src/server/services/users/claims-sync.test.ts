import { describe, it, expect, vi, beforeEach } from "vitest";
import { construirAppMetadata, ClaimsSyncError } from "./claims-sync";

/**
 * 🔴 El fallo que esto cierra: cambiar el rol en el panel NO cambiaba el rol
 * que el sistema aplica. La autorización lee `app_metadata` (SEC-001) y el
 * panel solo escribía `users.role`, así que la pantalla decía «Gerente» y la
 * persona seguía entrando como cajera.
 *
 * Lo que se prueba de `construirAppMetadata` es lo que pasa cuando alguien la
 * escribe mal: si en vez de FUSIONAR reemplazara, el usuario perdería
 * `business_id` y `getSession` devolvería null — la persona quedaría fuera del
 * sistema sin que nadie entendiera por qué.
 */
describe("construirAppMetadata", () => {
  const actual = {
    business_id: "b1",
    branch_id: "suc-1",
    branch_ids: ["suc-1"],
    role: "cashier",
    is_platform_admin: false,
    full_name: "Heidi",
  };

  it("🔴 conserva business_id: perderlo deja a la persona fuera del sistema", () => {
    const r = construirAppMetadata(actual, { role: "manager" });
    expect(r.business_id).toBe("b1");
    expect(r.role).toBe("manager");
  });

  it("🔴 conserva is_platform_admin: la aplicación no lo toca nunca", () => {
    const r = construirAppMetadata({ ...actual, is_platform_admin: true }, { role: "admin" });
    expect(r.is_platform_admin).toBe(true);
  });

  it("🔴 rechaza super_admin: ese papel lo da un guion del dueño, no una pantalla", () => {
    expect(() => construirAppMetadata(actual, { role: "super_admin" })).toThrow(ClaimsSyncError);
    expect(() => construirAppMetadata(actual, { role: " Super_Admin " })).toThrow(ClaimsSyncError);
  });

  it("conserva lo que no se toca", () => {
    const r = construirAppMetadata(actual, { fullName: "Heidi Pinales" });
    expect(r.role).toBe("cashier");
    expect(r.branch_ids).toEqual(["suc-1"]);
    expect(r.branch_id).toBe("suc-1");
    expect(r.full_name).toBe("Heidi Pinales");
  });

  it("actualiza sucursales cuando vienen", () => {
    const r = construirAppMetadata(actual, { branchIds: ["suc-1", "suc-2"] });
    expect(r.branch_ids).toEqual(["suc-1", "suc-2"]);
  });

  it("no inventa is_platform_admin si la cuenta no lo traía", () => {
    // Dar por hecho `false` sería escribir un claim que nadie puso.
    const r = construirAppMetadata({ business_id: "b1" }, { role: "cashier" });
    expect("is_platform_admin" in r).toBe(false);
  });
});

/**
 * `sincronizarClaims` con el cliente de Auth falso: lo que importa es que el
 * estado «deshabilitado» llegue a GoTrue como bloqueo. Sin eso, deshabilitar a
 * alguien en la ficha lo dejaba entrando igual.
 */
const updateUserById = vi.fn(
  async (_id: string, _attrs: Record<string, unknown>) => ({
    data: { user: {} },
    error: null as { message: string } | null,
  }),
);
const getUserById = vi.fn(async () => ({
  data: { user: { id: "u1", app_metadata: { business_id: "b1", role: "cashier" } } },
  error: null as { message: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({ auth: { admin: { updateUserById, getUserById } } }),
}));

const { sincronizarClaims } = await import("./claims-sync");

beforeEach(() => {
  vi.clearAllMocks();
  getUserById.mockResolvedValue({
    data: { user: { id: "u1", app_metadata: { business_id: "b1", role: "cashier" } } },
    error: null,
  });
});

describe("sincronizarClaims", () => {
  it("🔴 deshabilitar bloquea la cuenta de verdad", () => {
    return sincronizarClaims("u1", { status: "disabled" }).then(() => {
      expect(updateUserById.mock.calls[0]?.[1]).toMatchObject({ ban_duration: "876000h" });
    });
  });

  it("🔴 reactivar quita el bloqueo", async () => {
    await sincronizarClaims("u1", { status: "active" });
    expect(updateUserById.mock.calls[0]?.[1]).toMatchObject({ ban_duration: "none" });
  });

  it("🔴 el rol nuevo va a app_metadata, conservando el negocio", async () => {
    await sincronizarClaims("u1", { role: "manager" });
    expect(updateUserById.mock.calls[0]?.[1]).toMatchObject({
      app_metadata: { role: "manager", business_id: "b1" },
    });
  });

  it("sin cuenta de acceso lo dice, y no es un error", async () => {
    getUserById.mockResolvedValue({ data: { user: null }, error: null } as never);
    const r = await sincronizarClaims("u1", { role: "manager" });
    expect(r).toEqual({ sincronizado: false, motivo: "El usuario no tiene cuenta de acceso." });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("🔴 si Auth falla, lo REPORTA en vez de decir que todo salió bien", async () => {
    updateUserById.mockResolvedValue({ data: { user: {} }, error: { message: "caído" } } as never);
    const r = await sincronizarClaims("u1", { role: "manager" });
    expect(r.sincronizado).toBe(false);
    expect(r.motivo).toBe("caído");
  });
});
