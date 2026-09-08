import type { UserRole } from "@/types";
import {
  BUSINESS_ADMIN_ROLES,
  CATALOG_MANAGE_ROLES,
  INVENTORY_MANAGE_ROLES,
  FINANCE_MANAGE_ROLES,
  FINANCE_ADMIN_ROLES,
  CASH_OPERATE_ROLES,
  WEB_ORDER_MANAGE_ROLES,
  CUSTOMER_MANAGE_ROLES,
  POS_SALE_ROLES,
  canEditSales,
  canManageIncentiveRules,
  canPayIncentives,
  canViewCommissionReport,
} from "@/features/billing/permissions";
import {
  canRegisterCollections,
  canEditCredit,
  canManageArSettings,
} from "@/features/receivables/permissions";
import { canManageBranches } from "@/features/tenancy/permissions";
import { puedeAccionDeRiesgo } from "@/features/auth/riesgo-operativo";
import { requiere2fa } from "@/lib/auth/mfa-gate";

/**
 * Qué puede hacer cada rol, DERIVADO de lo que el servidor aplica de verdad.
 *
 * POR QUÉ ASÍ Y NO LEYENDO LA BASE
 * ────────────────────────────────
 * Existen las tablas `roles`, `permissions` y `role_permissions`, pobladas y
 * todo. Pero NADIE las lee para decidir nada: la autorización real la ponen
 * estas constantes y estas funciones, en el código. Un panel que pintara las
 * tablas enseñaría permisos que el sistema no aplica — que es exactamente lo
 * que hacían `/admin/roles` y `/admin/permisos`, leyendo encima datos de
 * mentira (`mockUsers`).
 *
 * Construyendo la matriz desde las constantes, la pantalla no puede
 * desincronizarse: si mañana alguien añade `manager` a `FINANCE_ADMIN_ROLES`,
 * el panel lo enseña ese mismo día sin tocar nada aquí.
 *
 * MATRIZ DE SOLO LECTURA, A PROPÓSITO
 * ───────────────────────────────────
 * No se puede editar desde la pantalla. Hacerla editable exigiría que el
 * servidor leyera la base para autorizar, y eso es un cambio de arquitectura
 * —con su propia superficie de fallo— que no toca hacer de rebote. Mejor una
 * pantalla honesta que dice «esto es lo que hay» que una que promete un
 * interruptor que no mueve nada.
 */

/** Los roles que un administrador puede asignar. `super_admin` NO está: lo da un guion del dueño. */
export const ROLES_ASIGNABLES: ReadonlyArray<{
  role: UserRole;
  label: string;
  descripcion: string;
  /** Puede borrar, anular y editar lo ya emitido (`puedeAccionDeRiesgo`). */
  riesgo: boolean;
  /** Le es obligatorio el segundo factor. */
  dosFactores: boolean;
}> = (
  [
    ["admin", "Administrador", "Todo el negocio: usuarios, configuración, facturación y cierres."],
    ["manager", "Gerente", "Catálogo, inventario, finanzas del día a día y personal de venta."],
    ["supervisor", "Supervisor", "Supervisa caja e inventario; no toca la configuración del negocio."],
    ["cashier", "Cajero", "Cobra en el punto de venta y opera su caja."],
    ["vendedor", "Vendedor", "Vende y atiende clientes; sin acceso a caja ni configuración."],
    ["inventory", "Inventario", "Recibe, cuenta y mueve mercancía."],
    ["auditor", "Auditor", "Mira y exporta; no cambia nada."],
  ] as const
).map(([role, label, descripcion]) => ({
  role: role as UserRole,
  label,
  descripcion,
  riesgo: puedeAccionDeRiesgo(role as UserRole),
  dosFactores: requiere2fa({ role }),
}));

export interface Capacidad {
  id: string;
  area: string;
  etiqueta: string;
  roles: ReadonlyArray<UserRole>;
}

/** Roles (de los asignables) para los que la función devuelve `true`. */
function rolesQueCumplen(f: (r: UserRole) => boolean): ReadonlyArray<UserRole> {
  return ROLES_ASIGNABLES.map((r) => r.role).filter((r) => {
    try {
      return f(r);
    } catch {
      return false;
    }
  });
}

/** Solo los roles asignables: `super_admin` no se enseña porque no se asigna. */
function soloAsignables(roles: ReadonlyArray<UserRole>): ReadonlyArray<UserRole> {
  const asignables = new Set(ROLES_ASIGNABLES.map((r) => r.role));
  return roles.filter((r) => asignables.has(r));
}

export const CAPACIDADES: ReadonlyArray<Capacidad> = [
  // ── Negocio ────────────────────────────────────────────────────────────
  {
    id: "usuarios",
    area: "Negocio",
    etiqueta: "Gestionar usuarios, claves y roles",
    roles: soloAsignables(BUSINESS_ADMIN_ROLES),
  },
  {
    id: "sucursales",
    area: "Negocio",
    etiqueta: "Crear y editar sucursales",
    roles: rolesQueCumplen(canManageBranches),
  },
  {
    id: "riesgo",
    area: "Negocio",
    etiqueta: "Borrar, anular y editar lo ya emitido",
    roles: rolesQueCumplen(puedeAccionDeRiesgo),
  },
  // ── Ventas ─────────────────────────────────────────────────────────────
  { id: "vender", area: "Ventas", etiqueta: "Vender en el punto de venta", roles: soloAsignables(POS_SALE_ROLES) },
  { id: "editar-ventas", area: "Ventas", etiqueta: "Editar una venta ya hecha", roles: rolesQueCumplen(canEditSales) },
  { id: "caja", area: "Ventas", etiqueta: "Abrir y cerrar caja", roles: soloAsignables(CASH_OPERATE_ROLES) },
  { id: "clientes", area: "Ventas", etiqueta: "Crear y editar clientes", roles: soloAsignables(CUSTOMER_MANAGE_ROLES) },
  { id: "pedidos-web", area: "Ventas", etiqueta: "Atender pedidos de la tienda", roles: soloAsignables(WEB_ORDER_MANAGE_ROLES) },
  // ── Catálogo e inventario ──────────────────────────────────────────────
  { id: "catalogo", area: "Catálogo", etiqueta: "Crear y editar productos", roles: soloAsignables(CATALOG_MANAGE_ROLES) },
  { id: "inventario", area: "Catálogo", etiqueta: "Mover y contar inventario", roles: soloAsignables(INVENTORY_MANAGE_ROLES) },
  // ── Dinero ─────────────────────────────────────────────────────────────
  { id: "finanzas", area: "Dinero", etiqueta: "Gestionar finanzas del día a día", roles: soloAsignables(FINANCE_MANAGE_ROLES) },
  { id: "finanzas-admin", area: "Dinero", etiqueta: "Configurar facturación y cierres", roles: soloAsignables(FINANCE_ADMIN_ROLES) },
  { id: "cobrar", area: "Dinero", etiqueta: "Registrar cobros de cuentas por cobrar", roles: rolesQueCumplen(canRegisterCollections) },
  { id: "credito", area: "Dinero", etiqueta: "Cambiar el crédito de un cliente", roles: rolesQueCumplen(canEditCredit) },
  { id: "politica-credito", area: "Dinero", etiqueta: "Cambiar la política de crédito", roles: rolesQueCumplen(canManageArSettings) },
  // ── Comisiones ─────────────────────────────────────────────────────────
  { id: "reglas-incentivos", area: "Comisiones", etiqueta: "Definir reglas de incentivos", roles: rolesQueCumplen(canManageIncentiveRules) },
  { id: "pagar-incentivos", area: "Comisiones", etiqueta: "Pagar incentivos", roles: rolesQueCumplen(canPayIncentives) },
  { id: "ver-comisiones", area: "Comisiones", etiqueta: "Ver el reporte de comisiones", roles: rolesQueCumplen(canViewCommissionReport) },
];

/** Áreas en el orden en que se pintan. */
export const AREAS: ReadonlyArray<string> = [...new Set(CAPACIDADES.map((c) => c.area))];

export function tieneCapacidad(capacidad: Capacidad, role: UserRole): boolean {
  return capacidad.roles.includes(role);
}
