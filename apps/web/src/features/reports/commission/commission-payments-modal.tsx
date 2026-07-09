"use client";

import * as React from "react";
import { Badge, Table, THead, TBody, TR, TH, TD } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { useCommissionBatches } from "./commission-batch-store";
import { useCommissionAudit, AUDIT_ACTION_LABEL } from "./commission-audit-store";

const ACTION_TONE = {
  approved: "info",
  paid: "success",
  excluded: "warning",
  included: "neutral",
  batch_created: "primary",
  voided: "danger",
  adjusted: "warning",
} as const;

export function CommissionPaymentsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const batches = useCommissionBatches();
  const audit = useCommissionAudit();

  return (
    <Modal open={open} title="Pagos y auditoría de comisiones" onClose={onClose}>
      <div className="space-y-5 text-sm">
        <section>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-50">
            Lotes de pago
          </div>
          {batches.length === 0 ? (
            <p className="py-3 text-center text-xs opacity-60">
              Aún no se han creado lotes de pago.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Fecha</TH>
                    <TH>Período</TH>
                    <TH>Vendedor</TH>
                    <TH className="text-right">Comisiones</TH>
                    <TH className="text-right">Total</TH>
                    <TH>Estado</TH>
                  </TR>
                </THead>
                <TBody>
                  {batches.map((b) => (
                    <TR key={b.id}>
                      <TD className="text-xs">{formatDateTime(b.createdAt)}</TD>
                      <TD className="text-xs">
                        {b.periodFrom || b.periodTo
                          ? `${b.periodFrom || "inicio"} → ${b.periodTo || "hoy"}`
                          : "Todo"}
                      </TD>
                      <TD className="text-xs">{b.sellerName ?? "Todos"}</TD>
                      <TD className="text-right tabular-nums">{b.comprobantes.length}</TD>
                      <TD className="text-right tabular-nums font-medium">{formatCurrency(b.total)}</TD>
                      <TD>
                        <Badge tone="success">Pagado</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-50">
            Auditoría
          </div>
          {audit.length === 0 ? (
            <p className="py-3 text-center text-xs opacity-60">Sin movimientos registrados.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Fecha</TH>
                    <TH>Acción</TH>
                    <TH className="text-right">Comp.</TH>
                    <TH className="text-right">Monto</TH>
                    <TH>Usuario</TH>
                    <TH>Motivo</TH>
                  </TR>
                </THead>
                <TBody>
                  {audit.map((a) => (
                    <TR key={a.id}>
                      <TD className="text-xs">{formatDateTime(a.at)}</TD>
                      <TD>
                        <Badge tone={ACTION_TONE[a.action]}>{AUDIT_ACTION_LABEL[a.action]}</Badge>
                      </TD>
                      <TD className="text-right tabular-nums text-xs">{a.comprobantes.length}</TD>
                      <TD className="text-right tabular-nums text-xs">
                        {a.amount != null ? formatCurrency(a.amount) : "—"}
                      </TD>
                      <TD className="text-xs">{a.userName}</TD>
                      <TD className="text-xs opacity-70">{a.reason ?? "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
