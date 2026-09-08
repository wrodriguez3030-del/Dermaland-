"use client";

import * as React from "react";
import type { MonthFilter, YearFilter } from "./dashboard-filters";

/**
 * Cuántos clientes se dieron de alta en el período elegido.
 *
 * 🔴 Sustituye a `customers.filter(...).length` sobre la lista COMPLETA: el
 * panel se descargaba los 6 525 clientes (2,6 MB de JSON, medidos) para contar
 * unos pocos. Ahora cuenta la base y viaja un número.
 *
 * El mes y el año viajan tal cual y los interpreta el servidor con el MISMO
 * criterio que `matchesPeriod` (UTC). No se traducen aquí a un rango de fechas
 * porque «mes 9 de cualquier año» no es un rango, y convertirlo en uno contaría
 * TODOS los clientes: un número falso en una tarjeta que nadie sabría dudar.
 */
export function useClientesNuevos(
  month: MonthFilter,
  year: YearFilter,
): { total: number | null; error: string | null } {
  const [total, setTotal] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const control = new AbortController();
    let vigente = true;
    setError(null);
    // El período viaja como mes y año, tal cual: traducirlo aquí a un rango
    // rompería «mes de cualquier año», que no ES un rango. Lo resuelve el
    // servidor con el mismo criterio que `matchesPeriod`.
    const params = new URLSearchParams();
    if (month !== "all") params.set("mes", String(month));
    if (year !== "all") params.set("anio", String(year));

    fetch(`/api/customers/nuevos?${params.toString()}`, { signal: control.signal })
      .then(async (res) => {
        const cuerpo = (await res.json().catch(() => ({}))) as { total?: number; error?: string };
        if (!res.ok) throw new Error(cuerpo.error ?? "No se pudo contar los clientes nuevos.");
        if (vigente) setTotal(Number(cuerpo.total) || 0);
      })
      .catch((e: unknown) => {
        if (!vigente || (e instanceof DOMException && e.name === "AbortError")) return;
        // 🔴 `null`, no 0: un cero por un fallo de red se lee como «no entró
        // ningún cliente este mes», que es una afirmación sobre el negocio.
        setTotal(null);
        setError(e instanceof Error ? e.message : "No se pudo contar los clientes nuevos.");
      });

    return () => {
      vigente = false;
      control.abort();
    };
  }, [month, year]);

  return { total, error };
}
