import type { UserRole } from "@/types";

/** Quién puede VER el historial de Alegra (compras, ventas, saldos). */
export const ALEGRA_READ_ROLES: ReadonlyArray<UserRole> = [
  "super_admin",
  "admin",
  "manager",
  "cashier",
  "supervisor",
  "auditor",
  "vendedor",
];

/**
 * Quién puede DISPARAR una sincronización a mano. Más estrecho que leer: la
 * corrida pisa precios y stock de las dos sucursales.
 */
export const ALEGRA_SYNC_ROLES: ReadonlyArray<UserRole> = ["super_admin", "admin", "manager"];

/**
 * `true` si ese rol puede entrar. Los administradores de plataforma siempre
 * pueden, igual que en `authorizeRole` del lado de la API: las páginas y las
 * rutas tienen que decidir lo mismo, o una enseña lo que la otra niega.
 */
export function permiteAlegra(
  permitidos: ReadonlyArray<UserRole>,
  role: UserRole,
  isPlatformAdmin = false,
): boolean {
  return isPlatformAdmin || permitidos.includes(role);
}
