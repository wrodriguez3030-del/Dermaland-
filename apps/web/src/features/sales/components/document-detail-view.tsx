"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  FileText,
  Printer,
  Send,
} from "lucide-react";
import { Badge, Button, Card, CardContent } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useProformaDocument } from "@/features/sales/proforma-store";
import { shareProformaWhatsapp } from "@/features/sales/whatsapp-share.client";
import { isDemoDocument, proformaDocLabel } from "@/features/sales/proforma-share";
import { documentRouteBase } from "@/features/sales/document-label";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

const paymentMethodLabel: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  azul: "Azul",
  cardnet: "CardNET",
  visanet: "VisaNet",
  paypal: "PayPal",
  manual: "Manual",
  other: "Otro",
};

/**
 * Detalle de un documento de venta (proforma / factura NCF / e-CF), leído
 * desde la fuente correcta (`useProformaDocument`: servidor en supabase, store
 * en local). La impresión enruta por TIPO de documento: facturas → /ventas,
 * proformas → /proformas. Sin mensajes de localStorage ni IDs técnicos.
 */
export function DocumentDetailView({
  id,
  backHref,
  backLabel,
}: {
  id: string;
  backHref: string;
  backLabel: string;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const toast = useToast();

  const { proforma, loading } = useProformaDocument(id);

  if (!mounted || loading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border bg-white p-6 text-center text-sm opacity-70">
          Cargando documento…
        </div>
      </div>
    );
  }

  if (!proforma) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <h2 className="text-lg font-semibold">Documento no encontrado</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm opacity-70">
              No pudimos abrir este documento. Verifica que siga disponible o
              búscalo en el listado.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link href="/ventas">
                <Button size="sm">Ver ventas / facturas</Button>
              </Link>
              <Link href="/proformas">
                <Button size="sm" variant="outline">
                  Ver proformas
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const demo = isDemoDocument(proforma);
  const docLabel = proformaDocLabel(proforma);
  // Enrutar impresión por TIPO: facturas → /ventas, proformas → /proformas.
  const printBase = documentRouteBase(proforma);

  const handleShareWhatsapp = async () => {
    const r = await shareProformaWhatsapp(proforma);
    if (r.ok) toast.show("Abriendo WhatsApp con el documento en PDF…", "info");
    else toast.error(r.error);
  };

  const openPrint = (auto = false) => {
    if (typeof window === "undefined") return;
    window.open(
      `${printBase}/${proforma.id}/print${auto ? "?auto=1" : ""}`,
      "_blank",
    );
  };

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
        >
          <ArrowLeft className="h-3 w-3" /> {backLabel}
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => openPrint(true)}>
            <Printer className="h-4 w-4" />
            Imprimir ticket
          </Button>
          <Button size="sm" variant="outline" onClick={() => openPrint(false)}>
            <Download className="h-4 w-4" />
            Descargar PDF
          </Button>
          {proforma.documentKind === "invoice" && (
            <Link href={`/dgii/preview/${proforma.id}`}>
              <Button size="sm" variant="outline">
                <FileText className="h-4 w-4" />
                Vista previa e-CF (DEMO)
              </Button>
            </Link>
          )}
          <Button size="sm" onClick={handleShareWhatsapp}>
            <Send className="h-4 w-4" />
            Enviar WhatsApp
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4 border-b border-black/10 pb-4">
            <div className="flex items-center gap-3">
              {mockBusiness.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mockBusiness.logoUrl}
                  alt={mockBusiness.commercialName}
                  className="h-14 w-14 shrink-0 object-contain"
                />
              )}
              <div>
                <div className="text-lg font-bold leading-tight">
                  {mockBusiness.commercialName}
                </div>
                <div className="text-xs opacity-70">
                  {mockBusiness.legalName} · RNC {mockBusiness.rnc}
                </div>
                {mockBusiness.address && (
                  <div className="text-xs opacity-70">
                    {mockBusiness.address}
                    {mockBusiness.city ? `, ${mockBusiness.city}` : ""}
                  </div>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider opacity-50">
                {docLabel}
              </div>
              <div className="font-mono text-sm font-semibold">
                {proforma.ecfNumber ?? proforma.number}
              </div>
              <div className="text-xs opacity-60">
                {formatDateTime(proforma.createdAt)}
              </div>
            </div>
          </div>

          {demo && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <strong>DEMO · sin validez fiscal.</strong> Este documento aún no
              ha sido convertido a comprobante fiscal electrónico (e-CF).
            </div>
          )}

          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wider opacity-50">
                Cliente
              </div>
              <div className="font-medium">{proforma.customerName}</div>
              {proforma.customerDocument && (
                <div className="text-xs opacity-70">
                  Doc. {proforma.customerDocument}
                </div>
              )}
              {proforma.customerPhone && (
                <div className="text-xs opacity-70">
                  Tel. {proforma.customerPhone}
                </div>
              )}
            </div>
            <div className="sm:text-right">
              <div className="text-xs uppercase tracking-wider opacity-50">
                Cajero
              </div>
              <div className="font-medium">{proforma.cashierName}</div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wider opacity-50">
                  <th className="py-2">Producto</th>
                  <th className="py-2 text-right">Cant.</th>
                  <th className="py-2 text-right">Precio</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {proforma.items.map((it, i) => (
                  <tr key={`${it.productId}_${i}`} className="border-b border-black/5">
                    <td className="py-2">
                      <div>{it.productName}</div>
                      {it.lotNumber && (
                        <div className="text-xs opacity-60">
                          Lote {it.lotNumber}
                        </div>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">{it.quantity}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCurrency(it.unitPrice)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCurrency(it.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
            <Row label="Subtotal" value={formatCurrency(proforma.subtotal)} />
            {proforma.discount > 0 && (
              <Row
                label={`Descuento${
                  proforma.discountPercent ? ` (${proforma.discountPercent}%)` : ""
                }`}
                value={`- ${formatCurrency(proforma.discount)}`}
              />
            )}
            <Row label="ITBIS" value={formatCurrency(proforma.itbis)} />
            <div className="flex items-center justify-between border-t border-black/10 pt-1 text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(proforma.total)}</span>
            </div>
          </div>

          <div className="mt-5 border-t border-black/10 pt-4">
            <div className="mb-2 text-xs uppercase tracking-wider opacity-50">
              Forma de pago
            </div>
            <div className="space-y-1 text-sm">
              {proforma.payments.length === 0 && (
                <div className="opacity-60">Sin pagos registrados.</div>
              )}
              {proforma.payments.map((pay, i) => (
                <div
                  key={pay.id ?? i}
                  className="flex items-center justify-between"
                >
                  <span>
                    {paymentMethodLabel[pay.method] ?? pay.method}
                    {pay.last4 && <span className="opacity-60"> ····{pay.last4}</span>}
                    {pay.reference && (
                      <span className="opacity-60"> · {pay.reference}</span>
                    )}
                  </span>
                  <span className="tabular-nums">{formatCurrency(pay.amount)}</span>
                </div>
              ))}
              {(proforma.amountReceived ?? 0) > proforma.total && (
                <div className="flex items-center justify-between opacity-70">
                  <span>Vuelto</span>
                  <span className="tabular-nums">
                    {formatCurrency(proforma.changeAmount ?? 0)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Badge tone={demo ? "warning" : "success"}>
              {demo ? "DEMO / NO FISCAL" : "Documento emitido"}
            </Badge>
            {mockBusiness.slogan && (
              <span className="text-xs opacity-60">{mockBusiness.slogan}</span>
            )}
          </div>
        </CardContent>
      </Card>
      <toast.Toast />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="opacity-70">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
