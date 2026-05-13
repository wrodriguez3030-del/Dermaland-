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
import { Ban } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { useToast } from "@/components/ui/toast";
import { mockElectronicInvoices } from "@/lib/mock-data/integrations";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

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
  return (
    <>
      <PageHeader
        title="Facturas electrónicas (e-CF)"
        description="Comprobantes emitidos. Cada uno lleva XML firmado, TrackID, código QR y representación impresa."
        breadcrumbs={[{ label: "DGII", href: "/dgii" }, { label: "Facturas" }]}
      />
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
