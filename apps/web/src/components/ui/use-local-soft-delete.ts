"use client";

import * as React from "react";

/**
 * Hook utilitario para listados que leen mock data inmutable.
 *
 * El mock data en `src/lib/mock-data/*.ts` no se puede mutar en runtime,
 * pero queremos que "Eliminar" desde la UI desaparezca el row visualmente
 * y la siguiente vez que el usuario navegue lo vea sin él (durante esta
 * sesión).
 *
 * Para entidades con persistencia real (Customers via store), usar el método
 * propio del store. Para mock data → este hook.
 *
 * Producción: backend hace el delete real, este hook se reemplaza por
 * `revalidatePath()` o un re-fetch del repo.
 */
export function useLocalSoftDelete<T extends { id: string }>(items: T[]) {
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const visible = React.useMemo(
    () => items.filter((x) => !hidden.has(x.id)),
    [items, hidden],
  );
  const hide = React.useCallback(
    (id: string) => setHidden((prev) => new Set([...prev, id])),
    [],
  );
  return { visible, hide, hidden };
}
