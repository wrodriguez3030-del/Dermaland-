"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { isProformaDocument } from "@/features/sales/document-label";
import { RowActions } from "@/components/ui/row-actions";
import { useToast } from "@/components/ui/toast";
import { Ban, Printer, Send } from "lucide-react";
import { shareProformaWhatsapp } from "@/features/sales/whatsapp-share.client";
import {
  SortableTH,
  useTableSort,
} from "@/components/ui/sortable-table-header";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import type { Proforma } from "@/types";
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
import { Plus } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { FilterBar } from "@/components/ui/filter-bar";
import { useProformas } from "@/features/sales/proforma-store";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

const statusMeta: Record<
  string,
  { label: string; tone: "success" | "warning" | "info" | "neutral" | "danger" | "purple" }
> = {
  paid: { label: "Pagada", tone: "success" },
  partially_paid: { label: "Pago parcial", tone: "warning" },
  issued: { label: "Emitida", tone: "info" },
  pending_ecf: { label: "Pendiente e-CF", tone: "warning" },
  converted_to_ecf: { label: "Convertida e-CF", tone: "success" },
  draft: { label: "Borrador", tone: "neutral" },
  cancelled: { label: "Cancelada", tone: "danger" },
  expired: { label: "Vencida", tone: "neutral" },
};

const comparators = {
  date: (a: Proforma, b: Proforma) =>
    +new Date(a.createdAt) - +new Date(b.createdAt),
  number: (a: Proforma, b: Proforma) => a.number.localeCompare(b.number),
  customer: (a: Proforma, b: Proforma) =>
    a.customerName.localeCompare(b.customerName),
  total: (a: Proforma, b: Proforma) => a.total - b.total,
  status: (a: Proforma, b: Proforma) => a.status.localeCompare(b.status),
};

export default function ProformasPage() {
  const toast = useToast();
  const allDocuments = useProformas();

  const handleShareWhatsapp = async (p: Proforma) => {
    const r = await shareProformaWhatsapp(p);
    if (r.ok) toast.show("Abriendo WhatsApp con la proforma en PDF…", "info");
    else toast.error(r.error);
  };
  // Solo proformas reales: las facturas NCF (B02/B01) y e-CF (E32/E31) van a
  // Ventas / Facturas, no aquí.
  const proformas = React.useMemo(
    () => allDocuments.filter(isProformaDocument),
    [allDocuments],
  );
  const { sort, sorted, toggle } = useTableSort(
    proformas,
    "date",
    "desc",
    comparators,
  );
  const pag = usePagination(sorted);
  return (
    <>
      <PageHeader
        title="Proformas"
        description="Toda venta nace como proforma. Convertibles a e-CF en cierre de caja."
        breadcrumbs={[{ label: "Ventas" }, { label: "Proformas" }]}
        actions={
          <Link href="/pos">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Nueva venta
            </Button>
          </Link>
        }
      />

      <FilterBar className="mb-4">
        <SearchInput placeholder="Buscar por número, cliente o cajero…" containerClassName="flex-1 min-w-[260px]" />
        <select className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm">
          <option>Todos los estados</option>
          <option>Pagadas</option>
          <option>Pago parcial</option>
          <option>Pendientes e-CF</option>
          <option>Canceladas</option>
        </select>
        <input type="date" className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm" />
      </FilterBar>

      <Card>
        <CardContent className="p-0">
          {/* Móvil: tarjetas */}
          <div className="divide-y divide-slate-100 md:hidden">
            {pag.pageItems.length === 0 && (
              <div className="px-4 py-10 text-center text-sm opacity-60">Sin proformas.</div>
            )}
            {pag.pageItems.map((p) => {
              const meta = statusMeta[p.status] ?? statusMeta.draft;
              return (
                <Link
                  key={p.id}
                  href={`/proformas/${p.id}`}
                  className="block px-4 py-3 active:bg-black/[0.03]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-sm">{p.number}</div>
                      <div className="mt-0.5 truncate text-xs opacity-70">{p.customerName}</div>
                      <div className="mt-1">
                        <Badge tone={meta!.tone}>{meta!.label}</Badge>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-bold tabular-nums text-[color:var(--brand-accent)]">
                        {formatCurrency(p.total)}
                      </div>
                      <div className="text-[10px] opacity-50">
                        {p.items.length} ítems · {formatDateTime(p.createdAt)}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Desktop: tabla */}
          <div className="hidden md:block">
          <Table>
            <THead>
              <TR>
                <SortableTH sortKey="date" state={sort} onClick={toggle}>
                  Fecha
                </SortableTH>
                <SortableTH sortKey="number" state={sort} onClick={toggle}>
                  Proforma
                </SortableTH>
                <SortableTH sortKey="customer" state={sort} onClick={toggle}>
                  Cliente
                </SortableTH>
                <TH>Cajero</TH>
                <TH className="text-right">Items</TH>
                <SortableTH
                  sortKey="total"
                  state={sort}
                  onClick={toggle}
                  align="right"
                >
                  Total
                </SortableTH>
                <TH className="text-right">Pagado</TH>
                <SortableTH sortKey="status" state={sort} onClick={toggle}>
                  Estado
                </SortableTH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {pag.pageItems.map((p) => {
                const meta = statusMeta[p.status] ?? statusMeta.draft;
                return (
                  <TR key={p.id}>
                    <TD className="text-xs opacity-70 whitespace-nowrap">
                      {formatDateTime(p.createdAt)}
                    </TD>
                    <TD>
                      <Link
                        href={`/proformas/${p.id}`}
                        className="font-medium font-mono text-xs hover:text-[color:var(--brand-accent)]"
                      >
                        {p.number}
                      </Link>
                    </TD>
                    <TD className="text-sm">{p.customerName}</TD>
                    <TD className="text-sm opacity-70">{p.cashierName}</TD>
                    <TD className="text-right tabular-nums">{p.items.length}</TD>
                    <TD className="text-right tabular-nums font-medium">
                      {formatCurrency(p.total)}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {formatCurrency(p.paid)}
                    </TD>
                    <TD>
                      <Badge tone={meta!.tone}>{meta!.label}</Badge>
                    </TD>
                    <TD className="pr-4">
                      <RowActions
                        viewHref={`/proformas/${p.id}`}
                        editHref={`/proformas/${p.id}/editar`}
                        canEdit={p.status === "draft" || p.status === "issued"}
                        canDelete={false}
                        customActions={[
                          {
                            label: "Imprimir",
                            icon: Printer,
                            href: `/proformas/${p.id}/print`,
                          },
                          {
                            label: "Enviar WhatsApp",
                            icon: Send,
                            onClick: () => handleShareWhatsapp(p),
                          },
                          ...(p.status === "issued" || p.status === "partially_paid"
                            ? [
                                {
                                  label: "Anular",
                                  icon: Ban,
                                  destructive: true,
                                  onClick: () =>
                                    toast.success(
                                      `Proforma ${p.number} anulada.`,
                                    ),
                                  confirm: {
                                    title: "Anular proforma",
                                    message: `¿Anular ${p.number}? Generará nota de crédito si está pagada.`,
                                  },
                                },
                              ]
                            : []),
                        ]}
                      />
                    </TD>
                  </TR>
                );
              })}
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
