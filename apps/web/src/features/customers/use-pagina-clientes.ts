"use client";

import * as React from "react";
import type { CustomerMetricsRow } from "./customer-metrics";

/**
 * Una página de clientes, pedida al servidor con los filtros y el orden ya
 * aplicados.
 *
 * 🔴 Sustituye a traerse los 6 523 clientes para filtrar y ordenar en el
 * navegador. Ordenar por «total gastado» o «última visita» obligaba a
 * conocerlos TODOS antes de cortar la página; ahora eso lo hace un `order by`.
 */
export interface FiltrosClientes {
  q: string;
  fuente: string;
  piel: string;
  creadosEsteMes: boolean;
  orden: "createdAt" | "name" | "totalOrders" | "totalSpent" | "lastVisit";
  dir: "asc" | "desc";
  pagina: number;
  limite: number;
}

export function usePaginaClientes(f: FiltrosClientes): {
  filas: CustomerMetricsRow[];
  total: number;
  cargando: boolean;
  error: string | null;
} {
  const [filas, setFilas] = React.useState<CustomerMetricsRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [cargando, setCargando] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const qs = React.useMemo(() => {
    const p = new URLSearchParams();
    if (f.q) p.set("q", f.q);
    if (f.fuente) p.set("fuente", f.fuente);
    if (f.piel) p.set("piel", f.piel);
    if (f.creadosEsteMes) p.set("creadosEsteMes", "1");
    p.set("orden", f.orden);
    p.set("dir", f.dir);
    p.set("pagina", String(f.pagina));
    p.set("limite", String(f.limite));
    return p.toString();
  }, [f.q, f.fuente, f.piel, f.creadosEsteMes, f.orden, f.dir, f.pagina, f.limite]);

  React.useEffect(() => {
    const control = new AbortController();
    let vigente = true;
    setCargando(true);
    setError(null);

    // Se espera un momento antes de preguntar: sin esto, teclear ocho letras
    // dispara ocho consultas y la última en llegar puede no ser la de lo que
    // hay escrito.
    const espera = setTimeout(() => {
      fetch(`/api/customers/pagina?${qs}`, { signal: control.signal })
        .then(async (res) => {
          const cuerpo = (await res.json().catch(() => ({}))) as {
            total?: number;
            filas?: CustomerMetricsRow[];
            error?: string;
          };
          if (!res.ok) throw new Error(cuerpo.error ?? "No se pudieron cargar los clientes.");
          if (!vigente) return;
          setFilas(cuerpo.filas ?? []);
          setTotal(Number(cuerpo.total) || 0);
        })
        .catch((e: unknown) => {
          if (!vigente || (e instanceof DOMException && e.name === "AbortError")) return;
          // 🔴 Lista vacía CON aviso, nunca una lista vacía a secas: «no hay
          // clientes» y «no se pudieron cargar» se ven igual, y con la segunda
          // alguien crea un cliente que ya existe.
          setFilas([]);
          setTotal(0);
          setError(e instanceof Error ? e.message : "No se pudieron cargar los clientes.");
        })
        .finally(() => {
          if (vigente) setCargando(false);
        });
    }, 250);

    return () => {
      vigente = false;
      clearTimeout(espera);
      control.abort();
    };
  }, [qs]);

  return { filas, total, cargando, error };
}
