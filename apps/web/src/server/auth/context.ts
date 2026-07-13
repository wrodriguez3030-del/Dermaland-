import "server-only";
import { cookies } from "next/headers";
import { env, isSupabaseConfigured } from "@/lib/env";
import { createServer } from "@/lib/supabase/server";
import { mockBusiness, mockBranches } from "@/lib/mock-data/tenancy";
import { mockCurrentUser } from "@/lib/mock-data/users";
import { readAuthClaims } from "@/server/auth/auth-claims";
import type { RepoContext } from "@/server/repositories";
import type { User } from "@/types";

export interface AuthSession {
  user: User;
  businessId: string;
  branchId?: string;
  isPlatformAdmin: boolean;
}

/**
 * Obtiene la sesión actual server-side.
 *
 * En modo `mock` retorna un usuario hardcoded para que la UI funcione sin
 * Supabase. En modo `supabase` lee del JWT y verifica claims:
 * `business_id`, `branch_id`, `role`, `is_platform_admin`.
 *
 * Nunca confíes en `business_id` que venga de `request.body` o query params.
 * Siempre debe venir del JWT firmado por Supabase Auth.
 */
export async function getSession(): Promise<AuthSession | null> {
  if (env.DATA_SOURCE === "mock" || !isSupabaseConfigured()) {
    // Modo demo: el usuario actual mock
    return {
      user: mockCurrentUser,
      businessId: mockBusiness.id,
      branchId: mockBranches[0]?.id,
      isPlatformAdmin: false,
    };
  }

  const sb = await createServer();
  if (!sb) return null;

  const {
    data: { user: sbUser },
  } = await sb.auth.getUser();
  if (!sbUser) return null;

  // SEGURIDAD (SEC-001): los claims de autorización se leen de `app_metadata`
  // (solo escribible por service_role), NUNCA de `user_metadata` (el usuario lo
  // puede modificar con `auth.updateUser` → escalada a Súper Admin / cambio de
  // tenant). `readAuthClaims` centraliza y testea esa invariante.
  const claims = readAuthClaims(sbUser);
  if (!claims.businessId) return null;

  const user: User = {
    id: sbUser.id,
    businessId: claims.businessId,
    email: sbUser.email ?? "",
    fullName: claims.fullName ?? sbUser.email ?? "Usuario",
    role: claims.role,
    branchIds: claims.branchIds,
    twoFactorEnabled: false,
    status: "active",
    avatarColor: "#1A7F8E",
    createdAt: sbUser.created_at,
    updatedAt: sbUser.created_at,
  };

  return {
    user,
    businessId: claims.businessId,
    branchId: claims.branchId,
    isPlatformAdmin: claims.isPlatformAdmin,
  };
}

/** Helper para construir `RepoContext` directo desde la sesión. */
export async function getRepoContext(): Promise<RepoContext> {
  const session = await getSession();
  if (!session) {
    throw new Error("No autenticado — getRepoContext() requiere sesión activa");
  }
  return {
    businessId: session.businessId,
    branchId: session.branchId,
    userId: session.user.id,
    userName: session.user.fullName,
  };
}

/**
 * Cookie helper para el branch_id activo (UI-level switch).
 * No reemplaza el del JWT — solo controla qué sucursal mostrar por defecto.
 */
export async function getActiveBranchId(): Promise<string | null> {
  const c = await cookies();
  return c.get("dl-active-branch")?.value ?? null;
}
