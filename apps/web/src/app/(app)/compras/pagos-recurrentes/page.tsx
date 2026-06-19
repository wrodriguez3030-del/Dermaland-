"use client";

import * as React from "react";
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
import { StatCard } from "@/components/ui/stat-card";
import { RowActions } from "@/components/ui/row-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { Plus, Repeat, RefreshCw, Coins } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { getBranchById } from "@/lib/mock-data/tenancy";
import {
  useRecurring,
  setRecurringActive,
  generateRecurringRun,
  deleteRecurringAnywhere,
  comprasSummary,
} from "@/features/purchases/compras-store";
import { RecurringModal } from "@/features/purchases/compras-modals";

const freqLabel: Record<string, string> = {
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
  trimestral: "Trimestral",
  anual: "Anual",
};

export default function PagosRecurrentesPage() {
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const rows = useRecurring();
  const summary = comprasSummary();
  const totalMensual = rows
    .filter((r) => r.status === "active" && r.frequency === "mensual")
    .reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <PageHeader
        title="Pagos recurrentes"
        description="Gastos que se repiten: alquiler, internet, energía, software, etc."
        breadcrumbs={[{ label: "Compras" }, { label: "Pagos recurrentes" }]}
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo pago recurrente
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Recurrentes activos" value={summary.recurrentesActivos} icon={Repeat} tone="primary" />
        <StatCard label="Mensual estimado" value={formatCurrency(totalMensual)} icon={Coins} />
        <StatCard label="Total configurados" value={rows.length} icon={Repeat} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Sin pagos recurrentes"
          description="Crea el primero (alquiler, internet, software…) con el botón de arriba."
          action={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nuevo pago recurrente</Button>}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Nombre</TH>
                  <TH>Categoría</TH>
                  <TH>Sucursal</TH>
                  <TH>Frecuencia</TH>
                  <TH className="text-right">Monto</TH>
                  <TH className="text-right">Pagos</TH>
                  <TH>Estado</TH>
                  <TH className="text-right pr-4">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const active = r.status === "active";
                  return (
                    <TR key={r.id}>
                      <TD>
                        <div className="font-medium">{r.name}</div>
                        {r.supplier && <div className="text-xs opacity-60">{r.supplier}</div>}
                      </TD>
                      <TD className="text-sm">{r.category}</TD>
                      <TD className="text-xs opacity-70">{getBranchById(r.branchId)?.name ?? r.branchId}</TD>
                      <TD className="text-sm">{freqLabel[r.frequency] ?? r.frequency}</TD>
                      <TD className="text-right tabular-nums font-medium">{formatCurrency(r.amount)}</TD>
                      <TD className="text-right tabular-nums">{r.runs.length}</TD>
                      <TD><Badge tone={active ? "success" : "neutral"}>{active ? "Activo" : "Inactivo"}</Badge></TD>
                      <TD className="pr-4">
                        <RowActions
                          canView={false}
                          canEdit={false}
                          onActivate={active ? undefined : () => { setRecurringActive(r.id, true); toast.success(`${r.name} activado.`); }}
                          onDeactivate={active ? () => { setRecurringActive(r.id, false); toast.success(`${r.name} inactivado.`); } : undefined}
                          onDelete={async () => {
                            const res = await deleteRecurringAnywhere(r.id);
                            if (!res.ok) toast.error(res.error);
                            else toast.success("Pago recurrente eliminado.");
                          }}
                          entityName={r.name}
                          customActions={[
                            {
                              label: "Generar pago del período",
                              icon: RefreshCw,
                              disabled: !active,
                              disabledReason: "Está inactivo.",
                              onClick: () => {
                                const res = generateRecurringRun(r.id);
                                if (!res.ok) toast.error(res.error);
                                else toast.success(`Pago de ${r.name} generado.`);
                              },
                              confirm: {
                                title: "Generar pago",
                                message: `¿Generar el gasto del período para ${r.name} por ${formatCurrency(r.amount)}?`,
                              },
                            },
                          ]}
                        />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <RecurringModal open={open} onClose={() => setOpen(false)} />
      <toast.Toast />
    </>
  );
}
