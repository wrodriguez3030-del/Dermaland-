import { mockCurrentUser } from "@/lib/mock-data/users";
import type { UserRole } from "@/types";

/**
 * Permisos del módulo DGII / Facturación.
 *
 * "ADMIN" en el sentido de la especificación = roles con control total del
 * negocio: `super_admin` y `admin`. Sólo ellos pueden:
 *  - editar la Configuración de facturación,
 *  - editar las Reglas automáticas de e-CF,
 *  - cambiar el porcentaje e-CF de cierre,
 *  - crear / editar / activar / desactivar numeraciones,
 *  - configurar el ambiente, cargar certificado y (con autorización externa)
 *    activar la emisión real.
 *
 * Caja / facturación (`cashier`, `manager`, etc.) puede facturar, cerrar caja,
 * ver vista previa y ver el porcentaje configurado, pero NO editarlo.
 *
 * En producción esto se evalúa contra el RBAC real + RLS por `business_id`.
 */

const ADMIN_ROLES: ReadonlyArray<UserRole> = ["super_admin", "admin"];

/** Roles que pueden generar e-CF de cierre (si tienen permiso de caja). */
const CLOSING_ECF_ROLES: ReadonlyArray<UserRole> = [
  "super_admin",
  "admin",
  "manager",
  "cashier",
  "supervisor",
];

export function isBillingAdmin(role: UserRole = mockCurrentUser.role): boolean {
  return ADMIN_ROLES.includes(role);
}

/** ¿Puede editar la Configuración de facturación? Sólo ADMIN. */
export function canEditBillingSettings(
  role: UserRole = mockCurrentUser.role,
): boolean {
  return isBillingAdmin(role);
}

/** ¿Puede editar las reglas automáticas (incluye el % de cierre)? Sólo ADMIN. */
export function canEditBillingRules(
  role: UserRole = mockCurrentUser.role,
): boolean {
  return isBillingAdmin(role);
}

/** ¿Puede crear/editar/activar/eliminar numeraciones? Sólo ADMIN. */
export function canManageNumberings(
  role: UserRole = mockCurrentUser.role,
): boolean {
  return isBillingAdmin(role);
}

/** ¿Puede cambiar el ambiente e-CF / cargar certificado? Sólo ADMIN. */
export function canConfigureDgiiEnvironment(
  role: UserRole = mockCurrentUser.role,
): boolean {
  return isBillingAdmin(role);
}

/**
 * ¿Puede activar la emisión real DGII? Sólo ADMIN — y, además, requiere
 * autorización externa (certificado, rango autorizado, ambiente produccion).
 * Esta función SÓLO cubre el permiso de rol; el killswitch real vive en
 * `billing_settings.realEmissionEnabled` + env `DGII_TESTECF_SEND_ENABLED`.
 */
export function canActivateRealEmission(
  role: UserRole = mockCurrentUser.role,
): boolean {
  return isBillingAdmin(role);
}

/** ¿Puede ejecutar el e-CF del cierre de caja? (no incluye editar el %). */
export function canGenerateClosingEcf(
  role: UserRole = mockCurrentUser.role,
): boolean {
  return CLOSING_ECF_ROLES.includes(role);
}

/** Roles que pueden EDITAR ventas/facturas (datos no fiscales). */
const SALES_EDIT_ROLES: ReadonlyArray<UserRole> = [
  "super_admin",
  "admin",
  "manager",
];

/** ¿Puede editar facturas/ventas? ADMIN y manager; cajero no. */
export function canEditSales(role: UserRole = mockCurrentUser.role): boolean {
  return SALES_EDIT_ROLES.includes(role);
}

// ─── Incentivos / comisiones ─────────────────────────────────────────────────

const INCENTIVE_MANAGE_ROLES: ReadonlyArray<UserRole> = [
  "super_admin",
  "admin",
  "manager",
];
const INCENTIVE_PAY_ROLES: ReadonlyArray<UserRole> = ["super_admin", "admin"];

/** Ver incentivos (lectura amplia; ajuste futuro por permiso granular). */
export function canViewIncentives(_role: UserRole = mockCurrentUser.role): boolean {
  return true;
}

/** Crear/editar reglas de incentivo: admin/manager. */
export function canManageIncentiveRules(
  role: UserRole = mockCurrentUser.role,
): boolean {
  return INCENTIVE_MANAGE_ROLES.includes(role);
}

/** Aprobar/pagar incentivos: solo admin/super_admin. */
export function canPayIncentives(role: UserRole = mockCurrentUser.role): boolean {
  return INCENTIVE_PAY_ROLES.includes(role);
}
