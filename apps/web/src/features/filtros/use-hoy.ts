"use client";

import * as React from "react";

/**
 * `new Date()`, pero solo después de montar. `null` en el servidor y en el
 * primer render del cliente (misma regla del `mounted` de CLAUDE.md para
 * `Date.now`): así el HTML del servidor y el del primer pintado coinciden, y
 * el chip de atajo activo no se resalta mal por una diferencia de huso
 * horario entre el servidor y el navegador del cajero.
 */
export function useHoy(): Date | null {
  const [hoy, setHoy] = React.useState<Date | null>(null);
  React.useEffect(() => setHoy(new Date()), []);
  return hoy;
}
