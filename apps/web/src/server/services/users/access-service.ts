import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { puedeGestionarClaveDe, type ActorClave } from "@/features/auth/jerarquia-de-claves";
import { esClaveAceptable } from "@/lib/auth/password-generator";
import { bovedaConfigurada } from "@/server/crypto/password-vault-cipher";
import { guardarClave, leerClave } from "./password-vault";
import { auditarOFallar, contarAcciones } from "./auditoria-estricta";

/**
 * Cuentas de acceso: crearlas, fijarles la clave y enseñarla bajo auditoría.
 *
 * CONTEXTO
 * ────────
 * De las ocho personas del sistema, solo dos tienen cuenta en Supabase Auth: el
 * dueño y las cinco vendedoras NO PUEDEN ENTRAR. El panel enseñaba sus fichas
 * como si pudieran. Aquí se crea la cuenta que faltaba, con el MISMO id de la
 * ficha —45 claves foráneas apuntan a `users(id)`, entre ellas el vendedor de
 * cada una de las 14 965 facturas migradas: cambiar ese id sería reescribir la
 * historia del negocio.
 *
 * LA REGLA DEL OJO
 * ────────────────
 * El rastro se escribe ANTES de abrir el sobre, con una auditoría que LANZA si
 * falla. Al revés —abrir y luego registrar— existiría el camino «se enseñó la
 * clave y el registro se perdió», que es justo lo que el dueño aceptó que no
 * pasara al elegir guardar claves legibles.
 */

export type ResultadoFallo = { ok: false; status: 400 | 403 | 404 | 409 | 429 | 500; error: string };

export interface FichaUsuario {
  id: string;
  businessId: string;
  email: string;
  fullName: string;
  role: string;
  branchIds: string[];
  branchId?: string | null;
}

/** Consultas del ojo permitidas por administrador y ventana. */
const TOPE_CONSULTAS = 10;
const VENTANA_MS = 10 * 60 * 1000;

const ACCION_VER = "users.password_viewed";
const ACCION_DENEGADA = "users.password_view_denied";
const ACCION_FIJAR = "users.password_set";
const ACCION_ALTA = "users.access_created";

function admin() {
  const c = createServiceRoleClient();
  if (!c) throw new Error("Supabase sin service_role.");
  return c;
}

/** Rastro de un intento rechazado. Nunca rompe la respuesta que ya se le da al usuario. */
async function auditarDenegado(
  actor: ActorClave & { businessId: string; nombre: string },
  objetivoId: string,
  motivo: string,
): Promise<void> {
  try {
    await auditarOFallar({
      businessId: actor.businessId,
      actorId: actor.id,
      actorNombre: actor.nombre,
      action: ACCION_DENEGADA,
      entityId: objetivoId,
      metadata: { motivo },
    });
  } catch {
    /* el rechazo ya se devolvió; no dejar sin respuesta por no poder anotarlo */
  }
}

/**
 * Crea la cuenta de acceso de una ficha que no la tenía.
 *
 * 🔴 Si Auth devolviera un id distinto del pedido, la cuenta se BORRA y se
 * aborta: una cuenta con otro id sería un usuario fantasma —entra al sistema,
 * pero no es dueño de ninguna de sus ventas ni de sus comisiones— y detectarlo
 * después es carísimo.
 */
async function crearCuenta(params: {
  ficha: FichaUsuario;
  pw: string;
}): Promise<{ ok: true } | ResultadoFallo> {
  const { ficha, pw } = params;
  const a = admin();

  // ¿El correo ya tiene cuenta, con OTRO id? Crearla daría un error feo de
  // duplicado; decirlo claro permite arreglarlo.
  const { data: lista } = await a.auth.admin.listUsers({ page: 1, perPage: 200 });
  const mismoCorreo = (lista?.users ?? []).find(
    (u) => u.email?.trim().toLowerCase() === ficha.email.trim().toLowerCase(),
  );
  if (mismoCorreo && mismoCorreo.id !== ficha.id) {
    return {
      ok: false,
      status: 409,
      error: "Ese correo ya tiene una cuenta de acceso con otra identidad. Revísalo antes de continuar.",
    };
  }

  const { data, error } = await a.auth.admin.createUser({
    id: ficha.id,
    email: ficha.email,
    password: pw,
    email_confirm: true,
    app_metadata: {
      business_id: ficha.businessId,
      branch_id: ficha.branchId ?? ficha.branchIds[0] ?? null,
      branch_ids: ficha.branchIds,
      role: ficha.role,
      is_platform_admin: false,
      full_name: ficha.fullName,
    },
    user_metadata: { full_name: ficha.fullName },
  } as Parameters<typeof a.auth.admin.createUser>[0]);

  if (error || !data?.user) {
    return { ok: false, status: 500, error: error?.message ?? "No se pudo crear la cuenta de acceso." };
  }
  if (data.user.id !== ficha.id) {
    await a.auth.admin.deleteUser(data.user.id).catch(() => {});
    return {
      ok: false,
      status: 500,
      error: "La cuenta se creó con otra identidad y se deshizo. No se cambió nada.",
    };
  }
  return { ok: true };
}

/**
 * Fija la clave de un usuario: crea la cuenta si no existía y guarda el sobre.
 */
export async function fijarClave(
  actor: ActorClave & { businessId: string; nombre: string },
  ficha: FichaUsuario,
  pw: string,
): Promise<{ ok: true; cuentaCreada: boolean } | ResultadoFallo> {
  if (!bovedaConfigurada()) {
    return {
      ok: false,
      status: 500,
      error: "La bóveda de claves no está configurada en el servidor (falta USER_PASSWORD_VAULT_KEY).",
    };
  }
  if (!esClaveAceptable(pw)) {
    return { ok: false, status: 400, error: "La clave no cumple la política (mínimo 12 caracteres, sin espacios al borde)." };
  }
  if (ficha.businessId !== actor.businessId) {
    return { ok: false, status: 404, error: "Usuario no encontrado." };
  }
  if (!puedeGestionarClaveDe(actor, { id: ficha.id, role: ficha.role })) {
    await auditarDenegado(actor, ficha.id, "jerarquia");
    return { ok: false, status: 403, error: "No puedes fijar la clave de este usuario." };
  }

  const a = admin();
  const { data: existente } = await a.auth.admin.getUserById(ficha.id);
  let cuentaCreada = false;

  if (!existente?.user) {
    const alta = await crearCuenta({ ficha, pw });
    if (!alta.ok) return alta;
    cuentaCreada = true;
  } else {
    const { error } = await a.auth.admin.updateUserById(ficha.id, { password: pw });
    if (error) {
      return { ok: false, status: 500, error: `No se pudo cambiar la clave: ${error.message}` };
    }
  }

  await guardarClave({ userId: ficha.id, businessId: ficha.businessId, pw, setBy: actor.id });

  // Las computadoras de confianza de ese usuario dejan de valer: si se le
  // reinicia la clave es porque algo pasó, y una galleta vieja saltándose el
  // segundo factor es justo lo que no debe sobrevivir a ese momento.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (a as any)
    .from("trusted_devices")
    .update({ revoked_at: new Date().toISOString(), revoked_by: actor.id, revoke_reason: "password_reset" })
    .eq("user_id", ficha.id)
    .is("revoked_at", null);

  // 🔴 `metadata` NUNCA lleva la clave.
  await auditarOFallar({
    businessId: actor.businessId,
    actorId: actor.id,
    actorNombre: actor.nombre,
    action: cuentaCreada ? ACCION_ALTA : ACCION_FIJAR,
    entityId: ficha.id,
    metadata: { objetivo: ficha.email, modo: cuentaCreada ? "alta" : "reinicio" },
  });

  return { ok: true, cuentaCreada };
}

/**
 * Enseña la clave guardada. Registra ANTES de abrir; si no se puede registrar,
 * no se enseña.
 */
export async function revelarClave(
  actor: ActorClave & { businessId: string; nombre: string },
  ficha: FichaUsuario,
): Promise<{ ok: true; datos: { clave: string; asignadaEl: string; asignadaPor: string | null } } | ResultadoFallo> {
  if (ficha.businessId !== actor.businessId) {
    return { ok: false, status: 404, error: "Usuario no encontrado." };
  }
  if (!puedeGestionarClaveDe(actor, { id: ficha.id, role: ficha.role })) {
    await auditarDenegado(actor, ficha.id, "jerarquia");
    return { ok: false, status: 403, error: "No puedes ver la clave de este usuario." };
  }

  const consultas = await contarAcciones(actor.businessId, actor.id, ACCION_VER, VENTANA_MS);
  if (consultas >= TOPE_CONSULTAS) {
    await auditarDenegado(actor, ficha.id, "limite");
    return {
      ok: false,
      status: 429,
      error: "Demasiadas consultas de claves seguidas. Espera unos minutos.",
    };
  }

  // 🔴 El rastro va PRIMERO y lanza si falla: sin registro, no hay clave.
  await auditarOFallar({
    businessId: actor.businessId,
    actorId: actor.id,
    actorNombre: actor.nombre,
    action: ACCION_VER,
    entityId: ficha.id,
    metadata: { objetivo: ficha.email },
  });

  const leida = await leerClave({
    userId: ficha.id,
    businessId: ficha.businessId,
    leidaPor: actor.id,
  });
  if (!leida.ok) {
    return {
      ok: false,
      status: 409,
      error:
        leida.motivo === "desincronizada"
          ? "La clave de este usuario se cambió por fuera del panel: lo guardado ya no abre su cuenta. Asígnale una nueva."
          : "Este usuario no tiene clave asignada desde el panel. Asígnale una.",
    };
  }
  return { ok: true, datos: leida.datos };
}
