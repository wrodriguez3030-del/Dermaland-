import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Borrar a una persona del personal, cuando de verdad se puede.
 *
 * 🔴 POR QUÉ NO ES UN `delete` Y YA
 * ─────────────────────────────────
 * Las claves foráneas que apuntan a `public.users` no son todas iguales, y las
 * peligrosas son las que NO dan error:
 *
 *   · `alegra_invoices.seller_id`  → ON DELETE **SET NULL**. Borrar a Desteny
 *     dejaría 5 551 facturas sin vendedor, en silencio. Las comisiones y el
 *     desglose por vendedor cambiarían de golpe y nadie sabría por qué.
 *   · `audit_logs.user_id`         → ON DELETE **SET NULL**. Borrar a alguien
 *     ANONIMIZA todo su rastro de auditoría. Lo contrario de auditar.
 *   · `branches.default_seller_id`, `dgii_certificates.uploaded_by`,
 *     `security_settings.updated_by` → lo mismo.
 *
 * Por eso el borrado es solo para quien no dejó rastro: un alta equivocada, una
 * prueba, una ficha duplicada. A quien tiene historial se le DESACTIVA, que es
 * lo que de verdad se quiere («que no entre y no aparezca en el POS») sin
 * romper lo que ya pasó.
 *
 * La cuenta que quedaría suelta
 * ─────────────────────────────
 * 🔴 La cuenta de Auth se borra ANTES que la ficha, y si eso falla no se borra
 * nada. Al revés —ficha primero— dejaría una cuenta viva sin ficha: el
 * middleware mira `app_metadata` (que seguiría diciendo que es del negocio) y
 * la dejaría entrar. Fallar cerrado significa, aquí, que la persona pierda el
 * acceso aunque su ficha siga; nunca al contrario.
 */

export type ResultadoBorrado =
  | { ok: true; borrado: { id: string; nombre: string; email: string; teniaCuenta: boolean } }
  | { ok: false; estado: number; error: string };

interface FichaAEliminar {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
}

/** Una referencia que quedaría colgando, tal como la cuenta la función SQL. */
interface Referencia {
  tabla: string;
  columna: string;
  filas: number;
}

/** Nombres legibles para el mensaje. Lo que no esté aquí se dice por su tabla. */
const EN_CASTELLANO: Record<string, string> = {
  alegra_invoices: "facturas migradas de Alegra",
  audit_logs: "registros de auditoría",
  proformas: "ventas",
  proforma_payments: "cobros",
  cash_register_sessions: "sesiones de caja",
  cash_closings: "cierres de caja",
  cash_movements: "movimientos de caja",
  inventory_movements: "movimientos de inventario",
  inventory_counts: "conteos de inventario",
  inventory_transfers: "transferencias",
  sales_incentives: "incentivos",
  sales_incentive_rules: "reglas de incentivos",
  sales_commission_rules: "reglas de comisión",
  commission_payment_batches: "pagos de comisión",
  expenses: "gastos",
  supplier_invoices: "facturas de suplidor",
  branches: "sucursales (vendedor por defecto)",
};

/** «7 595 registros (5 551 facturas migradas de Alegra, 2 044 …)». */
function explicar(refs: Referencia[]): string {
  const total = refs.reduce((s, r) => s + r.filas, 0);
  const porTabla = new Map<string, number>();
  for (const r of refs) {
    porTabla.set(r.tabla, (porTabla.get(r.tabla) ?? 0) + r.filas);
  }
  const detalle = [...porTabla.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tabla, filas]) => `${filas.toLocaleString("es-DO")} ${EN_CASTELLANO[tabla] ?? tabla}`)
    .join(", ");
  return `${total.toLocaleString("es-DO")} registros (${detalle})`;
}

/**
 * Comprueba y borra. Devuelve el porqué cuando no se puede, con el texto que la
 * pantalla enseña tal cual: «no se pudo» a secas obliga a adivinar.
 *
 * `actorId` y `businessId` salen de la sesión ya verificada; el permiso de rol
 * y la jerarquía los comprueba la ruta ANTES de llamar aquí.
 */
export async function eliminarUsuario(
  id: string,
  businessId: string,
  actorId: string,
): Promise<ResultadoBorrado> {
  // 🔴 Cinturón: la ruta ya lo comprueba, pero un servicio que puede borrar la
  // cuenta de quien llama es demasiado peligroso para fiarse de quien lo llame.
  if (id === actorId) {
    return { ok: false, estado: 409, error: "No puedes eliminar tu propia cuenta." };
  }

  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, estado: 503, error: "Supabase no configurado." };

  // La ficha, ACOTADA AL NEGOCIO. service_role se salta la RLS, así que este
  // `.eq("business_id")` no es defensa en profundidad: es LA barrera.
  const { data: ficha, error: errFicha } = await sb
    .from("users")
    .select("id,email,full_name,role,status")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle<FichaAEliminar>();
  if (errFicha) return { ok: false, estado: 400, error: "No se pudo leer el usuario." };
  if (!ficha) return { ok: false, estado: 404, error: "Ese usuario no existe en este negocio." };

  // 🔴 Nunca por esta vía. El súper administrador lo nombra y lo retira un guion
  // del dueño (DL-08); si una pantalla pudiera borrarlo, bastaría con eso para
  // dejar el sistema sin quien responda por él.
  if (ficha.role === "super_admin") {
    return {
      ok: false,
      estado: 403,
      error: "El súper administrador no se elimina desde la aplicación.",
    };
  }

  // Que no quede el negocio sin nadie que administre.
  if (ficha.role === "admin") {
    const { count, error } = await sb
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .in("role", ["admin", "super_admin"])
      .eq("status", "active");
    if (error) return { ok: false, estado: 400, error: "No se pudo comprobar los administradores." };
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        estado: 409,
        error: "Es el último administrador activo del negocio. No se puede eliminar.",
      };
    }
  }

  // ¿Qué quedaría colgando? (ver el encabezado y la migración
  // `20260908174608_referencias_de_usuario.sql`).
  // El cliente tipado no conoce esta función (los tipos generados son de antes
  // de la migración `20260908174608`). Se acota el `any` a esta llamada en vez
  // de regenerar todo el fichero de tipos por una función.
  const { data: refs, error: errRefs } = await (
    sb as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>;
    }
  ).rpc("referencias_de_usuario", { p_user_id: id });
  if (errRefs) {
    return {
      ok: false,
      estado: 400,
      error: "No se pudo comprobar el historial de la persona. No se eliminó nada.",
    };
  }
  const referencias = (refs as Referencia[] | null) ?? [];
  if (referencias.length > 0) {
    return {
      ok: false,
      estado: 409,
      error:
        `${ficha.full_name} tiene ${explicar(referencias)} a su nombre. ` +
        "Borrarla dejaría esos registros sin dueño, en silencio. Desactívala en su lugar: " +
        "deja de entrar y de aparecer en el punto de venta, y su historial se conserva.",
    };
  }

  // 1. La cuenta de acceso, primero. Si no tiene, no hay nada que borrar.
  const { data: cuenta } = await sb.auth.admin.getUserById(id);
  const teniaCuenta = Boolean(cuenta?.user);
  if (teniaCuenta) {
    const { error } = await sb.auth.admin.deleteUser(id);
    if (error) {
      return {
        ok: false,
        estado: 502,
        error: "No se pudo eliminar la cuenta de acceso. No se borró nada.",
      };
    }
  }

  // 2. La ficha.
  const { error: errBorra } = await sb
    .from("users")
    .delete()
    .eq("business_id", businessId)
    .eq("id", id);
  if (errBorra) {
    return {
      ok: false,
      estado: 409,
      error: teniaCuenta
        ? "Se eliminó la cuenta de acceso pero NO la ficha: la persona ya no entra, pero sigue en la lista. Vuelve a intentarlo."
        : "No se pudo eliminar la ficha.",
    };
  }

  return {
    ok: true,
    borrado: { id, nombre: ficha.full_name, email: ficha.email, teniaCuenta },
  };
}
