"use server";

import { revalidatePath } from "next/cache";
import { getRepositories } from "@/server/repositories";
import { getSession } from "@/server/auth/context";
import { canConfigureDgiiEnvironment } from "@/features/billing/permissions";
import type { DgiiSettingsPatch } from "@/server/repositories/types";

/**
 * Server action para persistir cambios en `dgii_settings`.
 *
 * - En `DATA_SOURCE=mock` actualiza el Map en memoria del proceso server.
 * - En `DATA_SOURCE=supabase` ejecuta UPSERT contra `dgii_settings` con
 *   RLS por tenant (requiere migraciones 0003 + JWT con `business_id`).
 *
 * El permiso `dgii:configure` ya está declarado en el catálogo
 * (`allPermissions`). En Fase C completa, este action debe verificar el
 * permiso antes de escribir (`requirePermission(ctx, "dgii:configure")`)
 * — pendiente cuando `AuthContext` esté completamente cableado.
 *
 * SEC-009: `businessId` SIEMPRE del JWT (sesión), nunca hardcodeado; y requiere
 * rol de administración (configurar DGII es operación de admin).
 */

export async function saveDgiiSettings(
  patch: DgiiSettingsPatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await getSession();
    if (!session) return { ok: false, error: "Sesión no autenticada." };
    if (!canConfigureDgiiEnvironment(session.user.role))
      return { ok: false, error: "No tienes permiso para configurar DGII." };
    const repos = getRepositories();
    await repos.dgii.saveSettings(
      { businessId: session.businessId },
      patch,
    );
    revalidatePath("/dgii/configuracion");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error inesperado",
    };
  }
}
