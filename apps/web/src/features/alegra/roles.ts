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
