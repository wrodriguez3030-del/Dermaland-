import type { ProductLot } from "@/types";
import { daysUntil } from "@/lib/utils/format";

/**
 * Selectores puros de lotes — FUENTE ÚNICA de los KPIs de inventario del
 * dashboard y de sus pantallas de detalle (`/inventario/vencimientos`,
 * `/inventario/bloqueados`). Que ambos importen de aquí garantiza que el
 * número del KPI SIEMPRE coincida con lo que muestra el detalle (requisito de
 * coherencia: "Dashboard dice 3, detalle muestra 3").
 *
 * Sin dependencias de React ni del DOM → testeable en node.
 */

/**
 * ¿El lote vence dentro de `days` días a partir de hoy (sin estar ya vencido)?
 * Ventana [0, days]: excluye vencidos (días < 0), incluye "vence hoy" (0).
 */
export function isWithinExpiryWindow(
  expiresAt: string,
  days: number,
  ref: Date = new Date(),
): boolean {
  const d = daysUntil(expiresAt);
  void ref; // `daysUntil` usa Date.now(); `ref` se acepta por simetría/tests.
  return d >= 0 && d <= days;
}

/**
 * Lotes "próximos a vencer": vencen en ≤ `days` días, en sucursales ACTIVAS.
 * Mismo criterio que la vista `/inventario/vencimientos?days=<days>` (que opera
 * sobre lotes de sucursales activas). Ordenados por fecha de vencimiento.
 */
export function lotsExpiringWithin(
  lots: ProductLot[],
  activeBranchIds: Set<string>,
  days = 90,
): ProductLot[] {
  return lots
    .filter((l) => activeBranchIds.has(l.branchId))
    .filter((l) => isWithinExpiryWindow(l.expiresAt, days))
    .sort((a, b) => +new Date(a.expiresAt) - +new Date(b.expiresAt));
}

/** Filtro de plazo compartido por la pantalla de Vencimientos. */
export type ExpiryDayFilter = "all" | "expired" | "30" | "60" | "90";

/** ¿El lote cumple el filtro de plazo seleccionado en Vencimientos? */
export function matchesExpiryDayFilter(
  expiresAt: string,
  filter: ExpiryDayFilter,
): boolean {
  if (filter === "all") return true;
  const d = daysUntil(expiresAt);
  if (filter === "expired") return d < 0;
  return isWithinExpiryWindow(expiresAt, Number(filter));
}

/**
 * ¿El lote está BLOQUEADO para venta por control de calidad?
 * = cuarentena o recall. (Los vencidos se gestionan en Vencimientos; no cuentan
 * aquí para que el KPI "Cuarentena + recall" cuadre con su etiqueta.)
 */
export function isBlockedLot(lot: Pick<ProductLot, "status">): boolean {
  return lot.status === "quarantine" || lot.status === "recalled";
}

/** Lotes bloqueados (cuarentena + recall). Opcionalmente acotado a sucursales. */
export function blockedLots(
  lots: ProductLot[],
  activeBranchIds?: Set<string>,
): ProductLot[] {
  return lots.filter(
    (l) =>
      isBlockedLot(l) &&
      (activeBranchIds ? activeBranchIds.has(l.branchId) : true),
  );
}
