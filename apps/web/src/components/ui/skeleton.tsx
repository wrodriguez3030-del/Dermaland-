import * as React from "react";

/**
 * Placeholder de carga (skeleton) — bloque gris pulsante.
 * Uso: <Skeleton className="h-4 w-32" />
 */
export function Skeleton({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-black/[0.08] ${className}`}
    />
  );
}
