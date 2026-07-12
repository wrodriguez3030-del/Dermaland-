import type { User } from "@/types";

/**
 * Lee los claims de autorización de un usuario de Supabase Auth.
 *
 * SEC-001: SOLO de `app_metadata` (escribible únicamente por service_role via
 * Admin API), NUNCA de `user_metadata` (escribible por el propio usuario con
 * `supabase.auth.updateUser({ data })`). Leer autorización de user_metadata
 * permitiría a un usuario auto-asignarse rol admin / is_platform_admin (escalada
 * a Súper Admin) o cambiar su `business_id` (salto de tenant).
 *
 * Función PURA y testeable (sin server-only ni next/headers).
 */
export function readAuthClaims(sbUser: {
  app_metadata?: Record<string, unknown> | null;
}): {
  businessId: string | null;
  role: User["role"];
  isPlatformAdmin: boolean;
  branchId?: string;
  branchIds: string[];
  fullName?: string;
} {
  const m = (sbUser.app_metadata ?? {}) as Record<string, unknown>;
  return {
    businessId: (m.business_id as string) ?? null,
    role: (m.role as User["role"]) ?? "cashier",
    isPlatformAdmin: m.is_platform_admin === true,
    branchId: (m.branch_id as string) ?? undefined,
    branchIds: (m.branch_ids as string[]) ?? [],
    fullName: (m.full_name as string) ?? undefined,
  };
}
