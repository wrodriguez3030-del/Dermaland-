"use client";

import * as React from "react";
import type { LabAlegraRow } from "./lab-sales";

/**
 * Ventas del histórico migrado de Alegra por laboratorio, para que el ranking
 * de «Productos → Laboratorios» deje de enseñar RD$0.00 sobre RD$48,4 millones.
 *
 * La suma la hace la base (`ventas_por_laboratorio`); aquí solo se pide con los
 * filtros que el usuario tiene puestos y se traduce la respuesta.
 *
 * 🔴 `cargando` y `error` se distinguen del caso «no hubo ventas»: si la
 * petición falla y esto devolviera una lista vacía sin más, la pantalla diría
 * «Sin ventas» — indistinguible de la verdad — que es justo el fallo mudo que
 * este arreglo viene a cerrar.
 */
export function useVentasLaboratorio(filtros: {
  desde?: string;
  hasta?: string;
  sucursalId?: string;
}): { filas: LabAlegraRow[]; cargando: boolean; error: string | null } {
  const [filas, setFilas] = React.useState<LabAlegraRow[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const { desde, hasta, sucursalId } = filtros;

  React.useEffect(() => {
    const control = new AbortController();
    // `vigente` protege del caso en que la petición termina DESPUÉS de que el
    // usuario cambió el filtro: pintar la respuesta vieja sobre el filtro nuevo
    // enseña un número que no corresponde a lo que se está mirando.
    let vigente = true;
    setCargando(true);
    setError(null);

    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (sucursalId) params.set("sucursalId", sucursalId);

    fetch(`/api/laboratorios/ventas?${params.toString()}`, { signal: control.signal })
      .then(async (res) => {
        const cuerpo: unknown = await res.json();
        if (!res.ok) {
          const msg =
            cuerpo && typeof cuerpo === "object" && "error" in cuerpo && typeof cuerpo.error === "string"
              ? cuerpo.error
              : "No se pudieron cargar las ventas por laboratorio.";
          throw new Error(msg);
        }
        const ventas =
          cuerpo && typeof cuerpo === "object" && "ventas" in cuerpo && Array.isArray(cuerpo.ventas)
            ? (cuerpo.ventas as Array<Record<string, unknown>>)
            : [];
        if (!vigente) return;
        setFilas(
          ventas.map((v) => ({
            laboratorioId: typeof v.laboratorioId === "string" ? v.laboratorioId : "",
            total: Number(v.total) || 0,
            unidades: Number(v.unidades) || 0,
            facturas: Number(v.facturas) || 0,
            productos: 0,
          })),
        );
      })
      .catch((e: unknown) => {
        // Cancelar por cambio de filtro no es un fallo que enseñar.
        if (!vigente || (e instanceof DOMException && e.name === "AbortError")) return;
        setFilas([]);
        setError(e instanceof Error ? e.message : "No se pudieron cargar las ventas por laboratorio.");
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
      control.abort();
    };
  }, [desde, hasta, sucursalId]);

  return { filas, cargando, error };
}
