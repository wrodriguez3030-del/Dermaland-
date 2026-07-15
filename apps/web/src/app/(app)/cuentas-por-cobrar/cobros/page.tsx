"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, Card, CardContent, Select, Skeleton, Table, THead, TBody, TR, TH, TD } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { HandCoins, FileText } from "lucide-react";
import { AgingBadge, CollectModal, usePendingReceivables } from "@/features/receivables/components";
import { fecha, money, type ReceivableRow } from "@/features/receivables/receivables-client";

/**
 * Registrar cobros: pago total, parcial o un pago aplicado a varias facturas.
 * Selecciona las facturas (misma clienta o varias) y registra el cobro.
 */
export default function CobrosPage() {
  const { rows, error, loading, reload } = usePendingReceivables();
  const [q, setQ] = React.useState("");
  const [cliente, setCliente] = React.useState("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [open, setOpen] = React.useState(false);

  const all = rows ?? [];
  const clientes = [...new Set(all.map((r) => r.customerName))].sort();
  const filtered = all.filter((r) => {
    if (cliente !== "all" && r.customerName !== cliente) return false;
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      if (!r.number.toLowerCase().includes(t) && !r.customerName.toLowerCase().includes(t)) return false;
    }
    return true;
  });

  const chosen: ReceivableRow[] = all.filter((r) => selected.has(r.id));
  const totalChosen = chosen.reduce((s, r) => s + r.balance, 0);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader
        title="Cobros"
        description="Registra pagos totales, parciales o aplicados a varias facturas."
        breadcrumbs={[{ label: "Cuentas por cobrar" }, { label: "Cobros" }]}
        actions={
          <Button size="sm" disabled={chosen.length === 0} onClick={() => setOpen(true)}>
            <HandCoins className="h-4 w-4" />
            Cobrar {chosen.length > 0 ? `${chosen.length} factura(s) · ${money(totalChosen)}` : ""}
          </Button>
        }
      />

      <FilterBar className="mb-4">
        <SearchInput
          placeholder="Buscar factura o cliente…"
          containerClassName="flex-1 min-w-[220px]"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={cliente} onChange={(e) => setCliente(e.target.value)}>
          <option value="all">Todos los clientes</option>
          {clientes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      </FilterBar>

      {loading && <Skeleton className="h-64 rounded-xl" />}
      {error && <Card><CardContent className="py-6 text-sm text-rose-700">{error}</CardContent></Card>}

      {!loading && !error && (filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No hay facturas por cobrar"
          description="Cuando exista una venta a crédito con saldo, podrás registrar su cobro aquí."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-10"></TH>
                    <TH>Factura</TH>
                    <TH>Cliente</TH>
                    <TH>Vence</TH>
                    <TH>Estado</TH>
                    <TH className="text-right">Saldo</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((r) => (
                    <TR key={r.id} className="cursor-pointer" onClick={() => toggle(r.id)}>
                      <TD>
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Seleccionar ${r.number}`}
                        />
                      </TD>
                      <TD className="font-mono text-xs">{r.number}</TD>
                      <TD className="text-sm">{r.customerName}</TD>
                      <TD className="text-xs">{fecha(r.dueDate)}</TD>
                      <TD><AgingBadge bucket={r.bucket} /></TD>
                      <TD className="text-right font-medium tabular-nums">{money(r.balance)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}

      <CollectModal
        open={open}
        onClose={() => setOpen(false)}
        invoices={chosen}
        onDone={() => {
          setSelected(new Set());
          reload();
        }}
      />
    </>
  );
}
