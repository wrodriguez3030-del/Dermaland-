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
import { Plus, Wallet, Coins, Ban, X } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { getBranchById } from "@/lib/mock-data/tenancy";
import { useActiveBranches } from "@/features/tenancy/branch-store";
import {
  useExpenses,
  voidExpenseAnywhere,
  deleteExpenseAnywhere,
  EXPENSE_CATEGORIES,
  type Expense,
} from "@/features/purchases/compras-store";
import { ExpenseModal } from "@/features/purchases/compras-modals";

const methodLabel: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  cheque: "Cheque",
  otro: "Otro",
};

export function ExpensesView({ petty }: { petty: boolean }) {
  const toast = useToast();
  const activeBranches = useActiveBranches();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [branch, setBranch] = React.useState("all");

  const all = useExpenses(petty);
  const rows = all.filter((e) => {
    if (category !== "all" && e.category !== category) return false;
    if (branch !== "all" && e.branchId !== branch) return false;
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      if (!e.concept.toLowerCase().includes(t) && !e.payee.toLowerCase().includes(t))
        return false;
    }
    return true;
  });
  const hasFilters = q.trim() !== "" || category !== "all" || branch !== "all";
  const totalPeriodo = rows
    .filter((e) => e.status !== "anulado")
    .reduce((s, e) => s + e.amount, 0);

  const ref = (e: Expense) =>
    e.last4 ? `····${e.last4}` : e.reference ?? "—";

  return (
    <>
      <PageHeader
        title={petty ? "Gastos menores" : "Pagos / gastos"}
        description={
          petty
            ? "Caja chica: transporte, mensajería, materiales menores, etc."
            : "Gastos generales del negocio y pagos a proveedores."
        }
        breadcrumbs={[
          { label: "Compras" },
          { label: petty ? "Gastos menores" : "Pagos / gastos" },
        ]}
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> {petty ? "Nuevo gasto menor" : "Nuevo gasto"}
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total del período" value={formatCurrency(totalPeriodo)} icon={Coins} tone="primary" />
        <StatCard label="Registros" value={rows.length} icon={Wallet} />
        <StatCard label="Categorías" value={new Set(rows.map((e) => e.category)).size} icon={Wallet} />
      </div>

      <FilterBar className="mb-4">
        <SearchInput
          placeholder="Buscar por concepto o beneficiario…"
          containerClassName="flex-1 min-w-[220px]"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">Todas las categorías</option>
          {EXPENSE_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
        </Select>
        <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="all">Todas las sucursales</option>
          {activeBranches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(""); setCategory("all"); setBranch("all"); }}>
            <X className="h-4 w-4" /> Limpiar filtros
          </Button>
        )}
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={petty ? "Sin gastos menores" : "Sin gastos registrados"}
          description="Registra el primero con el botón de arriba."
          action={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nuevo</Button>}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Categoría</TH>
                  <TH>{petty ? "Responsable" : "Beneficiario"}</TH>
                  <TH>Concepto</TH>
                  <TH>Método</TH>
                  <TH>Ref. / ····4</TH>
                  <TH className="text-right">Monto</TH>
                  <TH>Estado</TH>
                  <TH className="text-right pr-4">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((e) => (
                  <TR key={e.id}>
                    <TD className="text-xs">{formatDate(e.date)}</TD>
                    <TD className="text-sm">{e.category}</TD>
                    <TD className="text-sm">{petty ? e.responsible ?? e.payee : e.payee}</TD>
                    <TD className="text-sm">{e.concept}</TD>
                    <TD><Badge tone="info">{methodLabel[e.method] ?? e.method}</Badge></TD>
                    <TD className="font-mono text-xs">{ref(e)}</TD>
                    <TD className="text-right tabular-nums font-medium">{formatCurrency(e.amount)}</TD>
                    <TD>
                      <Badge tone={e.status === "anulado" ? "neutral" : "success"}>
                        {e.status}
                      </Badge>
                    </TD>
                    <TD className="pr-4">
                      <RowActions
                        canView={false}
                        canEdit={false}
                        onDelete={async () => {
                          const r = await deleteExpenseAnywhere(e.id);
                          if (!r.ok) toast.error(r.error);
                          else toast.success("Gasto eliminado.");
                        }}
                        entityName={e.concept}
                        customActions={[
                          {
                            label: "Anular",
                            icon: Ban,
                            destructive: true,
                            disabled: e.status === "anulado",
                            disabledReason: "Ya está anulado.",
                            onClick: async () => {
                              const r = await voidExpenseAnywhere(e.id);
                              if (!r.ok) toast.error(r.error);
                              else toast.success("Gasto anulado.");
                            },
                            confirm: {
                              title: "Anular gasto",
                              message: `¿Anular "${e.concept}"? Se conserva en el historial.`,
                            },
                          },
                        ]}
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ExpenseModal open={open} onClose={() => setOpen(false)} petty={petty} />
      <toast.Toast />
    </>
  );
}
