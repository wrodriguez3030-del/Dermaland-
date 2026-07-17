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

/**
 * ¿El usuario puede elegir a qué sucursal facturar en el POS?
 *
 * Sólo admin/manager/super_admin. El cajero/vendedor queda fijo en la sucursal
 * actual (evita facturación cruzada por error). Mismo conjunto de roles que
 * {@link canManageBranches}: quien gestiona sucursales también puede facturar
 * a cualquiera.
 */
export function canSwitchBillingBranch(
  role: UserRole = mockCurrentUser.role,
): boolean {
  return BRANCH_MANAGER_ROLES.includes(role);
}
