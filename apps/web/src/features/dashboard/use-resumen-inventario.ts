"use client";

import * as React from "react";

/**
 * Resumen de inventario del panel, calculado en la base.
 *
 * 🔴 Sustituye a `useProducts()` + `useAllLots()` en el panel: esos dos traían
 * 2 675 KB de JSON al navegador para calcular cuatro números y tres listas de
 * cinco filas. Eran los «par de segundos» al cargar.
 *
 * Los criterios (qué vence, qué está bloqueado, qué está bajo mínimo) viven en
 * la función SQL copiados de `lot-selectors.ts`, que es quien los aplica en las
 * pantallas de Vencimientos y Bloqueados: si aquí dijeran otra cosa, el panel y
 * esas pantallas darían números distintos del mismo inventario.
 */
export interface LoteQueVence {
  id: string;
  lotNumber: string;
  currentQuantity: number;
  expiresAt: string;
  productName: string;
}

export interface ProductoBajoMinimo {
  id: string;
  name: string;
  sku: string;
  minStock: number;
  stock: number;
}

export interface ResumenInventario {
  totalProductos: number;
  vencenPronto: { total: number; criticos: number; lista: LoteQueVence[] };
  bloqueados: number;
  bajoMinimo: { total: number; lista: ProductoBajoMinimo[] };
}

const VACIO: ResumenInventario = {
  totalProductos: 0,
  vencenPronto: { total: 0, criticos: 0, lista: [] },
  bloqueados: 0,
  bajoMinimo: { total: 0, lista: [] },
};

export function useResumenInventario(sucursales: string[]): {
  resumen: ResumenInventario | null;
  cargando: boolean;
  error: string | null;
} {
  const [resumen, setResumen] = React.useState<ResumenInventario | null>(null);
  const [cargando, setCargando] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Se estabiliza por CONTENIDO: la página construye el array en cada render y
  // sin esto el efecto se dispararía en bucle.
  const clave = React.useMemo(() => [...sucursales].sort().join(","), [sucursales]);

  React.useEffect(() => {
    const control = new AbortController();
    let vigente = true;
    setCargando(true);
    setError(null);

    const params = new URLSearchParams();
    if (clave) params.set("sucursales", clave);

    fetch(`/api/dashboard/inventario?${params.toString()}`, { signal: control.signal })
      .then(async (res) => {
        const cuerpo = (await res.json().catch(() => ({}))) as {
          resumen?: ResumenInventario | null;
          error?: string;
        };
        if (!res.ok) throw new Error(cuerpo.error ?? "No se pudo cargar el inventario.");
        if (vigente) setResumen(cuerpo.resumen ?? VACIO);
      })
      .catch((e: unknown) => {
        if (!vigente || (e instanceof DOMException && e.name === "AbortError")) return;
        // 🔴 `null`, no ceros: un panel lleno de ceros por un fallo de red dice
        // «no hay nada que vencer, nada bajo mínimo», que es afirmar algo sobre
        // el inventario en vez de admitir que no se pudo mirar.
        setResumen(null);
        setError(e instanceof Error ? e.message : "No se pudo cargar el inventario.");
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
      control.abort();
    };
  }, [clave]);

  return { resumen, cargando, error };
}
