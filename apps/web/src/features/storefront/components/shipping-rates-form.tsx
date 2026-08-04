"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Truck } from "lucide-react";
import type { ShippingRateRow } from "@/server/services/storefront/shipping";

/**
 * Panel de costos de envío: las 32 provincias, su precio y si se llega.
 *
 * Todo se guarda de una vez y no fila a fila: quien ajusta fletes suele tocar
 * varias provincias seguidas, y un guardado por fila convertiría eso en 32
 * peticiones y 32 oportunidades de dejarlo a medias.
 *
 * Una provincia **desactivada no se ofrece** en la tienda. Es lo que evita que
 * un coste sin poner se traduzca en envíos gratis: sin activar, no se llega.
 */
export function ShippingRatesForm({ initial }: { initial: ShippingRateRow[] }) {
  const router = useRouter();
  const [filas, setFilas] = React.useState(initial);
  const [guardando, setGuardando] = React.useState(false);
  const [mensaje, setMensaje] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const activas = filas.filter((f) => f.active).length;

  function cambiar(slug: string, cambios: Partial<ShippingRateRow>) {
    setFilas((prev) =>
      prev.map((f) => (f.provinceSlug === slug ? { ...f, ...cambios } : f)),
    );
    setMensaje(null);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      const resp = await fetch("/api/envios/tarifas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rates: filas.map((f) => ({
            provinceSlug: f.provinceSlug,
            cost: f.cost,
            active: f.active,
          })),
        }),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => null);
        setError(d?.error ?? "No se pudieron guardar las tarifas.");
        return;
      }
      setMensaje(
        activas === 0
          ? "Guardado. Con ninguna provincia activa, la tienda solo ofrece retiro en sucursal."
          : `Guardado. Se envía a ${activas} ${activas === 1 ? "provincia" : "provincias"}.`,
      );
      router.refresh();
    } catch {
      setError("No se pudieron guardar las tarifas.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[color:var(--brand-primary)]/5 px-5 py-4">
        <p className="flex items-center gap-2 text-sm text-[color:var(--brand-fg)]/80">
          <Truck aria-hidden className="h-5 w-5 shrink-0" />
          {activas === 0
            ? "Ninguna provincia activa: la tienda solo ofrece retiro en sucursal."
            : `Se envía a ${activas} de 32 provincias.`}
        </p>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-5 text-sm font-semibold text-white hover:bg-[color:var(--brand-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50"
        >
          {guardando ? (
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          ) : null}
          Guardar tarifas
        </button>
      </div>

      {mensaje ? (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {mensaje}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-black/5 rounded-2xl border border-black/5 bg-white">
        {filas.map((f) => (
          <li
            key={f.provinceSlug}
            className="flex flex-wrap items-center gap-4 px-4 py-3"
          >
            <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={f.active}
                onChange={(e) =>
                  cambiar(f.provinceSlug, { active: e.target.checked })
                }
                className="h-5 w-5 cursor-pointer rounded border-black/20"
              />
              <span
                className={
                  f.active
                    ? "text-sm font-medium text-[color:var(--brand-fg)]"
                    : "text-sm text-[color:var(--brand-fg)]/50"
                }
              >
                {f.provinceName}
              </span>
            </label>

            <div className="flex items-center gap-2">
              <span className="text-sm text-[color:var(--brand-fg)]/50">RD$</span>
              <label className="sr-only" htmlFor={`costo-${f.provinceSlug}`}>
                Costo de envío a {f.provinceName}
              </label>
              <input
                id={`costo-${f.provinceSlug}`}
                type="number"
                min={0}
                step={10}
                value={f.cost}
                onChange={(e) =>
                  cambiar(f.provinceSlug, {
                    cost: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="min-h-11 w-28 rounded-xl border border-black/10 bg-white px-3 text-right text-sm"
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="text-sm text-[color:var(--brand-fg)]/60">
        Una provincia sin marcar no se ofrece en la tienda, aunque tenga precio.
        Un precio en <strong>0</strong> con la casilla marcada significa envío
        gratis a esa provincia.
      </p>
    </div>
  );
}
