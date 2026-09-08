import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 🔴 EL FALLO QUE ESTO CIERRA
 * ───────────────────────────
 * Un `delete` a secas sobre `public.users` NO da error: da PÉRDIDA SILENCIOSA.
 * Las claves foráneas medidas contra la base real el 08/09/2026:
 *
 *   · `alegra_invoices.seller_id` → ON DELETE **SET NULL**. Borrar a Desteny
 *     dejaría sus 5 551 facturas sin vendedor. Las comisiones y el desglose
 *     por vendedor cambiarían de golpe y nadie sabría por qué.
 *   · `audit_logs.user_id`        → ON DELETE **SET NULL**. Borrar a alguien
 *     ANONIMIZA su rastro de auditoría entero.
 *
 * Por eso el servicio se NIEGA cuando la persona dejó rastro y dice que se la
 * desactive. Si alguien quita esa comprobación, estas pruebas se ponen rojas.
 *
 * Y el ORDEN importa: la cuenta de acceso primero. Al revés quedaría una cuenta
 * viva sin ficha, y el middleware —que mira `app_metadata`, no la tabla— la
 * dejaría entrar.
 */

const from = vi.fn();
const rpc = vi.fn();
const getUserById = vi.fn();
const deleteUser = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient }));
vi.mock("server-only", () => ({}));

const { eliminarUsuario } = await import("./borrado");

const FICHA = {
  id: "u-caja",
  email: "caja@dermaland.local",
  full_name: "Cajera de prueba",
  role: "cashier",
  status: "active",
};

/**
 * Cliente falso. Cada método encadenable devuelve el mismo objeto y el `await`
 * final resuelve con lo que se le haya puesto para esa tabla y operación.
 */
function clienteFalso(opciones: {
  ficha?: Record<string, unknown> | null;
  errorFicha?: unknown;
  admins?: number;
  referencias?: Array<{ tabla: string; columna: string; filas: number }>;
  errorReferencias?: unknown;
  tieneCuenta?: boolean;
  errorBorrarCuenta?: unknown;
  errorBorrarFicha?: unknown;
}) {
  const orden: string[] = [];

  from.mockImplementation(() => {
    const q: Record<string, unknown> = {};
    let esConteo = false;
    let esBorrado = false;
    for (const m of ["select", "eq", "in", "delete", "update"]) {
      q[m] = vi.fn((...args: unknown[]) => {
        if (m === "select" && (args[1] as { head?: boolean } | undefined)?.head) esConteo = true;
        if (m === "delete") {
          esBorrado = true;
          orden.push("borrar-ficha");
        }
        return q;
      });
    }
    q.maybeSingle = vi.fn(async () => ({
      data: opciones.ficha === undefined ? FICHA : opciones.ficha,
      error: opciones.errorFicha ?? null,
    }));
    // El `await` sobre el builder: conteo de administradores o borrado.
    q.then = (r: (v: unknown) => void) =>
      r(
        esBorrado
          ? { error: opciones.errorBorrarFicha ?? null }
          : esConteo
            ? { count: opciones.admins ?? 3, error: null }
            : { data: [], error: null },
      );
    return q;
  });

  rpc.mockImplementation(async (fn: string) => {
    orden.push(`rpc:${fn}`);
    return { data: opciones.referencias ?? [], error: opciones.errorReferencias ?? null };
  });

  getUserById.mockImplementation(async () => ({
    data: { user: opciones.tieneCuenta === false ? null : { id: "u-caja" } },
    error: null,
  }));
  deleteUser.mockImplementation(async () => {
    orden.push("borrar-cuenta");
    return { error: opciones.errorBorrarCuenta ?? null };
  });

  createServiceRoleClient.mockReturnValue({
    from,
    rpc,
    auth: { admin: { getUserById, deleteUser } },
  });
  return { orden };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("eliminarUsuario", () => {
  it("borra a quien no dejó rastro, y su cuenta con él", async () => {
    const { orden } = clienteFalso({});
    const r = await eliminarUsuario("u-caja", "b1", "u-admin");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.borrado.nombre).toBe("Cajera de prueba");
      expect(r.borrado.teniaCuenta).toBe(true);
    }
    // 🔴 La cuenta ANTES que la ficha: al revés quedaría una cuenta viva sin
    // ficha, y el middleware mira `app_metadata`, no la tabla.
    expect(orden).toEqual(["rpc:referencias_de_usuario", "borrar-cuenta", "borrar-ficha"]);
  });

  it("🔴 se NIEGA si la persona tiene historial, y dice que se la desactive", async () => {
    clienteFalso({
      referencias: [
        { tabla: "alegra_invoices", columna: "seller_id", filas: 5551 },
        { tabla: "audit_logs", columna: "user_id", filas: 2044 },
      ],
    });
    const r = await eliminarUsuario("u-caja", "b1", "u-admin");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.estado).toBe(409);
      // El mensaje NOMBRA el daño y la salida: sin eso, «no se pudo eliminar»
      // deja al dueño adivinando.
      expect(r.error).toContain("7,595 registros");
      expect(r.error).toContain("facturas migradas de Alegra");
      expect(r.error).toContain("Desactívala");
    }
    // Y NO tocó nada.
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("🔴 si no se puede comprobar el historial, NO borra", async () => {
    // Fallar abierto aquí sería borrar sin saber qué se lleva por delante.
    clienteFalso({ errorReferencias: { message: "boom" } });
    const r = await eliminarUsuario("u-caja", "b1", "u-admin");
    expect(r.ok).toBe(false);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("🔴 nadie se borra a sí mismo", async () => {
    clienteFalso({});
    const r = await eliminarUsuario("u-admin", "b1", "u-admin");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.estado).toBe(409);
    expect(from).not.toHaveBeenCalled();
  });

  it("🔴 el súper administrador no se borra desde la aplicación", async () => {
    clienteFalso({ ficha: { ...FICHA, role: "super_admin" } });
    const r = await eliminarUsuario("u-super", "b1", "u-admin");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.estado).toBe(403);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("🔴 no se borra al ÚLTIMO administrador activo", async () => {
    clienteFalso({ ficha: { ...FICHA, role: "admin" }, admins: 1 });
    const r = await eliminarUsuario("u-otro-admin", "b1", "u-admin");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.estado).toBe(409);
      expect(r.error).toContain("último administrador");
    }
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("un administrador SÍ se borra si queda otro", async () => {
    clienteFalso({ ficha: { ...FICHA, role: "admin" }, admins: 2 });
    const r = await eliminarUsuario("u-otro-admin", "b1", "u-admin");
    expect(r.ok).toBe(true);
  });

  it("una ficha de otro negocio no existe para esta llamada", async () => {
    clienteFalso({ ficha: null });
    const r = await eliminarUsuario("u-ajeno", "b1", "u-admin");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.estado).toBe(404);
  });

  it("sin cuenta de acceso se borra igual, y lo dice", async () => {
    const { orden } = clienteFalso({ tieneCuenta: false });
    const r = await eliminarUsuario("u-caja", "b1", "u-admin");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.borrado.teniaCuenta).toBe(false);
    expect(orden).toEqual(["rpc:referencias_de_usuario", "borrar-ficha"]);
  });

  it("🔴 si falla borrar la cuenta, la ficha NO se toca", async () => {
    clienteFalso({ errorBorrarCuenta: { message: "no" } });
    const r = await eliminarUsuario("u-caja", "b1", "u-admin");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.estado).toBe(502);
      expect(r.error).toContain("No se borró nada");
    }
  });

  it("si la cuenta se fue y la ficha no, lo DICE en vez de fingir que salió bien", async () => {
    clienteFalso({ errorBorrarFicha: { message: "fk" } });
    const r = await eliminarUsuario("u-caja", "b1", "u-admin");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ya no entra");
  });
});
