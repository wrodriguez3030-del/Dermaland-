"use client";

import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Card,
  CardContent,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { Ban, AlertTriangle } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { useToast } from "@/components/ui/toast";
import { mockElectronicInvoices } from "@/lib/mock-data/integrations";
import { useBillingSettings } from "@/features/billing/billing-settings-store";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

const envTone: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  mock: "neutral",
  demo: "neutral",
  testecf: "warning",
  certecf: "warning",
  produccion: "success",
};

const statusTone: Record<string, "success" | "warning" | "info" | "danger" | "neutral"> = {
  draft: "neutral",
  signed: "info",
  submitted: "warning",
  in_process: "warning",
  accepted: "success",
  accepted_conditional: "success",
  rejected: "danger",
  cancelled: "neutral",
  error: "danger",
};

export default function FacturasElectronicasPage() {
  const toast = useToast();
  const settings = useBillingSettings();
  const env = settings.ecfEnvironment;
  return (
    <>
      <PageHeader
        title="Facturas electrónicas (e-CF)"
        description="Comprobantes emitidos. Cada uno lleva XML firmado, TrackID, código QR y representación impresa."
        breadcrumbs={[{ label: "DGII", href: "/dgii" }, { label: "Facturas" }]}
      />
      <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div className="text-sm text-amber-900">
            <strong>Listado MOCK / DEMO — no fiscal.</strong> Los e-CF
            mostrados son ejemplos sintéticos. La acción <em>Anular</em>{" "}
            solo dispara un toast — no consume secuencia ni envía Nota
            de Crédito a DGII. La emisión y anulación reales quedan
            bloqueadas hasta Fase G (envío) / Fase H (consulta).
          </div>
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>e-NCF</TH>
                <TH>Tipo</TH>
                <TH>Cliente</TH>
                <TH className="text-right">Subtotal</TH>
                <TH className="text-right">ITBIS</TH>
                <TH className="text-right">Total</TH>
                <TH>Estado</TH>
                <TH>Ambiente</TH>
                <TH>TrackID</TH>
                <TH>Emitida</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {mockElectronicInvoices.map((i) => {
                const cancellable =
                  i.status === "accepted" || i.status === "submitted";
                return (
                  <TR key={i.id}>
                    <TD className="font-mono text-xs font-medium">{i.ecfNumber}</TD>
                    <TD className="text-xs">{i.ecfType}</TD>
                    <TD className="text-sm">{i.customerName}</TD>
                    <TD className="text-right tabular-nums">{formatCurrency(i.amount)}</TD>
                    <TD className="text-right tabular-nums">{formatCurrency(i.itbis)}</TD>
                    <TD className="text-right tabular-nums font-medium">
                      {formatCurrency(i.total)}
                    </TD>
                    <TD>
                      <Badge tone={statusTone[i.status] ?? "neutral"}>{i.status}</Badge>
                    </TD>
                    <TD>
                      <Badge tone={envTone[env] ?? "neutral"}>{env}</Badge>
                    </TD>
                    <TD className="font-mono text-[10px] opacity-70">
                      {i.trackId ?? "—"}
                    </TD>
                    <TD className="text-xs">{formatDateTime(i.createdAt)}</TD>
                    <TD className="pr-4">
                      <RowActions
                        viewHref={`/dgii/facturas/${i.id}`}
                        canEdit={false}
                        canDelete={false}
                        customActions={
                          cancellable
                            ? [
                                {
                                  label: "Anular",
                                  icon: Ban,
                                  destructive: true,
                                  onClick: () =>
                                    toast.success(
                                      `e-CF ${i.ecfNumber} anulada — generará Nota de Crédito automática.`,
                                    ),
                                  confirm: {
                                    title: "Anular e-CF",
                                    message: `¿Anular ${i.ecfNumber}? Generará Nota de Crédito (e-CF tipo 34) por el monto total.`,
                                  },
                                },
                              ]
                            : []
                        }
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <toast.Toast />
    </>
  );
}
