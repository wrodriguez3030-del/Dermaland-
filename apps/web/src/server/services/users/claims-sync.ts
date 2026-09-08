import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Mantiene `app_metadata` de Supabase Auth al día con la ficha del usuario.
 *
 * 🔴 EL FALLO QUE CIERRA
 * ──────────────────────
 * `PATCH /api/users/[id]` cambiaba `users.role` y NADA MÁS. Pero la
 * autorización del sistema lee el rol de `app_metadata` (SEC-001), no de la
 * ficha: el panel enseñaba «Gerente» y la persona seguía entrando como
 * cajera —o al revés—. El rol que se veía no era el que se aplicaba.
 *
 * Y lo mismo con el estado: deshabilitar a alguien en la ficha no le impedía
 * entrar, porque su cuenta de Auth seguía viva. Por eso `status` viaja como
 * `ban_duration`.
 *
 * POR QUÉ CON PARÁMETROS EXPLÍCITOS Y NO LEYENDO LA FICHA
 * ──────────────────────────────────────────────────────
 * La tentación es «lee la fila de `public.users` y copia lo que diga». No:
 * hasta la migración 20260909100000, CUALQUIER usuario del negocio podía
 * escribir CUALQUIER fila de esa tabla por PostgREST (política `users_upd` de
 * 0008). Derivar los claims de la fila convertiría ese fallo en una escalada a
 * administrador: bastaba con ponerse `role: admin` en la propia fila y esperar
 * a que un admin guardara cualquier cambio para que el claim se propagara.
 * Aquí solo entra lo que la ruta ya validó, campo por campo.
 */

export class ClaimsSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimsSyncError";
  }
}

export interface CambiosClaims {
  role?: string;
  branchIds?: string[];
  fullName?: string;
}

/**
 * Fusiona los cambios sobre el `app_metadata` actual.
 *
 * Conserva SIEMPRE `business_id` e `is_platform_admin`: perder el primero deja
 * al usuario sin negocio (y `getSession` devuelve null: fuera del sistema);
 * reescribir el segundo desde la aplicación es exactamente lo que DL-08
 * prohíbe. `super_admin` se rechaza: ese papel lo da un guion del dueño, nunca
 * una pantalla.
 */
export function construirAppMetadata(
  actual: Record<string, unknown> | null | undefined,
  cambios: CambiosClaims,
): Record<string, unknown> {
  const base = { ...(actual ?? {}) };
  if (cambios.role !== undefined) {
    const rol = cambios.role.trim().toLowerCase();
    if (rol === "super_admin") {
      throw new ClaimsSyncError(
        "El rol super administrador no se asigna desde la aplicación.",
      );
    }
    base.role = cambios.role;
  }
  if (cambios.branchIds !== undefined) base.branch_ids = cambios.branchIds;
  if (cambios.fullName !== undefined) base.full_name = cambios.fullName;
  // Se reafirman aunque no vengan en `cambios`: si `actual` llegara sin ellos
  // (una cuenta creada a mano, una restauración), esto no los inventa — los
  // deja como estaban, incluido `undefined`, sin dar por hecho `false`.
  if (actual && "business_id" in actual) base.business_id = actual.business_id;
  if (actual && "is_platform_admin" in actual) base.is_platform_admin = actual.is_platform_admin;
  return base;
}

/**
 * Aplica los claims a la cuenta de Auth. Si el usuario NO tiene cuenta, no hay
 * nada que sincronizar y se dice: quien llama tiene que poder distinguir «se
 * guardó la ficha y el acceso» de «se guardó solo la ficha».
 */
export async function sincronizarClaims(
  userId: string,
  cambios: CambiosClaims & { status?: "active" | "disabled" },
): Promise<{ sincronizado: boolean; motivo?: string }> {
  const admin = createServiceRoleClient();
  if (!admin) return { sincronizado: false, motivo: "Supabase sin service_role." };

  const { data: encontrado, error: errBusca } = await admin.auth.admin.getUserById(userId);
  if (errBusca || !encontrado?.user) {
    return { sincronizado: false, motivo: "El usuario no tiene cuenta de acceso." };
  }

  const appMetadata = construirAppMetadata(encontrado.user.app_metadata, cambios);
  const atributos: Record<string, unknown> = { app_metadata: appMetadata };
  if (cambios.status !== undefined) {
    // 🔴 100 años ≈ para siempre. GoTrue no tiene «deshabilitado», tiene
    // «bloqueado hasta». Sin esto, deshabilitar a alguien en la ficha lo dejaba
    // entrando igual.
    atributos.ban_duration = cambios.status === "disabled" ? "876000h" : "none";
  }

  const { error } = await admin.auth.admin.updateUserById(
    userId,
    atributos as Parameters<typeof admin.auth.admin.updateUserById>[1],
  );
  if (error) return { sincronizado: false, motivo: error.message };
  return { sincronizado: true };
}
