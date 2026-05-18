"use server";

import { revalidatePath } from "next/cache";
import { getRepositories } from "@/server/repositories";
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
 * `businessId` viene del JWT en producción. En mock se hardcodea al
 * business piloto para iteración local.
 */

const DEMO_BUSINESS_ID = "biz_dermaland";

export async function saveDgiiSettings(
  patch: DgiiSettingsPatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const repos = getRepositories();
    await repos.dgii.saveSettings(
      { businessId: DEMO_BUSINESS_ID },
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
