"use client";

import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { BillingDgiiWarning } from "@/components/dgii/billing-warning";
import { RotateCcw } from "lucide-react";
import {
  useDgiiLogs,
  clearDgiiLogs,
  DGII_LOG_ACTION_LABEL,
  type DgiiLogStatus,
} from "@/features/billing/dgii-logs-store";
import { formatDateTime } from "@/lib/utils/format";

const STATUS_TONE: Record<DgiiLogStatus, "success" | "warning" | "danger" | "neutral" | "info"> = {
  ok: "success",
  pendiente: "warning",
  rechazado: "danger",
  error: "danger",
  info: "info",
};

/**
 * DGII / Facturación → Logs DGII / Historial.
 * Bitácora del flujo e-CF. En mock/demo todas las entradas son sintéticas.
 */
export default function DgiiLogsPage() {
  const logs = useDgiiLogs();

  return (
    <>
      <PageHeader
        title="Logs DGII / Historial"
        description="Bitácora de acciones del flujo e-CF (generar, firmar, enviar, consultar)."
        breadcrumbs={[
          { label: "DGII / Facturación", href: "/dgii" },
          { label: "Logs DGII / Historial" },
        ]}
        actions={
          <Button size="sm" variant="outline" onClick={() => clearDgiiLogs()}>
            <RotateCcw className="h-4 w-4" /> Restablecer demo
          </Button>
        }
      />

      <BillingDgiiWarning />

      <Card>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="p-6 text-center text-sm opacity-60">
              Sin entradas de log.
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Acción</TH>
                  <TH>e-NCF</TH>
                  <TH>Ambiente</TH>
                  <TH>Estado</TH>
                  <TH>Mensaje</TH>
                  <TH>Modo</TH>
                </TR>
              </THead>
              <TBody>
                {logs.map((log) => (
                  <TR key={log.id}>
                    <TD className="whitespace-nowrap text-xs">
                      {formatDateTime(log.createdAt)}
                    </TD>
                    <TD className="text-xs font-medium">
                      {DGII_LOG_ACTION_LABEL[log.action] ?? log.action}
                    </TD>
                    <TD className="font-mono text-[10px] opacity-70">
                      {log.ecfNumber ?? "—"}
                    </TD>
                    <TD className="text-xs">
                      <Badge tone="neutral">{log.environment}</Badge>
                    </TD>
                    <TD>
                      <Badge tone={STATUS_TONE[log.status] ?? "neutral"}>
                        {log.status}
                      </Badge>
                    </TD>
                    <TD className="text-xs opacity-80">{log.message}</TD>
                    <TD>
                      {log.isMock ? (
                        <Badge tone="neutral">mock</Badge>
                      ) : (
                        <Badge tone="danger">real</Badge>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
