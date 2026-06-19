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
import { RowActions } from "@/components/ui/row-actions";
import { Pencil, Printer, Send, Trash2 } from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { useCashSessionHistory } from "@/features/sales/cash-session-store";

/**
 * Historial de caja.
 *
 * En modo `supabase` fetcha desde /api/cash?history=1 (RLS business_id).
 * En modo `mock` carga el seed de mockCashRegisterSessions.
 */
export default function HistorialCajaPage() {
  const { sessions, loading, error } = useCashSessionHistory();

  return (
    <>
      <PageHeader
        title="Historial de caja"
        description="Sesiones abiertas y cerradas. Toda apertura, cierre y diferencia queda en auditoría."
        breadcrumbs={[{ label: "Caja", href: "/caja" }, { label: "Historial" }]}
      />
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-sm opacity-60">Cargando historial…</div>
          ) : error ? (
            <div className="p-6 text-center text-sm text-rose-600">{error}</div>
          ) : sessions.length === 0 ? (
            <div className="p-6 text-center text-sm opacity-60">
              No hay sesiones de caja registradas.
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Sesión</TH>
                  <TH>Estado</TH>
                  <TH>Cajero</TH>
                  <TH>Apertura</TH>
                  <TH>Cierre</TH>
                  <TH className="text-right">Esperado</TH>
                  <TH className="text-right">Contado</TH>
                  <TH className="text-right">Diferencia</TH>
                  <TH className="text-right pr-4">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {sessions.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-mono text-xs">{s.sessionNumber}</TD>
                    <TD>
                      <Badge tone={s.status === "open" ? "info" : "neutral"}>
                        {s.status === "open" ? "Abierta" : "Cerrada"}
                      </Badge>
                    </TD>
                    <TD className="text-sm">{s.cashierName}</TD>
                    <TD className="text-xs">{formatDateTime(s.openedAt)}</TD>
                    <TD className="text-xs">
                      {s.closedAt ? formatDateTime(s.closedAt) : "—"}
                    </TD>
                    <TD className="text-right tabular-nums">{formatCurrency(s.expectedCash)}</TD>
                    <TD className="text-right tabular-nums">
                      {s.countedCash != null ? formatCurrency(s.countedCash) : "—"}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {s.difference != null ? (
                        <span className={s.difference < 0 ? "text-rose-700" : "text-emerald-700"}>
                          {formatCurrency(s.difference)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD className="pr-4">
                      <RowActions
                        viewHref={`/caja/cierre/${s.id}`}
                        canEdit={false}
                        canDelete={false}
                        customActions={[
                          {
                            label: "Editar",
                            icon: Pencil,
                            disabled: s.status !== "open",
                            disabledReason:
                              "Este cierre ya fue cerrado y no puede editarse.",
                            href: s.status === "open" ? `/caja/cierre/${s.id}` : undefined,
                          },
                          {
                            label: "Imprimir cierre",
                            icon: Printer,
                            disabled: s.status === "open",
                            disabledReason: "El cierre aún está abierto.",
                            href:
                              s.status !== "open" ? `/caja/cierre/${s.id}` : undefined,
                          },
                          {
                            label: "Enviar resumen",
                            icon: Send,
                            disabled: s.status === "open",
                            disabledReason:
                              "Disponible al cerrar la sesión, desde el detalle del cierre.",
                            href:
                              s.status !== "open" ? `/caja/cierre/${s.id}` : undefined,
                          },
                          {
                            label: "Eliminar",
                            icon: Trash2,
                            disabled: true,
                            disabledReason:
                              "No se puede eliminar porque tiene movimientos asociados.",
                          },
                        ]}
                      />
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
