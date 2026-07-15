"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, Skeleton, Table, THead, TBody, TR, TH, TD } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { SearchInput } from "@/components/ui/search-input";
import { StatCard } from "@/components/ui/stat-card";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { Coins, ReceiptText } from "lucide-react";
import { METHOD_LABEL } from "@/features/receivables/components";
import { arApi, money, type CollectionHistoryRow } from "@/features/receivables/receivables-client";

function fechaHora(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("es-DO")} ${d.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Historial de cobros y pagos parciales. Inmutable: los pagos nunca se
 * eliminan; cada fila guarda el saldo anterior y el saldo nuevo.
 */
export default function HistorialPage() {
  const [rows, setRows] = React.useState<CollectionHistoryRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    arApi.history().then(setRows).catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, []);

  const filtered = (rows ?? []).filter((r) => {
    if (!q.trim()) return true;
    const t = q.trim().toLowerCase();
    return (
      r.number.toLowerCase().includes(t) ||
      r.customerName.toLowerCase().includes(t) ||
      r.userName.toLowerCase().includes(t)
    );
  });
  const pag = usePagination(filtered, { resetKey: q });
  const total = filtered.reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <PageHeader
        title="Historial de cobros"
        description="Pagos totales y parciales registrados — historial permanente."
        breadcrumbs={[{ label: "Cuentas por cobrar" }, { label: "Historial" }]}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Cobros registrados" value={filtered.length} icon={ReceiptText} />
        <StatCard label="Monto cobrado" value={money(total)} icon={Coins} tone="success" />
      </div>

      <FilterBar className="mb-4">
        <SearchInput
          placeholder="Buscar por factura, cliente o usuario…"
          containerClassName="flex-1 min-w-[240px]"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </FilterBar>

      {!rows && !error && <Skeleton className="h-64 rounded-xl" />}
      {error && <Card><CardContent className="py-6 text-sm text-rose-700">{error}</CardContent></Card>}

      {rows && (filtered.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="Sin cobros registrados"
          description="Cuando registres cobros de ventas a crédito, quedarán aquí para siempre."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Fecha y hora</TH>
                    <TH>Factura</TH>
                    <TH>Cliente</TH>
                    <TH>Método</TH>
                    <TH>Referencia</TH>
                    <TH>Usuario</TH>
                    <TH className="text-right">Saldo anterior</TH>
                    <TH className="text-right">Monto</TH>
                    <TH className="text-right">Saldo nuevo</TH>
                  </TR>
                </THead>
                <TBody>
                  {pag.pageItems.map((r) => (
                    <TR key={r.id}>
                      <TD className="text-xs">{fechaHora(r.createdAt)}</TD>
                      <TD className="font-mono text-xs">{r.number}</TD>
                      <TD className="text-sm">{r.customerName}</TD>
                      <TD className="text-xs">{METHOD_LABEL[r.method] ?? r.method}</TD>
                      <TD className="max-w-48 truncate text-xs opacity-70">{r.reference ?? "—"}</TD>
                      <TD className="text-xs opacity-70">{r.userName}</TD>
                      <TD className="text-right tabular-nums opacity-70">{money(r.balanceBefore)}</TD>
                      <TD className="text-right font-medium tabular-nums text-emerald-700">{money(r.amount)}</TD>
                      <TD className="text-right tabular-nums">{money(r.balanceAfter)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <DataPagination
              page={pag.page}
              pageSize={pag.pageSize}
              total={pag.total}
              onPageChange={pag.setPage}
              onPageSizeChange={pag.setPageSize}
            />
          </CardContent>
        </Card>
      ))}
    </>
  );
}
