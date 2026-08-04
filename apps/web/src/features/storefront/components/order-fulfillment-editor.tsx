"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Store, Truck } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";

/**
 * Cambiar cómo se entrega un pedido, desde el ERP.
 *
 * Hasta ahora no se podía: el cliente que se equivocaba de opción obligaba a
 * cancelar y rehacer el pedido, perdiendo el número y el historial. Y
 * equivocarse era fácil, porque el selector de la tienda venía preseleccionado
 * en "Retiro" — eso ya se arregló, pero los pedidos de antes siguen ahí.
 *
 * Empieza CERRADO. Cambiar la entrega es raro; lo normal es mirar el pedido. Un
 * formulario abierto compitiendo con la información del pedido no ayuda a nadie.
 *
 * El coste del envío NO se pide ni se envía: lo pone el servidor con las
 * tarifas de hoy. Aquí solo se elige el destino.
 */

export interface ProvinciaOpcion {
  slug: string;
  name: string;
  cost: number;
}

export interface SucursalOpcion {
  id: string;
  name: string;
}

export function OrderFulfillmentEditor({
  orderId,
  fulfillment,
  branchId,
  branches,
  provinces,
  address,
}: {
  orderId: string;
  fulfillment: "pickup" | "delivery";
  branchId: string;
  branches: SucursalOpcion[];
  /** Provincias a las que se llega HOY, con su tarifa. */
  provinces: ProvinciaOpcion[];
  address?: {
    provinceSlug?: string;
    sector?: string;
    address?: string;
    reference?: string;
  };
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [modo, setModo] = React.useState<"pickup" | "delivery">(fulfillment);
  const [sucursal, setSucursal] = React.useState(branchId);
  const [provincia, setProvincia] = React.useState(address?.provinceSlug ?? "");
  const [sector, setSector] = React.useState(address?.sector ?? "");
  const [direccion, setDireccion] = React.useState(address?.address ?? "");
  const [referencia, setReferencia] = React.useState(address?.reference ?? "");
  const [enviando, setEnviando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const sinEnvio = provinces.length === 0;
  const tarifa = provinces.find((p) => p.slug === provincia);

  function cerrar() {
    // Al cerrar se vuelve a lo que hay guardado: media edición a medias es peor
    // que ninguna.
    setModo(fulfillment);
    setSucursal(branchId);
    setProvincia(address?.provinceSlug ?? "");
    setSector(address?.sector ?? "");
    setDireccion(address?.address ?? "");
    setReferencia(address?.reference ?? "");
    setError(null);
    setAbierto(false);
  }

  async function guardar() {
    setEnviando(true);
    setError(null);
    try {
      const cuerpo =
        modo === "pickup"
          ? { to: "pickup", branchId: sucursal }
          : {
              to: "delivery",
              branchId: sucursal,
              province: provincia,
              sector,
              address: direccion,
              reference: referencia || undefined,
            };
      const resp = await fetch(`/api/pedidos-web/${orderId}/entrega`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      if (!resp.ok) {
        const datos = await resp.json().catch(() => null);
        setError(datos?.error ?? "No se pudo cambiar la entrega.");
        return;
      }
      setAbierto(false);
      router.refresh();
    } catch {
      setError("No se pudo cambiar la entrega.");
    } finally {
      setEnviando(false);
    }
  }

  const puedeGuardar =
    modo === "pickup"
      ? sucursal.length > 0
      : sucursal.length > 0 &&
        provincia.length > 0 &&
        sector.trim().length > 0 &&
        direccion.trim().length > 0;

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white px-4 text-sm font-semibold text-[color:var(--brand-primary)] hover:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] focus-visible:ring-offset-2"
      >
        <Pencil aria-hidden className="h-4 w-4" />
        Cambiar tipo de entrega
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <fieldset>
        <legend className="text-sm font-semibold text-[color:var(--brand-fg)]">
          ¿Cómo lo recibe?
        </legend>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
              modo === "pickup"
                ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5"
                : "border-black/10"
            }`}
          >
            <input
              type="radio"
              name="entrega"
              checked={modo === "pickup"}
              onChange={() => setModo("pickup")}
              className="h-4 w-4 cursor-pointer"
            />
            <Store aria-hidden className="h-4 w-4 shrink-0" />
            Retira en sucursal
          </label>

          <label
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
              sinEnvio ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            } ${
              modo === "delivery"
                ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5"
                : "border-black/10"
            }`}
          >
            <input
              type="radio"
              name="entrega"
              checked={modo === "delivery"}
              disabled={sinEnvio}
              onChange={() => setModo("delivery")}
              className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
            />
            <Truck aria-hidden className="h-4 w-4 shrink-0" />
            Envío a domicilio
          </label>
        </div>

        {sinEnvio ? (
          <p className="mt-2 text-xs text-[color:var(--brand-fg)]/60">
            No hay ninguna provincia con tarifa activa. Configúralas en Tienda →
            Costos de envío.
          </p>
        ) : null}
      </fieldset>

      <label className="mt-4 block text-sm">
        <span className="font-medium text-[color:var(--brand-fg)]">
          {modo === "delivery" ? "Sucursal que despacha" : "Sucursal donde retira"}
        </span>
        <select
          value={sucursal}
          onChange={(e) => setSucursal(e.target.value)}
          className="mt-1 min-h-11 w-full cursor-pointer rounded-xl border border-black/10 px-3 text-sm"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>

      {modo === "delivery" ? (
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="font-medium text-[color:var(--brand-fg)]">
              Provincia
            </span>
            <select
              value={provincia}
              onChange={(e) => setProvincia(e.target.value)}
              className="mt-1 min-h-11 w-full cursor-pointer rounded-xl border border-black/10 px-3 text-sm"
            >
              <option value="">Elige una provincia</option>
              {provinces.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name} — {formatCurrency(p.cost)}
                </option>
              ))}
            </select>
          </label>

          {tarifa ? (
            <p className="text-xs text-[color:var(--brand-fg)]/60">
              El flete pasará a {formatCurrency(tarifa.cost)} y el total se
              recalcula al guardar.
            </p>
          ) : null}

          <label className="block text-sm">
            <span className="font-medium text-[color:var(--brand-fg)]">Sector</span>
            <input
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              maxLength={120}
              className="mt-1 min-h-11 w-full rounded-xl border border-black/10 px-3 text-sm"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-[color:var(--brand-fg)]">
              Dirección
            </span>
            <input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              maxLength={300}
              className="mt-1 min-h-11 w-full rounded-xl border border-black/10 px-3 text-sm"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-[color:var(--brand-fg)]">
              Referencia <span className="font-normal opacity-60">(opcional)</span>
            </span>
            <input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              maxLength={300}
              className="mt-1 min-h-11 w-full rounded-xl border border-black/10 px-3 text-sm"
            />
          </label>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={enviando || !puedeGuardar}
          onClick={guardar}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-5 text-sm font-semibold text-white hover:bg-[color:var(--brand-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50"
        >
          {enviando ? (
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          ) : null}
          Guardar entrega
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={cerrar}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-black/10 bg-white px-5 text-sm font-semibold text-[color:var(--brand-fg)]/70 hover:border-black/20 disabled:cursor-default disabled:opacity-50"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}
