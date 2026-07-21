import type { Proforma } from "@/types";
import { getDocumentDisplayInfo } from "@/features/sales/document-label";
import { invoiceDisplayTotals } from "@/features/sales/invoice-totals";
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
 * Vista PÚBLICA de un comprobante de venta — la que ve el cliente al abrir el
 * enlace de WhatsApp/correo SIN iniciar sesión (`/factura/[token]`).
 *
 * Es puramente presentacional y server-renderable (sin hooks ni sesión): recibe
 * la proforma ya resuelta por token. Muestra logo + negocio, datos del
 * comprobante, ítems, totales y forma de pago, más un botón "Descargar PDF" que
 * apunta al endpoint público firmado. No incluye acciones de personal.
 */
export function PublicInvoiceView({
  proforma,
  token,
}: {
  proforma: Proforma;
  token: string;
}) {
  const doc = getDocumentDisplayInfo(proforma);
  const demo = doc.showDemoBanner;
  const totals = invoiceDisplayTotals(proforma);
  const pdfUrl = `/api/proformas/${proforma.id}/pdf?t=${encodeURIComponent(token)}`;

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
        <div className="p-6">
          {/* Encabezado: logo + negocio / documento */}
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
                  <div className="text-xs opacity-70">{mockBusiness.address}</div>
                )}
                {mockBusiness.phone && (
                  <div className="text-xs opacity-70">Tel. {mockBusiness.phone}</div>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold leading-tight">{doc.title}</div>
              <div className="text-xs opacity-70">{doc.subtitle}</div>
              <div className="mt-1 text-[10px] uppercase tracking-wider opacity-50">
                {doc.numberLabel}
              </div>
              <div className="font-mono text-sm font-semibold">{doc.number}</div>
              <div className="text-xs opacity-60">
                {formatDateTime(proforma.createdAt)}
              </div>
            </div>
          </div>

          {demo && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {doc.cls === "proforma" ? (
                <>
                  <strong>PROFORMA · sin validez fiscal.</strong> Este documento no
                  es un comprobante fiscal.
                </>
              ) : (
                <>
                  <strong>Ambiente demo · sin validez fiscal.</strong> Representación
                  de e-CF en ambiente de pruebas.
                </>
              )}
            </div>
          )}

          {/* Cliente */}
          <div className="mt-4 text-sm">
            <div className="text-xs uppercase tracking-wider opacity-50">Cliente</div>
            <div className="font-medium">{proforma.customerName}</div>
            {proforma.customerDocument && (
              <div className="text-xs opacity-70">Doc. {proforma.customerDocument}</div>
            )}
          </div>

          {/* Ítems */}
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
                    <td className="py-2">{it.productName}</td>
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

          {/* Totales */}
          <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
            <Row label="Subtotal" value={formatCurrency(totals.grossInclusive)} />
            {totals.discountInclusive > 0 && (
              <Row
                label={`Descuento${
                  totals.discountPercent ? ` (${totals.discountPercent}%)` : ""
                }`}
                value={`- ${formatCurrency(totals.discountInclusive)}`}
              />
            )}
            <Row
              label="ITBIS (18% incluido)"
              value={formatCurrency(totals.itbisIncluded)}
            />
            <div className="flex items-center justify-between border-t border-black/10 pt-1 text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(totals.total)}</span>
            </div>
          </div>

          {/* Forma de pago */}
          {proforma.payments.length > 0 && (
            <div className="mt-5 border-t border-black/10 pt-4">
              <div className="mb-2 text-xs uppercase tracking-wider opacity-50">
                Forma de pago
              </div>
              <div className="space-y-1 text-sm">
                {proforma.payments.map((pay, i) => (
                  <div key={pay.id ?? i} className="flex items-center justify-between">
                    <span>{paymentMethodLabel[pay.method] ?? pay.method}</span>
                    <span className="tabular-nums">{formatCurrency(pay.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Descargar PDF */}
          <div className="mt-6 flex justify-center">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[color:var(--brand-primary,#7E8A6E)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
            >
              Descargar PDF
            </a>
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-xs opacity-50">
        {mockBusiness.commercialName}
        {mockBusiness.slogan ? ` · ${mockBusiness.slogan}` : ""}
      </p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="opacity-60">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
