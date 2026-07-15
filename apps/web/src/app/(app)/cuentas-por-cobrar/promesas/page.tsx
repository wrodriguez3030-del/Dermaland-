"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Button, Card, CardContent, Skeleton, Table, THead, TBody, TR, TH, TD } from "@/components/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { CalendarClock, Check, X } from "lucide-react";
import { todayRD } from "@/features/receivables/aging";
import { arApi, fecha, money, type PromiseRow } from "@/features/receivables/receivables-client";

const STATUS_LABEL: Record<PromiseRow["status"], string> = {
  pending: "Pendiente",
  kept: "Cumplida",
  broken: "Incumplida",
};
const STATUS_TONE: Record<PromiseRow["status"], "warning" | "success" | "danger"> = {
  pending: "warning",
  kept: "success",
  broken: "danger",
};

/** Promesas de pago con alerta automática al llegar la fecha comprometida. */
export default function PromesasPage() {
  const toast = useToast();
  const [rows, setRows] = React.useState<PromiseRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    arApi.promises().then(setRows).catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, []);
  React.useEffect(load, [load]);

  const hoy = todayRD();
  const vencenHoy = (rows ?? []).filter((p) => p.status === "pending" && p.promisedDate <= hoy);

  async function mark(p: PromiseRow, status: "kept" | "broken") {
    try {
      await arApi.updatePromise(p.id, status);
      toast.success(status === "kept" ? "Promesa marcada como cumplida." : "Promesa marcada como incumplida.");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar.");
    }
  }

  return (
    <>
      <PageHeader
        title="Promesas de pago"
        description="Compromisos de pago registrados en gestión de cobranza."
        breadcrumbs={[{ label: "Cuentas por cobrar" }, { label: "Promesas de pago" }]}
      />

      {vencenHoy.length > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardContent className="flex items-center gap-2 py-3 text-sm text-amber-900">
            <CalendarClock className="h-4 w-4 shrink-0" />
            <span>
              <strong>{vencenHoy.length}</strong> promesa(s) llegaron a su fecha comprometida — da seguimiento y
              márcalas como cumplidas o incumplidas.
            </span>
          </CardContent>
        </Card>
      )}

      {!rows && !error && <Skeleton className="h-64 rounded-xl" />}
      {error && <Card><CardContent className="py-6 text-sm text-rose-700">{error}</CardContent></Card>}

      {rows && (rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Sin promesas registradas"
          description="Registra promesas desde Clientes con mora o Estados de cuenta."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Cliente</TH>
                    <TH>Fecha comprometida</TH>
                    <TH className="text-right">Monto</TH>
                    <TH>Observaciones</TH>
                    <TH>Registrada por</TH>
                    <TH>Estado</TH>
                    <TH className="pr-4 text-right">Acciones</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((p) => {
                    const dueToday = p.status === "pending" && p.promisedDate <= hoy;
                    return (
                      <TR key={p.id} className={dueToday ? "bg-amber-50/60" : undefined}>
                        <TD className="text-sm font-medium">{p.clientName}</TD>
                        <TD className="text-xs">
                          {fecha(p.promisedDate)}
                          {dueToday && <span className="ml-1 text-amber-700">• hoy</span>}
                        </TD>
                        <TD className="text-right tabular-nums">{money(p.amount)}</TD>
                        <TD className="max-w-56 truncate text-xs opacity-70">{p.notes ?? "—"}</TD>
                        <TD className="text-xs opacity-70">{p.createdByName ?? "—"}</TD>
                        <TD><Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge></TD>
                        <TD className="pr-4">
                          {p.status === "pending" && (
                            <div className="flex justify-end gap-1.5">
                              <Button size="sm" variant="outline" onClick={() => mark(p, "kept")} title="Cumplida">
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => mark(p, "broken")} title="Incumplida">
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
