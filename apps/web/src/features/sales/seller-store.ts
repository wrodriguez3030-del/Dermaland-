"use client";

import * as React from "react";
import type { User, UserRole } from "@/types";
import { mockUsers } from "@/lib/mock-data/users";

/**
 * Fuente de VENDEDORES para el POS/ventas.
 *  - supabase → GET /api/users (RLS por business).
 *  - mock     → mockUsers (demo).
 *
 * Reglas de elegibilidad (puras, testeadas): usuario activo, con rol que
 * puede vender, y que pertenece a la sucursal (o global sin branches).
 */

export const SELLER_BACKEND: "local" | "supabase" =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase"
    ? "supabase"
    : "local";

/** Roles autorizados a figurar como vendedor. */
export const SELLABLE_ROLES: ReadonlySet<UserRole | string> = new Set([
  "super_admin",
  "admin",
  "manager",
  "cashier",
  "supervisor",
  // roles de venta que puedan existir en la DB real:
  "vendedor",
  "sales",
  "seller",
]);

export interface SellerOption {
  id: string;
  name: string;
  role: string;
  branchIds: string[];
}

/** ¿Es este usuario elegible como vendedor en la sucursal dada? */
export function isEligibleSeller(
  u: Pick<User, "role" | "status" | "branchIds">,
  branchId: string | null,
): boolean {
  if (u.status !== "active") return false;
  if (!SELLABLE_ROLES.has(u.role)) return false;
  if (!branchId) return true;
  // Sin branches asignadas = acceso global.
  if (!u.branchIds || u.branchIds.length === 0) return true;
  return u.branchIds.includes(branchId);
}

/** Filtra + ordena vendedores elegibles para una sucursal. */
export function eligibleSellers(
  users: Pick<User, "id" | "fullName" | "role" | "status" | "branchIds">[],
  branchId: string | null,
): SellerOption[] {
  return users
    .filter((u) => isEligibleSeller(u, branchId))
    .map((u) => ({
      id: u.id,
      name: u.fullName,
      role: u.role,
      branchIds: u.branchIds ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/**
 * Hook: vendedores elegibles para la sucursal. Reactivo al cambio de
 * sucursal. En supabase fetcha una vez y filtra en cliente por branch.
 */
export function useSellers(branchId: string | null): {
  sellers: SellerOption[];
  loading: boolean;
} {
  const [allUsers, setAllUsers] = React.useState<User[]>(() =>
    SELLER_BACKEND === "supabase" ? [] : mockUsers,
  );
  const [loading, setLoading] = React.useState(SELLER_BACKEND === "supabase");

  React.useEffect(() => {
    if (SELLER_BACKEND !== "supabase") return;
    let alive = true;
    fetch("/api/users")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { users?: User[] };
        if (alive) setAllUsers(res.ok ? (data.users ?? []) : mockUsers);
      })
      .catch(() => {
        if (alive) setAllUsers(mockUsers);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const sellers = React.useMemo(
    () => eligibleSellers(allUsers, branchId),
    [allUsers, branchId],
  );
  return { sellers, loading };
}
