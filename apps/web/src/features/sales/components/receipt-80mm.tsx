"use client";

import * as React from "react";
import type { Proforma } from "@/types";
import { mockBusiness, getBranchById } from "@/lib/mock-data/tenancy";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { billingTypeLabel } from "@/features/customers/billing";
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
        <div className="text-[14px] font-bold leading-tight">
          {mockBusiness.commercialName.toUpperCase()}
        </div>
        <div className="text-[10px]">
          {branch?.name ?? "Sucursal principal"}
        </div>
        {branch?.address && (
          <div className="text-[10px] leading-tight">{branch.address}</div>
        )}
        {branch?.phone && (
          <div className="text-[10px]">Tel. {branch.phone}</div>
        )}
        <div className="text-[10px]">
          RNC {mockBusiness.rnc} · {mockBusiness.legalName}
        </div>
      </div>

      <Separator />

      {/* TIPO DE COMPROBANTE
          - Si la proforma fue resuelta a "invoice" en el POS (campo
            documentKind), mostramos el rótulo de factura con el tipo de
            e-CF correspondiente. Esto es preparación para la integración
            DGII real — hoy aún se persiste como `Proforma` en el store,
            pero el comprobante imprime como factura.
          - Fallback: si la proforma ya fue convertida (status ===
            "converted_to_ecf") o sólo está pagada, etiquetas previas. */}
      <div className="text-center font-bold">
        {proforma.documentKind === "invoice"
          ? proforma.ecfType === "31"
            ? "FACTURA e-CF 31"
            : proforma.ecfType === "32"
              ? "FACTURA e-CF 32"
              : "FACTURA"
          : proforma.status === "converted_to_ecf"
            ? "FACTURA ELECTRÓNICA"
            : proforma.status === "paid"
              ? "RECIBO DE PAGO"
              : "PROFORMA"}
      </div>
      {proforma.documentKind === "invoice" && (
        <div className="text-center text-[10px]">
          {proforma.ecfType === "31" ? "Crédito Fiscal" : "Consumo"}
        </div>
      )}
      <div className="text-center">No. {proforma.number}</div>
      {proforma.ecfNumber && (
        <div className="text-center text-[10px]">e-NCF: {proforma.ecfNumber}</div>
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

      {/* PIE */}
      <div className="text-center text-[10px]">
        <div className="mb-1">{totalQty} artículo(s)</div>
        <div className="font-bold">¡Gracias por su compra!</div>
        <div className="mt-2">DermaLand · Cuidado dermatológico</div>
        {mockBusiness.whatsapp && (
          <div>WhatsApp {mockBusiness.whatsapp}</div>
        )}
        {mockBusiness.instagramUrl && (
          <div>@dermalandrd</div>
        )}
        <div className="mt-2 text-[9px] opacity-70">
          {proforma.status === "converted_to_ecf"
            ? "Comprobante fiscal electrónico (e-CF) generado."
            : "Este documento puede no tener validez fiscal hasta ser convertido a e-CF."}
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
