import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, MapPin } from "lucide-react";
import { Badge } from "@/components/ui";
import { webOrderStatusLabel } from "@/features/storefront/orders/status";
import { formatCurrency } from "@/lib/utils/format";
import { findWebOrderByToken } from "@/server/services/storefront/orders";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";

/**
 * El pedido, visto por el cliente y SIN sesión.
 *
 * La autorización es el token firmado, igual que en `/factura/[token]`: lleva el
 * `business_id` y el id dentro, con HMAC. Nunca el número — `WEB-000123` es
 * correlativo y adivinable.
 *
 * Un token inválido, caducado o de otro negocio da 404 a secas. No se distingue
 * "no existe" de "no es tuyo": esa diferencia le diría a quien prueba tokens si
 * va por buen camino.
 */

export const metadata: Metadata = {
  title: "Tu pedido",
  robots: { index: false, follow: false },
};

/** Sin esto saldría como ruta estática en el build (`tienda-en-linea.md` §4.1). */
export const dynamic = "force-dynamic";

export default async function PedidoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tenant = await resolveStorefrontTenant();
  if (!tenant) notFound();

  const pedido = await findWebOrderByToken(token);
  if (!pedido) notFound();

  const cancelado = pedido.status === "cancelado";

  return (
    <div className="mx-auto max-w-2xl">
      {!cancelado ? (
        <div className="mb-6 flex items-start gap-3 rounded-2xl bg-[color:var(--brand-primary)]/5 px-5 py-4">
          <CheckCircle2
            aria-hidden
            className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--brand-primary)]"
          />
          <div>
            <p className="font-semibold text-[color:var(--brand-fg)]">
              Recibimos tu pedido
            </p>
            <p className="mt-1 text-sm text-[color:var(--brand-fg)]/70">
              Te llamamos al {pedido.contactPhone} para confirmarte
              disponibilidad.{" "}
              {pedido.fulfillment === "delivery"
                ? "Pagas al recibirlo."
                : "Pagas al retirar."}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-[color:var(--brand-fg)]">
          Pedido {pedido.number}
        </h1>
        <Badge tone={cancelado ? "neutral" : "success"}>
          {webOrderStatusLabel(pedido.status)}
        </Badge>
      </div>

      {pedido.fulfillment === "delivery" ? (
        <div className="mt-3 flex items-start gap-2 text-sm text-[color:var(--brand-fg)]/70">
          <MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Te lo llevamos a <strong className="font-semibold">
              {pedido.deliveryAddress}
            </strong>
            , {pedido.deliverySector}, {pedido.deliveryProvince}
            {pedido.deliveryReference ? ` (${pedido.deliveryReference})` : ""}
          </span>
        </div>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-sm text-[color:var(--brand-fg)]/70">
          <MapPin aria-hidden className="h-4 w-4 shrink-0" />
          Retiras en <strong className="font-semibold">{pedido.branchName}</strong>
        </p>
      )}

      <ul className="mt-6 divide-y divide-black/5 rounded-2xl border border-black/5 bg-white">
        {pedido.items.map((linea, indice) => (
          <li
            key={`${linea.productName}-${indice}`}
            className="flex justify-between gap-4 px-4 py-3"
          >
            <span className="min-w-0 text-sm text-[color:var(--brand-fg)]/80">
              {linea.qty} × {linea.productName}
            </span>
            <span className="shrink-0 text-sm font-semibold text-[color:var(--brand-fg)]">
              {formatCurrency(linea.lineTotal)}
            </span>
          </li>
        ))}
        {pedido.shippingCost > 0 ? (
          <li className="flex justify-between gap-4 px-4 py-3">
            <span className="text-sm text-[color:var(--brand-fg)]/80">Envío</span>
            <span className="text-sm font-semibold text-[color:var(--brand-fg)]">
              {formatCurrency(pedido.shippingCost)}
            </span>
          </li>
        ) : null}
        <li className="flex justify-between gap-4 px-4 py-3">
          <span className="text-sm font-semibold text-[color:var(--brand-fg)]">
            Total
          </span>
          <span className="text-lg font-bold text-[color:var(--brand-fg)]">
            {formatCurrency(pedido.total)}
          </span>
        </li>
      </ul>
      <p className="mt-2 text-xs text-[color:var(--brand-fg)]/50">
        Precios con ITBIS incluido
      </p>

      {pedido.notes ? (
        <div className="mt-6 rounded-2xl border border-black/5 bg-white p-4">
          <h2 className="text-sm font-semibold text-[color:var(--brand-fg)]">
            Tu nota
          </h2>
          <p className="mt-1 whitespace-pre-line text-sm text-[color:var(--brand-fg)]/70">
            {pedido.notes}
          </p>
        </div>
      ) : null}

      <p className="mt-8 text-sm text-[color:var(--brand-fg)]/60">
        Guarda este enlace: con él puedes volver a ver tu pedido cuando quieras.
      </p>

      <Link
        href="/tienda"
        className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-black/10 bg-white px-5 text-sm font-semibold text-[color:var(--brand-primary)] hover:border-[color:var(--brand-primary)]"
      >
        Seguir comprando
      </Link>
    </div>
  );
}
