import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Ajustes de seguridad del negocio. Hoy solo uno: cuántos días una computadora
 * queda de confianza tras superar el segundo factor.
 *
 * El dueño pidió expresamente que ese número lo ponga el administrador en el
 * panel, no que venga fijo. Por defecto es 0 —la función nace APAGADA— para
 * que aplicar la migración no cambie por sorpresa cómo entra nadie: hasta que
 * alguien ponga un número, todo sigue exactamente igual que hoy.
 */

export const DIAS_MAXIMOS = 90;

/** Días vigentes. 0 = pedir el código siempre. Sin fila, 0. */
export async function getTrustedDeviceDays(businessId: string): Promise<number> {
  const admin = createServiceRoleClient();
  if (!admin) return 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("security_settings")
    .select("trusted_device_days")
    .eq("business_id", businessId)
    .maybeSingle();
  // 🔴 Ante la duda, CERO: fallar hacia «no recordar» pide un código de más;
  // fallar hacia el otro lado se salta el segundo factor.
  if (error || !data) return 0;
  const dias = Number(data.trusted_device_days);
  if (!Number.isFinite(dias) || dias < 0) return 0;
  return Math.min(Math.trunc(dias), DIAS_MAXIMOS);
}

export async function setTrustedDeviceDays(
  businessId: string,
  dias: number,
  updatedBy: string,
): Promise<{ ok: true; dias: number } | { ok: false; error: string }> {
  const n = Math.trunc(Number(dias));
  if (!Number.isFinite(n) || n < 0 || n > DIAS_MAXIMOS) {
    return { ok: false, error: `Los días deben ir de 0 a ${DIAS_MAXIMOS}.` };
  }
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Supabase sin service_role." };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from("security_settings").upsert(
    {
      business_id: businessId,
      trusted_device_days: n,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy || null,
    },
    { onConflict: "business_id" },
  );
  if (error) return { ok: false, error: "No se pudieron guardar los ajustes." };
  return { ok: true, dias: n };
}
