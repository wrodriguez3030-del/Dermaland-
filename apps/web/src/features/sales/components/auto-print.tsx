"use client";

import * as React from "react";

/**
 * Dispara `window.print()` al montar cuando `auto` es `true` — así una
 * página de impresión SERVER (que ya trae los datos en el HTML) puede
 * responder a `?auto=1` sin convertirse entera en un componente cliente.
 * No renderiza nada.
 */
export function AutoPrint({ auto }: { auto: boolean }) {
  React.useEffect(() => {
    if (auto) window.print();
  }, [auto]);
  return null;
}
