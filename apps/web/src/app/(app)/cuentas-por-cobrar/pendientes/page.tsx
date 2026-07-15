"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import {
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
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui";
import { Wallet, AlertTriangle, FileText, HandCoins, X } from "lucide-react";
import { AGING_LABEL, AGING_ORDER, computeAging, todayRD, type AgingBucket } from "@/features/receivables/aging";
import { AgingBadge, CollectModal, usePendingReceivables } from "@/features/receivables/components";
import { fecha, money, type ReceivableRow } from "@/features/receivables/receivables-client";

/** Facturas con saldo pendiente: la tabla operativa del módulo. */
export default function PendientesPage() {
  const { rows, error, loading, reload } = usePendingReceivables();
  const [q, setQ] = React.useState("");
  const [bucket, setBucket] = React.useState("all");
  const [branch, setBranch] = React.useState("all");
  const [seller, setSeller] = React.useState("all");
  const [minAmount, setMinAmount] = React.useState("");
  const [toCollect, setToCollect] = React.useState<ReceivableRow[]>([]);

  const all = rows ?? [];
  const branches = [...new Set(all.map((r) => r.branchName))].sort();
  const sellers = [...new Set(all.map((r) => r.sellerName ?? r.cashierName))].sort();

  const filtered = all.filter((r) => {
    if (bucket !== "all" && r.bucket !== bucket) return false;
    if (branch !== "all" && r.branchName !== branch) return false;
    if (seller !== "all" && (r.sellerName ?? r.cashierName) !== seller) return false;
    if (minAmount && r.balance < Number(minAmount)) return false;
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      if (
        !r.number.toLowerCase().includes(t) &&
        !r.customerName.toLowerCase().includes(t) &&
        !(r.ecfNumber ?? "").toLowerCase().includes(t)
      )
        return false;
    }
    return true;
  });
  const hasFilters = q.trim() !== "" || bucket !== "all" || branch !== "all" || seller !== "all" || minAmount !== "";
  const pag = usePagination(filtered, { resetKey: `${q}|${bucket}|${branch}|${seller}|${minAmount}` });
  const aging = computeAging(filtered, todayRD());

  return (
    <>
      <PageHeader
        title="Facturas pendientes"
        description="Ventas a crédito con saldo por cobrar."
        breadcrumbs={[{ label: "Cuentas por cobrar" }, { label: "Facturas pendientes" }]}
        actions={
          <Button size="sm" onClick={() => setToCollect(filtered.slice(0, 20))} disabled={filtered.length === 0}>
            <HandCoins className="h-4 w-4" /> Cobrar…
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Saldo filtrado" value={money(aging.totalAmount)} icon={Wallet} tone="primary" />
        <StatCard label="Facturas" value={aging.totalCount} icon={FileText} />
        <StatCard
          label="Vencido"
          value={money(aging.overdueAmount)}
          hint={`${aging.overdueCount} facturas`}
          icon={AlertTriangle}
          tone={aging.overdueCount > 0 ? "danger" : "default"}
        />
      </div>

      <FilterBar className="mb-4">
        <SearchInput
          placeholder="Buscar por factura, e-CF o cliente…"
          containerClassName="flex-1 min-w-[220px]"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={bucket} onChange={(e) => setBucket(e.target.value)}>
          <option value="all">Todos los estados</option>
          {AGING_ORDER.map((b) => (
            <option key={b} value={b}>{AGING_LABEL[b]}</option>
          ))}
        </Select>
        <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="all">Todas las sucursales</option>
          {branches.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </Select>
        <Select value={seller} onChange={(e) => setSeller(e.target.value)}>
          <option value="all">Todos los vendedores</option>
          {sellers.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <SearchInput
          placeholder="Monto mín."
          containerClassName="w-28"
          value={minAmount}
          onChange={(e) => setMinAmount(e.target.value.replace(/[^\d.]/g, ""))}
        />
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setQ(""); setBucket("all"); setBranch("all"); setSeller("all"); setMinAmount(""); }}
          >
            <X className="h-4 w-4" /> Limpiar
          </Button>
        )}
      </FilterBar>

      {loading && <Skeleton className="h-64 rounded-xl" />}
      {error && <Card><CardContent className="py-6 text-sm text-rose-700">{error}</CardContent></Card>}

      {!loading && !error && (filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={hasFilters ? "Sin resultados con estos filtros" : "No hay facturas pendientes"}
          description={
            hasFilters
              ? "Ajusta los filtros para ver más facturas."
              : "Cuando una venta quede con saldo (venta a crédito), aparecerá aquí automáticamente."
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Factura</TH>
                    <TH>e-CF</TH>
                    <TH>Cliente</TH>
                    <TH>Sucursal</TH>
                    <TH>Vendedor</TH>
                    <TH>Emisión</TH>
                    <TH>Vence</TH>
                    <TH className="text-right">Días créd.</TH>
                    <TH className="text-right">Días venc.</TH>
                    <TH className="text-right">Monto</TH>
                    <TH className="text-right">Saldo</TH>
                    <TH>Estado</TH>
                    <TH className="pr-4 text-right">Acciones</TH>
                  </TR>
                </THead>
                <TBody>
                  {pag.pageItems.map((r) => (
                    <TR key={r.id}>
                      <TD className="font-mono text-xs">{r.number}</TD>
                      <TD className="font-mono text-xs opacity-70">{r.ecfNumber ?? "—"}</TD>
                      <TD className="text-sm">
                        {r.customerId ? (
                          <Link className="hover:underline" href={`/cuentas-por-cobrar/estados-de-cuenta?cliente=${r.customerId}`}>
                            {r.customerName}
                          </Link>
                        ) : (
                          r.customerName
                        )}
                      </TD>
                      <TD className="text-xs opacity-70">{r.branchName}</TD>
                      <TD className="text-xs opacity-70">{r.sellerName ?? r.cashierName}</TD>
                      <TD className="text-xs">{fecha(r.issuedAt)}</TD>
                      <TD className="text-xs">{fecha(r.dueDate)}</TD>
                      <TD className="text-right text-xs tabular-nums">{r.creditDays ?? "—"}</TD>
                      <TD className="text-right text-xs tabular-nums">
                        {r.overdueDays > 0 ? <span className="font-semibold text-rose-700">{r.overdueDays}</span> : "0"}
                      </TD>
                      <TD className="text-right tabular-nums">{money(r.total)}</TD>
                      <TD className="text-right font-medium tabular-nums">{money(r.balance)}</TD>
                      <TD><AgingBadge bucket={r.bucket} /></TD>
                      <TD className="pr-4 text-right">
                        <Button size="sm" variant="outline" onClick={() => setToCollect([r])}>
                          <HandCoins className="h-3.5 w-3.5" /> Cobrar
                        </Button>
                      </TD>
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

      <CollectModal
        open={toCollect.length > 0}
        onClose={() => setToCollect([])}
        invoices={toCollect}
        onDone={reload}
      />
    </>
  );
}
