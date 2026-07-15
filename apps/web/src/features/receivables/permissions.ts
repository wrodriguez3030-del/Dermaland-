import type { UserRole } from "@/types";

/**
 * Permisos de Cuentas por Cobrar — mismo patrón por rol que
 * `features/billing/permissions.ts` (los gates reales viven en las API routes;
 * la UI solo oculta acciones).
 *
 * Nota de política: los pagos NUNCA se eliminan (historial inmutable en
 * `proforma_payments`) — por eso no existe permiso de borrado de pagos.
 */

const ADMIN_ROLES: UserRole[] = ["super_admin", "admin"];
const MANAGE_ROLES: UserRole[] = ["super_admin", "admin", "manager"];
const COLLECT_ROLES: UserRole[] = ["super_admin", "admin", "manager", "cashier", "supervisor"];
const EXPORT_ROLES: UserRole[] = ["super_admin", "admin", "manager", "supervisor", "auditor"];

/** Ver cuentas por cobrar (dashboard, pendientes, historial, estados). */
export function canViewReceivables(_role: UserRole): boolean {
  return true; // cualquier usuario autenticado del negocio
}

/** Registrar cobros (pagos totales/parciales/múltiples). */
export function canRegisterCollections(role: UserRole): boolean {
  return COLLECT_ROLES.includes(role);
}

/** Editar crédito de un cliente (límite, días, bloqueo). */
export function canEditCredit(role: UserRole): boolean {
  return MANAGE_ROLES.includes(role);
}

/** Registrar/actualizar promesas de pago. */
export function canManagePromises(role: UserRole): boolean {
  return COLLECT_ROLES.includes(role);
}

/** Generar estados de cuenta (PDF) y exportar reportes. */
export function canExportReceivables(role: UserRole): boolean {
  return EXPORT_ROLES.includes(role);
}

/** Administrar la configuración del módulo (límites, bloqueo, recordatorios). */
export function canManageArSettings(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}
