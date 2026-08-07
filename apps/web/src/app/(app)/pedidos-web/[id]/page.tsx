import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Info, MapPin, Receipt } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Card, CardContent } from "@/components/ui";
import { OrderStatusActions } from "@/features/storefront/components/order-status-actions";
import { webOrderStatusLabelFor } from "@/features/storefront/orders/status";
import { lineStockVerdict } from "@/features/storefront/orders/line-stock";
import { formatCurrency } from "@/lib/utils/format";
import { formatDominicanPhone } from "@/lib/utils/formatters";
import { WEB_ORDER_MANAGE_ROLES } from "@/features/billing/permissions";
import { getSession } from "@/server/auth/context";
import {
  branchDisplayNames,
  getWebOrderForBusiness,
  listActiveBranches,
  proformaNumberFor,
} from "@/server/services/storefront/orders";
import { loadShippingRates } from "@/server/services/storefront/shipping";
import { deliverableProvinces } from "@/features/storefront/shipping/quote";
import { OrderFulfillmentEditor } from "@/features/storefront/components/order-fulfillment-editor";
import { loadWebAvailability } from "@/server/services/storefront/stock";
import { listOrderReceipts } from "@/server/services/storefront/transfer-payments";
import { ReceiptReview } from "@/features/storefront/components/receipt-review";

/**
 * Detalle de un pedido web.
 *
 * El pedido no crea la factura por su cuenta: la venta se emite en el POS, con
 * su caja, su cajero, FEFO y las reglas documentales de siempre. Lo que hace
 * esta pantalla es llevarte allí con todo puesto (botón "Facturar") y, al
 * volver, dejar el documento enlazado al pedido. Un solo documento por venta.
 *
 * Antes de confirmar enseña la existencia REAL de cada línea —en esta sucursal
 * y en las demás— para no tener que abrir el inventario en otra pestaña.
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
  const puedeGestionar =
    session.isPlatformAdmin ||
    WEB_ORDER_MANAGE_ROLES.includes(session.user.role);
  const puedeVerComprobantes = puedeGestionar;
  const comprobantes =
    pedido.paymentMethod === "transferencia" && puedeVerComprobantes
      ? await listOrderReceipts(session.businessId, pedido.id, true)
      : [];

  const listo = pedido.status === "listo";
  const cerrado = pedido.status === "cancelado" || pedido.status === "entregado";

  // Existencia VIVA de cada línea. Sin caché y sin contar este mismo pedido
  // como compromiso ajeno: sus líneas no compiten consigo mismas.
  const [disponibilidad, nombresSucursal, sucursales, tarifas] =
    await Promise.all([
      loadWebAvailability(
        session.businessId,
        pedido.items.map((l) => l.productId),
        { excludeOrderId: pedido.id },
      ),
      branchDisplayNames(session.businessId),
      listActiveBranches(session.businessId),
      loadShippingRates(session.businessId),
    ]);
  const provincias = deliverableProvinces(tarifas);

  // Cambiar la entrega solo mientras el pedido siga vivo y sin facturar: la
  // proforma lleva el flete dentro, y cambiarlo después dejaría el documento
  // diciendo una cosa y el pedido otra.
  const puedeCambiarEntrega =
    puedeGestionar && !cerrado && !pedido.proformaId;

  // Facturar mientras el pedido no esté cancelado y no tenga ya documento. Un
  // pedido `entregado` sin factura SÍ se puede facturar: la mercancía salió y
  // el documento falta, que es justo lo que hay que poder arreglar.
  const puedeFacturar =
    puedeGestionar && pedido.status !== "cancelado" && !pedido.proformaId;

  const numeroDocumento = pedido.proformaId
    ? await proformaNumberFor(session.businessId, pedido.proformaId)
    : null;
  // ¿Contra qué sucursal se mira la existencia?
  //
  // La del pedido NO, si es un envío: ahí el cliente no eligió sucursal y la
  // guardada es la que puso la tienda por defecto. Se despacha desde la marcada
  // `is_web_fulfillment`, que es también desde donde factura el POS.
  //
  // Mirarlo contra la del pedido decía "No está en esta sucursal · Hay en:
  // E. León Jiménez (3)" sobre mercancía que SÍ estaba donde se iba a despachar:
  // una alarma falsa en la pantalla que se usa para decidir si el pedido sale.
  const sucursalDespacho =
    pedido.fulfillment === "delivery"
      ? (sucursales.find((b) => b.isWebFulfillment)?.id ?? pedido.branchId)
      : pedido.branchId;

  const existencias = pedido.items.map((linea) =>
    lineStockVerdict(
      linea.qty,
      disponibilidad.get(linea.productId),
      sucursalDespacho,
      nombresSucursal,
    ),
  );
  const faltaAlgo = existencias.some((v) => v.tone !== "ok");

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
            ? `${pedido.contactName} · ${formatDominicanPhone(pedido.contactPhone)} · ENVÍO a ${pedido.deliveryProvince}`
            : `${pedido.contactName} · ${formatDominicanPhone(pedido.contactPhone)} · Retira en ${pedido.branchName}`
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
          {webOrderStatusLabelFor(pedido.status, pedido.fulfillment)}
        </Badge>
        <span className="text-sm text-[color:var(--brand-fg)]/60">
          Recibido el {new Date(pedido.createdAt).toLocaleString("es-DO")}
        </span>
      </div>

      {/* Facturar sin volver a teclear nada. El POS se abre con el carrito, el
          cliente y la sucursal del pedido puestos; ahí se cobra con las reglas
          de siempre y, al emitir, el documento queda enlazado aquí. */}
      {pedido.proformaId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-50 px-5 py-4">
          <p className="text-sm text-emerald-900">
            Facturado{numeroDocumento ? ` · ${numeroDocumento}` : ""}
          </p>
          <Link
            href={`/proformas/${pedido.proformaId}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-800 hover:border-emerald-500"
          >
            <Receipt aria-hidden className="h-4 w-4" />
            Ver el documento
          </Link>
        </div>
      ) : puedeFacturar ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[color:var(--brand-primary)]/5 px-5 py-4">
          <p className="text-sm text-[color:var(--brand-fg)]/80">
            {listo
              ? "El pedido está listo. Cuando el cliente pague, factúralo aquí mismo."
              : "Puedes facturarlo cuando quieras: el POS se abre con todo puesto."}
          </p>
          <Link
            href={`/pos?pedido=${pedido.id}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-5 text-sm font-semibold text-white hover:bg-[color:var(--brand-accent)]"
          >
            <Receipt aria-hidden className="h-4 w-4" />
            Facturar en el POS
          </Link>
        </div>
      ) : null}

      {faltaAlgo && !pedido.proformaId ? (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 px-5 py-4">
          <Info aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <p className="text-sm text-amber-900">
            Hay líneas sin existencia en {pedido.branchName}. Mira el detalle de
            cada una más abajo: el POS solo puede cobrar lo que haya aquí.
          </p>
        </div>
      ) : null}

      <Card>
        <CardContent>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
            Entrega
          </h2>

          {pedido.fulfillment === "delivery" ? (
            <>
              <p className="mt-2 text-sm text-[color:var(--brand-fg)]/80">
                <strong className="font-semibold">Envío a domicilio</strong>
                <br />
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
              {/* La ubicación que el cliente compartió, si lo hizo. El enlace
                  se arma aquí y no se guarda en la base: así el dato sigue
                  sirviendo si mañana se cambia de proveedor de mapas. */}
              {pedido.deliveryLat != null && pedido.deliveryLng != null ? (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${pedido.deliveryLat},${pedido.deliveryLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--brand-primary)]/30 px-3 text-sm font-semibold text-[color:var(--brand-primary)] transition-colors hover:bg-[color:var(--brand-primary)]/5"
                >
                  <MapPin aria-hidden className="h-4 w-4" />
                  Ver ubicación en el mapa
                </a>
              ) : null}
              <p className="mt-2 text-sm text-[color:var(--brand-fg)]/60">
                Flete cobrado: {formatCurrency(pedido.shippingCost)} · Despacha{" "}
                {nombresSucursal.get(sucursalDespacho) ?? pedido.branchName}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-[color:var(--brand-fg)]/80">
              <strong className="font-semibold">Retiro en sucursal</strong>
              <br />
              {pedido.branchName}
            </p>
          )}

          {/* Se puede cambiar mientras el pedido siga abierto y sin facturar.
              Antes había que cancelar y rehacerlo, perdiendo número e
              historial por haber pulsado el botón equivocado. */}
          {puedeCambiarEntrega ? (
            <div className="mt-4">
              <OrderFulfillmentEditor
                orderId={pedido.id}
                fulfillment={pedido.fulfillment}
                branchId={pedido.branchId}
                branches={sucursales}
                provinces={provincias.map((p) => ({
                  slug: p.slug,
                  name: p.name,
                  cost: p.cost,
                }))}
                address={{
                  provinceSlug: pedido.deliveryProvinceSlug,
                  sector: pedido.deliverySector,
                  address: pedido.deliveryAddress,
                  reference: pedido.deliveryReference,
                }}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
            Qué pidió
          </h2>
          <ul className="mt-3 divide-y divide-black/5">
            {pedido.items.map((linea, indice) => {
              const existencia = existencias[indice]!;
              return (
                <li
                  key={`${linea.productName}-${indice}`}
                  className="flex justify-between gap-4 py-3"
                >
                  <span className="min-w-0 text-sm text-[color:var(--brand-fg)]/80">
                    {linea.qty} × {linea.productName}
                    <span className="block text-xs text-[color:var(--brand-fg)]/50">
                      {formatCurrency(linea.unitPrice)} c/u
                    </span>
                    {/* La existencia, aquí mismo: quien confirma no debería
                        tener que abrir el inventario en otra pestaña. */}
                    <span
                      className={`mt-1 inline-block text-xs font-medium ${
                        existencia.tone === "ok"
                          ? "text-emerald-700"
                          : existencia.tone === "warn"
                            ? "text-amber-700"
                            : "text-red-700"
                      }`}
                    >
                      {existencia.label}
                    </span>
                    {existencia.hint ? (
                      <span className="block text-xs text-[color:var(--brand-fg)]/50">
                        {existencia.hint}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-[color:var(--brand-fg)]">
                    {formatCurrency(linea.lineTotal)}
                  </span>
                </li>
              );
            })}
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
              {faltaAlgo
                ? "Ojo: hay líneas que no se pueden despachar tal cual desde esta sucursal. Míralas arriba antes de confirmar."
                : "Todo lo que pidió está en esta sucursal."}
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
