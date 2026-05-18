"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  FileText,
  XCircle,
} from "lucide-react";
import { useCashClosing } from "@/features/sales/cash-closing-store";
import { useProformas } from "@/features/sales/proforma-store";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

/**
 * Resumen post-cierre (UI mock).
 *
 * Muestra el cierre confirmado con detalle de proformas convertidas a
 * e-CF DEMO. Cada proforma seleccionada lleva un link a
 * `/dgii/preview/[id]` que genera el e-CF DEMO en runtime.
 */

export default function CierreResumenPage() {
  const params = useParams<{ id: string }>();
  const closing = useCashClosing(params.id);
  const proformas = useProformas();

  if (!closing) {
    return (
      <>
        <PageHeader
          title="Cierre no encontrado"
          description="El cierre solicitado no existe en este navegador."
          breadcrumbs={[
            { label: "Caja", href: "/caja" },
            { label: "Cierre" },
            { label: params.id },
          ]}
        />
        <Card>
          <CardContent>
            <p className="text-sm opacity-80">
              Los cierres demo viven solo en el almacenamiento local de este
              dispositivo (mock, no persistido).
            </p>
            <div className="mt-3">
              <Link href="/caja">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4" /> Volver a caja
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  const selected = closing.selectedProformaIds
    .map((id) => proformas.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const unselected = closing.unselectedProformaIds
    .map((id) => proformas.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <>
      <PageHeader
        title={`Cierre ${closing.closingNumber}`}
        description={`Cerrado ${formatDateTime(closing.closedAt)} · ${closing.cashierName}`}
        breadcrumbs={[
          { label: "Caja", href: "/caja" },
          { label: "Cierre" },
          { label: closing.closingNumber },
        ]}
        actions={
          <>
            <Link href="/caja/historial">
              <Button variant="outline" size="sm">
                Historial
              </Button>
            </Link>
            <Link href="/caja">
              <Button size="sm">
                <ArrowLeft className="h-4 w-4" /> Volver a caja
              </Button>
            </Link>
          </>
        }
      />

      <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div>
            <h3 className="text-sm font-semibold text-amber-900">
              Cierre confirmado en MODO MOCK. No se envió ningún e-CF a DGII.
            </h3>
            <p className="mt-1 text-sm text-amber-900">
              Las proformas seleccionadas para "conversión a e-CF" tienen un
              link a la vista previa demo que genera el comprobante en
              runtime con cert dummy. <strong>Estas operaciones no tienen
              validez fiscal.</strong>
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total turno" value={formatCurrency(closing.totals.general)} bold />
        <Stat label="% aplicado" value={`${closing.appliedPercentage}%`} bold />
        <Stat
          label="Monto convertido"
          value={formatCurrency(closing.actualAmount)}
        />
        <Stat
          label="Proformas convertidas"
          value={`${selected.length} / ${closing.proformasPending.count}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Convertidas a e-CF DEMO ({selected.length})
            </CardTitle>
            <p className="mt-1 text-xs opacity-60">
              Cada proforma genera un e-CF demo en runtime. Click "Vista previa"
              para ver el PDF y descargas.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {selected.length === 0 ? (
              <div className="p-6 text-center text-sm opacity-60">
                No se seleccionaron proformas para conversión.
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Proforma</TH>
                    <TH>Cliente</TH>
                    <TH>Método</TH>
                    <TH className="text-right">Total</TH>
                    <TH className="text-right pr-4">Acción</TH>
                  </TR>
                </THead>
                <TBody>
                  {selected.map((p) => (
                    <TR key={p.id}>
                      <TD className="font-mono text-xs">{p.number}</TD>
                      <TD className="text-sm">{p.customerName}</TD>
                      <TD className="text-xs">
                        {p.payments[0]?.method ?? "—"}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {formatCurrency(p.total)}
                      </TD>
                      <TD className="pr-4 text-right">
                        <Link
                          href={`/dgii/preview/${p.id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--brand-primary)] hover:underline"
                        >
                          <FileText className="h-3 w-3" /> Vista previa
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Detalle</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Número">{closing.closingNumber}</Row>
              <Row label="Cerrado por">{closing.cashierName}</Row>
              <Row label="Fecha/hora">{formatDateTime(closing.closedAt)}</Row>
              <div className="mt-2 border-t border-black/5 pt-2">
                <Row label="Pendiente total">
                  {formatCurrency(closing.proformasPending.totalAmount)}
                </Row>
                <Row label="Objetivo">
                  {formatCurrency(closing.targetAmount)}
                </Row>
                <Row label="Convertido">
                  <span className="font-semibold">
                    {formatCurrency(closing.actualAmount)}
                  </span>
                </Row>
                <Row label="Sin convertir">
                  {formatCurrency(
                    closing.proformasPending.totalAmount -
                      closing.actualAmount,
                  )}
                </Row>
              </div>
              {closing.comment && (
                <div className="mt-2 border-t border-black/5 pt-2">
                  <div className="text-[10px] uppercase tracking-wider opacity-60">
                    Comentario
                  </div>
                  <p className="mt-1 italic">{closing.comment}</p>
                </div>
              )}
              <div className="mt-2">
                <Badge tone="neutral">MOCK · cierre no fiscal</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {unselected.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-rose-600" />
              No convertidas — quedan pendientes ({unselected.length})
            </CardTitle>
            <p className="mt-1 text-xs opacity-60">
              Estas proformas no se incluyeron en la conversión del cierre.
              Quedan disponibles para un cierre futuro.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Proforma</TH>
                  <TH>Cliente</TH>
                  <TH>Método</TH>
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {unselected.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono text-xs">{p.number}</TD>
                    <TD className="text-sm">{p.customerName}</TD>
                    <TD className="text-xs">{p.payments[0]?.method ?? "—"}</TD>
                    <TD className="text-right tabular-nums">
                      {formatCurrency(p.total)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="rounded-xl border border-black/5 bg-white p-4">
      <div className="text-[10px] uppercase tracking-wider opacity-60">
        {label}
      </div>
      <div
        className={`mt-1 tabular-nums ${
          bold ? "text-2xl font-bold" : "text-lg font-medium"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="opacity-70">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}
