import { mockCurrentUser } from "@/lib/mock-data/users";
import type { UserRole } from "@/types";

/** Roles con permiso para gestionar (crear/editar/inactivar/eliminar) sucursales. */
const BRANCH_MANAGER_ROLES: UserRole[] = ["super_admin", "admin", "manager"];

/**
 * ¿El usuario actual puede gestionar sucursales? Sólo admin/manager.
 * En producción esto se evalúa contra el RBAC real + RLS por business_id.
 */
export function canManageBranches(role: UserRole = mockCurrentUser.role): boolean {
  return BRANCH_MANAGER_ROLES.includes(role);
}
