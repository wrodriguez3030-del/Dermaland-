import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Info } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Card, CardContent } from "@/components/ui";
import { OrderStatusActions } from "@/features/storefront/components/order-status-actions";
import { webOrderStatusLabel } from "@/features/storefront/orders/status";
import { formatCurrency } from "@/lib/utils/format";
import { WEB_ORDER_MANAGE_ROLES } from "@/features/billing/permissions";
import { getSession } from "@/server/auth/context";
import { getWebOrderForBusiness } from "@/server/services/storefront/orders";
import { listOrderReceipts } from "@/server/services/storefront/transfer-payments";
import { ReceiptReview } from "@/features/storefront/components/receipt-review";

/**
 * Detalle de un pedido web.
 *
 * El pedido **no genera proforma**: con retiro y pago al recoger, la venta se
 * cobra en el POS cuando el cliente llega, y ahí nace el documento con su caja,
 * su cajero y sus reglas. Crear una proforma aquí dejaría dos documentos por una
 * sola venta. Por eso la pantalla dice qué hay que cobrar, y no lo cobra.
 */

export const dynamic = "force-dynamic";

export default async function PedidoWebDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/pedidos-web/${id}`);

  const pedido = await getWebOrderForBusiness(session.businessId, id);
  if (!pedido) notFound();

  // Las URL firmadas de los comprobantes SOLO para quien puede gestionarlos.
  //
  // La mutación ya exigía rol; la LECTURA no, y un comprobante lleva el nombre
  // del titular, su banco y su número de cuenta. La RLS valida el tenant, no el
  // rol (DL-01), así que sin esto cualquier usuario del negocio —incluido
  // inventario— podía abrirlos.
  const puedeVerComprobantes =
    session.isPlatformAdmin ||
    WEB_ORDER_MANAGE_ROLES.includes(session.user.role);
  const comprobantes =
    pedido.paymentMethod === "transferencia" && puedeVerComprobantes
      ? await listOrderReceipts(session.businessId, pedido.id, true)
      : [];

  const listo = pedido.status === "listo";
  const cerrado = pedido.status === "cancelado" || pedido.status === "entregado";

  return (
    <div className="space-y-6">
      <Link
        href="/pedidos-web"
        className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[color:var(--brand-primary)] underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden className="h-4 w-4" />
        Pedidos web
      </Link>

      <PageHeader
        title={`Pedido ${pedido.number}`}
        description={
          pedido.fulfillment === "delivery"
            ? `${pedido.contactName} · ${pedido.contactPhone} · ENVÍO a ${pedido.deliveryProvince}`
            : `${pedido.contactName} · ${pedido.contactPhone} · Retira en ${pedido.branchName}`
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Badge
          tone={
            pedido.status === "cancelado"
              ? "neutral"
              : pedido.status === "entregado"
                ? "success"
                : "info"
          }
        >
          {webOrderStatusLabel(pedido.status)}
        </Badge>
        <span className="text-sm text-[color:var(--brand-fg)]/60">
          Recibido el {new Date(pedido.createdAt).toLocaleString("es-DO")}
        </span>
      </div>

      {listo ? (
        <div className="flex items-start gap-3 rounded-2xl bg-[color:var(--brand-primary)]/5 px-5 py-4">
          <Info
            aria-hidden
            className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--brand-primary)]"
          />
          <p className="text-sm text-[color:var(--brand-fg)]/80">
            Cuando el cliente venga a retirar,{" "}
            <strong>cóbralo en el POS como cualquier otra venta</strong>. Este
            pedido no emite factura por sí solo.
          </p>
        </div>
      ) : null}

      {pedido.fulfillment === "delivery" ? (
        <Card>
          <CardContent>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
              A dónde se lleva
            </h2>
            <p className="mt-2 text-sm text-[color:var(--brand-fg)]/80">
              {pedido.deliveryAddress}
              <br />
              {pedido.deliverySector}, {pedido.deliveryProvince}
              {pedido.deliveryReference ? (
                <>
                  <br />
                  <span className="text-[color:var(--brand-fg)]/60">
                    Referencia: {pedido.deliveryReference}
                  </span>
                </>
              ) : null}
            </p>
            <p className="mt-2 text-sm text-[color:var(--brand-fg)]/60">
              Flete cobrado: {formatCurrency(pedido.shippingCost)} · Despacha{" "}
              {pedido.branchName}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
            Qué pidió
          </h2>
          <ul className="mt-3 divide-y divide-black/5">
            {pedido.items.map((linea, indice) => (
              <li
                key={`${linea.productName}-${indice}`}
                className="flex justify-between gap-4 py-3"
              >
                <span className="min-w-0 text-sm text-[color:var(--brand-fg)]/80">
                  {linea.qty} × {linea.productName}
                  <span className="block text-xs text-[color:var(--brand-fg)]/50">
                    {formatCurrency(linea.unitPrice)} c/u
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-[color:var(--brand-fg)]">
                  {formatCurrency(linea.lineTotal)}
                </span>
              </li>
            ))}
          </ul>

          {pedido.shippingCost > 0 ? (
            <div className="mt-3 flex justify-between text-sm">
              <span className="text-[color:var(--brand-fg)]/70">Envío</span>
              <span className="font-medium text-[color:var(--brand-fg)]">
                {formatCurrency(pedido.shippingCost)}
              </span>
            </div>
          ) : null}

          <div className="mt-4 flex items-baseline justify-between border-t border-black/5 pt-4">
            <span className="text-sm text-[color:var(--brand-fg)]/70">
              Total
            </span>
            <span className="text-2xl font-bold text-[color:var(--brand-fg)]">
              {formatCurrency(pedido.total)}
            </span>
          </div>
          <p className="mt-1 text-xs text-[color:var(--brand-fg)]/50">
            Precios de cuando se hizo el pedido, con ITBIS incluido
          </p>
        </CardContent>
      </Card>

      {pedido.notes ? (
        <Card>
          <CardContent>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
              Nota del cliente
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm text-[color:var(--brand-fg)]/80">
              {pedido.notes}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {pedido.paymentMethod === "transferencia" && puedeVerComprobantes ? (
        <Card>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
                Pago por transferencia
              </h2>
              <Badge tone={pedido.paymentStatus === "pagado" ? "success" : "info"}>
                {pedido.paymentStatus === "pagado" ? "Pagado" : "Pago pendiente"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-[color:var(--brand-fg)]/60">
              Aceptar un comprobante es lo único que marca este pedido como
              pagado. Comprueba el monto y la fecha antes.
            </p>
            <div className="mt-4">
              <ReceiptReview receipts={comprobantes} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!cerrado ? (
        <Card>
          <CardContent>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
              Mover el pedido
            </h2>
            <p className="mt-1 text-sm text-[color:var(--brand-fg)]/60">
              Antes de confirmar, comprueba que hay existencia real: el pedido no
              reserva inventario.
            </p>
            <div className="mt-4">
              <OrderStatusActions orderId={pedido.id} status={pedido.status} />
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
