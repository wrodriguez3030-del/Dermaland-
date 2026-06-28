"use client";

import * as React from "react";
import type { Proforma } from "@/types";
import { mockBusiness, getBranchById } from "@/lib/mock-data/tenancy";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { billingTypeLabel } from "@/features/customers/billing";
import { getDocumentPrintContext } from "@/features/sales/document-print-context";
import { cn } from "@/lib/utils/cn";

interface Receipt80mmProps {
  proforma: Proforma;
  /** Si true, muestra borde y fondo gris fuera del recibo (preview en pantalla). */
  preview?: boolean;
  className?: string;
}

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
 * Comprobante 80mm — diseñado para impresora térmica.
 *
 * Reglas:
 *  - Ancho fijo `80mm` (≈302px a 96 DPI).
 *  - Tipografía monospace para alineación de columnas tipo POS.
 *  - Sin colores fuertes ni sombras (tinta térmica monocromática).
 *  - `font-size: 11px` en pantalla; al imprimir el navegador respeta `@page size: 80mm`.
 *
 * Lo aplica el CSS global en `globals.css` con `@media print` que oculta sidebar,
 * header y todo lo que no sea `.receipt-80mm` para garantizar impresión limpia.
 */
export function Receipt80mm({
  proforma,
  preview = false,
  className,
}: Receipt80mmProps) {
  const branch = getBranchById(proforma.branchId);
  const totalQty = proforma.items.reduce((s, l) => s + l.quantity, 0);
  // Contexto de impresión: decide qué datos fiscales se muestran. Una factura
  // NCF tradicional NUNCA muestra datos e-CF; la proforma no muestra nada fiscal.
  const ctx = getDocumentPrintContext(proforma);
  // Código de seguridad DEMO: derivado determinísticamente del número + total.
  // NO es un código fiscal real (mock/demo no firma con cert real). Solo e-CF.
  const demoSecurityCode = ctx.showSecurityCode
    ? Math.abs(
        [...`${proforma.number}|${proforma.total}`].reduce(
          (h, c) => (h * 31 + c.charCodeAt(0)) | 0,
          7,
        ),
      )
        .toString(16)
        .toUpperCase()
        .padStart(6, "0")
        .slice(0, 6)
    : null;
  const firstPayment = proforma.payments[0];
  const paymentMethod = firstPayment
    ? paymentMethodLabel[firstPayment.method] ?? firstPayment.method
    : "—";

  return (
    <div
      className={cn(
        "receipt-80mm mx-auto bg-white p-3 text-black",
        preview && "shadow-md",
        className,
      )}
      style={{
        width: "80mm",
        maxWidth: "80mm",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
        fontSize: 11,
        lineHeight: 1.35,
      }}
    >
      {/* HEADER */}
      <div className="text-center">
        {mockBusiness.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mockBusiness.logoUrl}
            alt={mockBusiness.commercialName}
            className="mx-auto mb-1 h-12 w-12 object-contain"
          />
        )}
        <div className="text-[14px] font-bold leading-tight">
          {mockBusiness.commercialName.toUpperCase()}
        </div>
        <div className="text-[10px]">
          {branch?.name ?? "Sucursal principal"}
        </div>
        {(branch?.address ?? mockBusiness.address) && (
          <div className="text-[10px] leading-tight">
            {branch?.address ?? mockBusiness.address}
          </div>
        )}
        {(branch?.phone ?? mockBusiness.phone) && (
          <div className="text-[10px]">
            Tel. {branch?.phone ?? mockBusiness.phone}
          </div>
        )}
        <div className="text-[10px]">
          RNC {mockBusiness.rnc} · {mockBusiness.legalName}
        </div>
      </div>

      <Separator />

      {/* TIPO DE COMPROBANTE — según la clase real del documento.
          - e-CF  → "FACTURA e-CF 31/32" + e-NCF.
          - NCF   → "FACTURA" (Consumo/Crédito Fiscal) + NCF, sin datos e-CF.
          - Proforma → "PROFORMA" / "RECIBO DE PAGO", sin datos fiscales. */}
      <div className="text-center font-bold">
        {ctx.isEcf
          ? proforma.ecfType === "31"
            ? "FACTURA e-CF 31"
            : proforma.ecfType === "32"
              ? "FACTURA e-CF 32"
              : "FACTURA ELECTRÓNICA"
          : ctx.isNcf
            ? "FACTURA"
            : proforma.status === "paid"
              ? "RECIBO DE PAGO"
              : "PROFORMA"}
      </div>
      {(ctx.isNcf || ctx.isEcf) && (
        <div className="text-center text-[10px]">
          {proforma.ecfType === "31" ||
          proforma.sequenceType === "credito_fiscal"
            ? "Crédito Fiscal"
            : "Consumo"}
        </div>
      )}
      {/* Número de comprobante: NCF para tradicional, e-NCF para electrónico,
          número interno para proforma. Nunca "e-NCF" en una factura NCF. */}
      {ctx.isProforma ? (
        <div className="text-center">No. {proforma.number}</div>
      ) : (
        <div className="text-center">
          {ctx.numberLabel}: {ctx.fiscalNumber}
        </div>
      )}
      <div className="mt-1">Fecha: {formatDateTime(proforma.createdAt)}</div>
      <div>Cajero: {proforma.cashierName}</div>

      <Separator />

      {/* CLIENTE */}
      <div>
        <div>
          <Bold>Cliente:</Bold> {proforma.customerName || "Walk-in / Consumidor final"}
        </div>
        {proforma.customerPhone && (
          <div>Tel.: {proforma.customerPhone}</div>
        )}
        {proforma.customerDocument && (
          <div>Doc.: {proforma.customerDocument}</div>
        )}
        <div>
          <Bold>Tipo:</Bold>{" "}
          {proforma.billingType ? billingTypeLabel(proforma.billingType) : "Consumo"}
        </div>
      </div>

      <Separator />

      {/* DETALLE */}
      <div className="mb-1 grid grid-cols-[1fr_auto] text-[10px] font-bold">
        <span>DESCRIPCIÓN</span>
        <span className="text-right">TOTAL</span>
      </div>
      {proforma.items.map((it, ix) => (
        <div key={ix} className="mb-1">
          <div className="grid grid-cols-[1fr_auto]">
            <span className="pr-1">
              <Bold>{it.quantity}×</Bold> {it.productName}
            </span>
            <span className="text-right tabular-nums">
              {formatCurrency(it.total)}
            </span>
          </div>
          <div className="text-[10px] opacity-80">
            {formatCurrency(it.unitPrice)} c/u
            {it.discount > 0 && ` · Desc. ${formatCurrency(it.discount)}`}
            {it.lotNumber && ` · Lote ${it.lotNumber}`}
          </div>
        </div>
      ))}

      <Separator />

      {/* RESUMEN */}
      <Row label="Subtotal" value={formatCurrency(proforma.subtotal)} />
      {proforma.discountPercent != null && proforma.discountPercent > 0 && (
        <>
          <Row
            label={`Descuento global (${proforma.discountPercent}%)`}
            value={`-${formatCurrency(proforma.discountAmount ?? 0)}`}
          />
        </>
      )}
      <Row label="ITBIS" value={formatCurrency(proforma.itbis)} />
      <div className="mt-1 grid grid-cols-[1fr_auto] text-[13px] font-bold">
        <span>TOTAL</span>
        <span className="text-right tabular-nums">
          {formatCurrency(proforma.total)}
        </span>
      </div>

      <Separator />

      {/* PAGO */}
      <Row label="Pago" value={paymentMethod} />
      {proforma.amountReceived != null && (
        <Row
          label="Recibido"
          value={formatCurrency(proforma.amountReceived)}
        />
      )}
      {proforma.changeAmount != null && proforma.changeAmount > 0 && (
        <Row
          label="Cambio"
          value={formatCurrency(proforma.changeAmount)}
        />
      )}
      {firstPayment?.reference && (
        <Row label="Ref." value={firstPayment.reference} />
      )}

      <Separator />

      {/* e-CF: código de seguridad, fecha de firma y URL de validación (demo).
          SOLO para comprobantes electrónicos e-CF. Una factura NCF tradicional
          NO debe mostrar nada de esto. El QR completo va en el PDF (canónico). */}
      {ctx.showEcf && (
        <>
          <Separator />
          <div className="text-[10px]">
            {ctx.showSecurityCode && (
              <Row label="Código seguridad" value={`${demoSecurityCode} (demo)`} />
            )}
            {ctx.showDigitalSignature && (
              <Row
                label="Fecha firma"
                value={formatDateTime(proforma.createdAt)}
              />
            )}
            {ctx.showDgiiValidation && (
              <div className="mt-1 break-all opacity-80">
                Validar: ecf.dgii.gov.do · e-NCF{" "}
                {ctx.fiscalNumber}
              </div>
            )}
            {ctx.showDeferredNote && (
              <div className="mt-1 opacity-70">
                e-CF emitido en modalidad Envío Diferido; podrá ser consultado
                para su validez fiscal a partir de las veinticuatro (24) horas.
              </div>
            )}
          </div>
        </>
      )}

      <Separator />

      {/* PIE */}
      <div className="text-center text-[10px]">
        <div className="mb-1">{totalQty} artículo(s)</div>
        <div className="font-bold">¡Gracias por su compra!</div>
        {mockBusiness.slogan && (
          <div className="mt-2">
            {mockBusiness.commercialName} · {mockBusiness.slogan}
          </div>
        )}
        {mockBusiness.whatsapp && (
          <div>WhatsApp {mockBusiness.whatsapp}</div>
        )}
        {mockBusiness.email && <div>{mockBusiness.email}</div>}
        {mockBusiness.instagramUrl && <div>@dermalandrd</div>}
        <div className="mt-2 text-[9px] opacity-70">
          {ctx.isProforma
            ? "Esta proforma no tiene validez fiscal hasta ser facturada."
            : ctx.isEcf && !ctx.isDemo
              ? "Comprobante fiscal electrónico (e-CF) generado."
              : ctx.showFiscalDemoNote
                ? "Documento generado en ambiente demo. No corresponde a emisión fiscal real."
                : null}
        </div>
      </div>
    </div>
  );
}

function Separator() {
  return (
    <div className="my-2 border-t border-dashed border-black/60" aria-hidden />
  );
}

function Bold({ children }: { children: React.ReactNode }) {
  return <span className="font-bold">{children}</span>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto]">
      <span>{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}
