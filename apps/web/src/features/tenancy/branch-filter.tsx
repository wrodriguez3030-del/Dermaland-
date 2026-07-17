"use client";

import * as React from "react";
import { Select } from "@/components/ui";
import { useActiveBranches } from "./branch-store";

/** Valor del filtro que representa "todas las sucursales". */
export const ALL_BRANCHES = "all";

/**
 * Filtro de sucursal POR PÁGINA (reemplaza al selector global del encabezado).
 * Incluye "Todas las sucursales" + cada sucursal activa. Estado controlado por
 * la página (normalmente `useState(ALL_BRANCHES)`).
 */
export function BranchFilter({
  value,
  onChange,
  className,
  "aria-label": ariaLabel = "Filtrar por sucursal",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const activeBranches = useActiveBranches();
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      aria-label={ariaLabel}
    >
      <option value={ALL_BRANCHES}>Todas las sucursales</option>
      {activeBranches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </Select>
  );
}

/** ¿Un branchId pasa el filtro? `"all"` siempre pasa. Función pura. */
export function branchMatches(branchId: string, filter: string): boolean {
  return filter === ALL_BRANCHES || branchId === filter;
}
