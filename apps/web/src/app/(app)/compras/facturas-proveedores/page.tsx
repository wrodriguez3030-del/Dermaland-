"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Select,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { SearchInput } from "@/components/ui/search-input";
import { StatCard } from "@/components/ui/stat-card";
import { RowActions } from "@/components/ui/row-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { FileText, Plus, Coins, Wallet, Ban, X } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { getBranchById } from "@/lib/mock-data/tenancy";
import {
  useInvoices,
  comprasSummary,
  registerPaymentAnywhere,
  voidInvoiceAnywhere,
  deleteInvoiceAnywhere,
  type InvoiceStatus,
} from "@/features/purchases/compras-store";
import { InvoiceModal } from "@/features/purchases/compras-modals";

const statusTone: Record<InvoiceStatus, "success" | "warning" | "info" | "danger" | "neutral"> = {
  borrador: "neutral",
  pendiente: "info",
  parcial: "warning",
  pagada: "success",
  vencida: "danger",
  anulada: "danger",
};

export default function FacturasProveedoresPage() {
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("all");

  const invoices = useInvoices();
  const summary = comprasSummary();
  const rows = invoices.filter((i) => {
    if (status !== "all" && i.status !== status) return false;
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      if (!i.number.toLowerCase().includes(t) && !i.supplierName.toLowerCase().includes(t))
        return false;
    }
    return true;
  });
  const hasFilters = q.trim() !== "" || status !== "all";

  return (
    <>
      <PageHeader
        title="Facturas de proveedores"
        description="Registra y controla las compras y cuentas por pagar."
        breadcrumbs={[{ label: "Compras" }, { label: "Facturas de proveedores" }]}
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Nueva factura
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Compras del mes" value={formatCurrency(summary.comprasMes)} icon={Coins} tone="primary" />
        <StatCard label="Cuentas por pagar" value={formatCurrency(summary.cuentasPorPagar)} icon={Wallet} tone="warning" />
        <StatCard label="Facturas" value={invoices.length} icon={FileText} />
      </div>

      <FilterBar className="mb-4">
        <SearchInput
          placeholder="Buscar por número o proveedor…"
          containerClassName="flex-1 min-w-[240px]"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="parcial">Parcial</option>
          <option value="pagada">Pagada</option>
          <option value="anulada">Anulada</option>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(""); setStatus("all"); }}>
            <X className="h-4 w-4" /> Limpiar filtros
          </Button>
        )}
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin facturas de proveedor"
          description="Registra tu primera compra con “Nueva factura”."
          action={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nueva factura</Button>}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Factura</TH>
                  <TH>Proveedor</TH>
                  <TH>Sucursal</TH>
                  <TH>Emisión</TH>
                  <TH className="text-right">Total</TH>
                  <TH className="text-right">Pagado</TH>
                  <TH>Estado</TH>
                  <TH className="text-right pr-4">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((inv) => {
                  const pending = inv.status === "pendiente" || inv.status === "parcial";
                  return (
                    <TR key={inv.id}>
                      <TD className="font-mono text-xs">{inv.number}</TD>
                      <TD className="text-sm">{inv.supplierName}</TD>
                      <TD className="text-xs opacity-70">{getBranchById(inv.branchId)?.name ?? inv.branchId}</TD>
                      <TD className="text-xs">{formatDate(inv.issueDate)}</TD>
                      <TD className="text-right tabular-nums font-medium">{formatCurrency(inv.total)}</TD>
                      <TD className="text-right tabular-nums">{formatCurrency(inv.paid)}</TD>
                      <TD><Badge tone={statusTone[inv.status]}>{inv.status}</Badge></TD>
                      <TD className="pr-4">
                        <RowActions
                          canView={false}
                          canEdit={false}
                          onDelete={async () => {
                            const r = await deleteInvoiceAnywhere(inv.id);
                            if (!r.ok) toast.error(r.error);
                            else toast.success("Factura eliminada.");
                          }}
                          entityName={inv.number}
                          customActions={[
                            {
                              label: "Registrar pago",
                              icon: Wallet,
                              disabled: !pending,
                              disabledReason:
                                inv.status === "pagada" ? "Factura pagada." : "No aplica.",
                              onClick: async () => {
                                const r = await registerPaymentAnywhere(inv.id, inv.total - inv.paid, "transferencia");
                                if (!r.ok) toast.error(r.error);
                                else toast.success("Pago registrado.");
                              },
                              confirm: {
                                title: "Registrar pago",
                                message: `¿Registrar el pago de ${formatCurrency(inv.total - inv.paid)} de la factura ${inv.number}?`,
                              },
                            },
                            {
                              label: "Anular",
                              icon: Ban,
                              destructive: true,
                              disabled: inv.status === "anulada",
                              disabledReason: "Ya está anulada.",
                              onClick: async () => {
                                const r = await voidInvoiceAnywhere(inv.id);
                                if (!r.ok) toast.error(r.error);
                                else toast.success("Factura anulada.");
                              },
                              confirm: {
                                title: "Anular factura",
                                message: `¿Anular la factura ${inv.number}? Se conserva el historial.`,
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

      <InvoiceModal open={open} onClose={() => setOpen(false)} />
      <toast.Toast />
    </>
  );
}
