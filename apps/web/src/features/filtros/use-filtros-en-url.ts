"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CodecFiltrosUrl } from "./filtros-en-url";

/**
 * Estado de filtros espejado en la URL. El estado de React manda — la URL es
 * una FOTO de él, no al revés — así que un valor por defecto CALCULADO (p.
 * ej. "hoy" en /ventas) puede vivir en `porDefecto` sin ensuciar una URL
 * limpia: solo se escribe cuando `codec.escribir` decide que hay algo que
 * apartarse del silencio.
 *
 * Requiere que el llamador esté dentro de un `<Suspense>` (lo exige
 * `useSearchParams`).
 */
export function useFiltrosEnUrl<T>(
  codec: CodecFiltrosUrl<T>,
  porDefecto: () => T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Solo se lee UNA VEZ, al montar (mismo patrón que ya usaban las tres
  // pantallas de ventas con `?period=`): de ahí en adelante manda el estado
  // de React, y la URL solo lo refleja.
  const [filtros, setFiltros] = React.useState<T>(() => codec.leer(params) ?? porDefecto());

  React.useEffect(() => {
    const qs = codec.escribir(filtros).toString();
    if (qs === params.toString()) return;
    const espera = setTimeout(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 250);
    return () => clearTimeout(espera);
    // Solo cuando CAMBIAN los filtros: `params`/`router`/`pathname` no deben
    // disparar una segunda pasada por el `replace` que ellos mismos causaron.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  return [filtros, setFiltros];
}
