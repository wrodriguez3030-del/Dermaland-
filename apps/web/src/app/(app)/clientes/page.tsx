"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Plus, X } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { FilterBar } from "@/components/ui/filter-bar";
import { RowActions } from "@/components/ui/row-actions";
import {
  SortableTH,
  useTableSort,
} from "@/components/ui/sortable-table-header";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { useToast } from "@/components/ui/toast";
import { deleteCustomerAnywhere } from "@/features/customers/customer-store";
import { useCustomersReport } from "@/features/customers/customer-profile-hooks";
import { isNewCustomer } from "@/features/customers/customer-flags";
import type { CustomerMetricsRow } from "@/features/customers/customer-metrics";
import { skinTypeLabel } from "@/features/customers/billing";
import {
  formatCurrency,
  formatDate,
  relativeTime,
  isSameCalendarMonth,
} from "@/lib/utils/format";

// Compras / Total gastado / Última visita salen de la capa CENTRAL de
// métricas (mismos números que el perfil y el Reporte de Clientes) — antes
// leían columnas estáticas del cliente que nunca se actualizaban (RD$0.00).
const comparators = {
  createdAt: (a: CustomerMetricsRow, b: CustomerMetricsRow) =>
    +new Date(a.customer.createdAt) - +new Date(b.customer.createdAt),
  name: (a: CustomerMetricsRow, b: CustomerMetricsRow) =>
    `${a.customer.firstName} ${a.customer.lastName}`.localeCompare(
      `${b.customer.firstName} ${b.customer.lastName}`,
    ),
  totalOrders: (a: CustomerMetricsRow, b: CustomerMetricsRow) =>
    a.stats.purchases - b.stats.purchases,
  totalSpent: (a: CustomerMetricsRow, b: CustomerMetricsRow) =>
    a.stats.totalSpent - b.stats.totalSpent,
  lastVisit: (a: CustomerMetricsRow, b: CustomerMetricsRow) =>
    +new Date(a.stats.lastVisitAt ?? 0) - +new Date(b.stats.lastVisitAt ?? 0),
};

function ClientesContent() {
  const router = useRouter();
  // Deep-link desde el dashboard: `?created=this_month` abre la lista ya
  // filtrada a clientes registrados este mes. MISMA definición
  // (isSameCalendarMonth) que el KPI "Clientes nuevos".
  const params = useSearchParams();
  const createdFilter =
    params.get("created") === "this_month" ? "this_month" : "all";
  const { rows } = useCustomersReport();
  const toast = useToast();
  const scopedRows = React.useMemo(
    () =>
      createdFilter === "this_month"
        ? rows.filter((r) => isSameCalendarMonth(r.customer.createdAt))
        : rows,
    [rows, createdFilter],
  );
  const { sort, sorted, toggle } = useTableSort(
    scopedRows,
    "createdAt",
    "desc",
    comparators,
  );
  const pag = usePagination(sorted, { resetKey: createdFilter });

  return (
    <>
      <PageHeader
        title="Clientes"
        description="CRM dermatológico — perfil completo con compras, recomendaciones y conversaciones WhatsApp."
        breadcrumbs={[{ label: "Clientes" }]}
        actions={
          <Link href="/clientes/nuevo">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Nuevo cliente
            </Button>
          </Link>
        }
      />

      {createdFilter === "this_month" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--brand-primary)]/30 bg-[color:var(--brand-primary)]/5 px-4 py-2.5 text-sm">
          <span>
            Mostrando: <strong>clientes nuevos de este mes</strong> ({sorted.length})
          </span>
          <Link href="/clientes">
            <Button variant="ghost" size="sm">
              <X className="h-4 w-4" /> Ver todos los clientes
            </Button>
          </Link>
        </div>
      )}

      <FilterBar className="mb-4">
        <SearchInput
          placeholder="Buscar por nombre, cédula, RNC, teléfono…"
          containerClassName="flex-1 min-w-[260px]"
        />
        <select className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm">
          <option>Todas las fuentes</option>
          <option>Manual</option>
          <option>WhatsApp</option>
          <option>Web</option>
          <option>Importación</option>
        </select>
        <select className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm">
          <option>Todos los tipos de piel</option>
          <option>Sensible</option>
          <option>Acneica</option>
          <option>Madura</option>
        </select>
      </FilterBar>

      <Card>
        <CardContent className="p-0">
          {/* Móvil: tarjetas */}
          <div className="divide-y divide-slate-100 md:hidden">
            {pag.pageItems.length === 0 && (
              <div className="px-4 py-8 text-center text-sm opacity-60">
                Sin clientes que coincidan.
              </div>
            )}
            {pag.pageItems.map(({ customer: c, stats }) => (
              <Link
                key={c.id}
                href={`/clientes/${c.id}`}
                className="block px-4 py-3 active:bg-black/[0.03]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-medium">
                      <span className="truncate">
                        {c.firstName} {c.lastName}
                      </span>
                      {isNewCustomer(c) && (
                        <Badge tone="success">Nuevo</Badge>
                      )}
                    </div>
                    <div className="font-mono text-xs opacity-60">{c.customerNumber}</div>
                    <div className="mt-1 text-xs opacity-70">
                      {c.phone ?? c.whatsapp ?? "—"}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="font-semibold tabular-nums text-[color:var(--brand-accent)]">
                      {formatCurrency(stats.totalSpent)}
                    </div>
                    <div className="text-[10px] opacity-50">{stats.purchases} pedidos</div>
                    <Badge tone="primary" outlined>
                      {skinTypeLabel(c.skinType)}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: tabla */}
          <div className="hidden md:block">
          <Table>
            <THead>
              <TR>
                <SortableTH sortKey="createdAt" state={sort} onClick={toggle}>
                  Registrado
                </SortableTH>
                <SortableTH sortKey="name" state={sort} onClick={toggle}>
                  Cliente
                </SortableTH>
                <TH>Documento</TH>
                <TH>Contacto</TH>
                <TH>Tipo de piel</TH>
                <SortableTH
                  sortKey="totalOrders"
                  state={sort}
                  onClick={toggle}
                  align="right"
                >
                  Compras
                </SortableTH>
                <SortableTH
                  sortKey="totalSpent"
                  state={sort}
                  onClick={toggle}
                  align="right"
                >
                  Total gastado
                </SortableTH>
                <SortableTH
                  sortKey="lastVisit"
                  state={sort}
                  onClick={toggle}
                >
                  Última visita
                </SortableTH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {sorted.length === 0 && (
                <TR>
                  <TD colSpan={9} className="py-8 text-center text-sm opacity-60">
                    Sin clientes aún.
                  </TD>
                </TR>
              )}
              {pag.pageItems.map(({ customer: c, stats }) => (
                <TR
                  key={c.id}
                  // Doble click sobre la fila → perfil. Single click no
                  // navega: los botones Ver/Editar/Eliminar y los enlaces
                  // del nombre siguen funcionando como antes.
                  onDoubleClick={() => router.push(`/clientes/${c.id}`)}
                  className="cursor-pointer transition hover:bg-black/[0.025]"
                  title="Doble clic para abrir el perfil"
                >
                  <TD className="text-xs opacity-70 whitespace-nowrap">
                    {formatDate(c.createdAt)}
                  </TD>
                  <TD>
                    <Link
                      href={`/clientes/${c.id}`}
                      onDoubleClick={(e) => e.stopPropagation()}
                      className="hover:text-[color:var(--brand-accent)]"
                    >
                      <div className="flex items-center gap-1.5 font-medium">
                        <span>
                          {c.firstName} {c.lastName}
                        </span>
                        {isNewCustomer(c) && (
                          <Badge tone="success">Nuevo</Badge>
                        )}
                      </div>
                      <div className="text-xs opacity-60 font-mono">
                        {c.customerNumber}
                      </div>
                    </Link>
                  </TD>
                  <TD className="text-xs font-mono opacity-80">
                    {c.documentNumber ?? "—"}
                    {c.documentType && (
                      <span className="ml-1 text-[10px] opacity-50">
                        {c.documentType}
                      </span>
                    )}
                  </TD>
                  <TD>
                    <div className="text-xs">{c.phone ?? c.whatsapp ?? "—"}</div>
                    {c.email && (
                      <div className="text-xs opacity-60">{c.email}</div>
                    )}
                  </TD>
                  <TD>
                    <Badge tone="primary" outlined>
                      {skinTypeLabel(c.skinType)}
                    </Badge>
                  </TD>
                  <TD className="text-right tabular-nums">{stats.purchases}</TD>
                  <TD className="text-right tabular-nums font-medium">
                    {formatCurrency(stats.totalSpent)}
                  </TD>
                  <TD className="text-xs opacity-70">
                    {stats.lastVisitAt ? relativeTime(stats.lastVisitAt) : "—"}
                  </TD>
                  <TD
                    className="pr-4"
                    // Evitar que un click/doble click sobre los botones de
                    // acción se interprete también como activación de la
                    // fila (que dispararía la navegación al perfil).
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    <RowActions
                      viewHref={`/clientes/${c.id}`}
                      editHref={`/clientes/${c.id}/editar`}
                      onDelete={async () => {
                        const res = await deleteCustomerAnywhere(c.id);
                        if (!res.ok)
                          toast.error(
                            res.error ?? "No se pudo eliminar el cliente.",
                          );
                        else toast.success("Cliente eliminado correctamente.");
                      }}
                      entityName={`${c.firstName} ${c.lastName}`}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          </div>
          {sorted.length > 0 && (
            <DataPagination
              page={pag.page}
              pageSize={pag.pageSize}
              total={pag.total}
              onPageChange={pag.setPage}
              onPageSizeChange={pag.setPageSize}
            />
          )}
        </CardContent>
      </Card>
      <toast.Toast />
    </>
  );
}

export default function ClientesPage() {
  return (
    <React.Suspense
      fallback={<div className="p-6 text-sm opacity-60">Cargando clientes…</div>}
    >
      <ClientesContent />
    </React.Suspense>
  );
}
