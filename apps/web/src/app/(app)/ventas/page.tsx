"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { RowActions } from "@/components/ui/row-actions";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
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
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast";
import { Coins, Receipt, ShoppingCart, TrendingUp, Printer, Send, Mail, Trash2, Pencil, Plus } from "lucide-react";
import { useProformas } from "@/features/sales/proforma-store";
import { SendInvoiceModal } from "@/features/sales/components/send-invoice-modal";
import {
  isInvoiceDocument,
  saleDocumentLabel,
  saleDocumentTone,
} from "@/features/sales/document-label";
import { documentEditability } from "@/features/sales/editability";
import { canEditSales } from "@/features/billing/permissions";
import { mockCurrentUser } from "@/lib/mock-data/users";
import type { Proforma } from "@/types";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

const NO_SELLER = "__none__";

export default function VentasPage() {
  // Ventas / Facturas: documentos fiscales emitidos (NCF B02/B01 y e-CF E32/E31).
  // Las proformas pendientes viven en la pantalla Proformas.
  const toast = useToast();
  const allDocuments = useProformas();
  const allSales = allDocuments.filter(isInvoiceDocument);
  const [sellerFilter, setSellerFilter] = React.useState<string>("all");

  // Vendedores presentes en las ventas (para el filtro), por id → nombre.
  const sellerOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    let hasUnassigned = false;
    for (const s of allSales) {
      if (s.sellerId) map.set(s.sellerId, s.sellerName || "Vendedor");
      else hasUnassigned = true;
    }
    return {
      list: [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "es")),
      hasUnassigned,
    };
  }, [allSales]);

  const sales = React.useMemo(() => {
    if (sellerFilter === "all") return allSales;
    if (sellerFilter === NO_SELLER) return allSales.filter((s) => !s.sellerId);
    return allSales.filter((s) => s.sellerId === sellerFilter);
  }, [allSales, sellerFilter]);

  const pag = usePagination(sales, { resetKey: sellerFilter });
  const canEdit = canEditSales(mockCurrentUser.role);

  const [sendDoc, setSendDoc] = React.useState<{
    doc: Proforma;
    tab: "whatsapp" | "email";
  } | null>(null);
  const total = sales.reduce((s, p) => s + p.total, 0);
  const itbis = sales.reduce((s, p) => s + p.itbis, 0);
  const items = sales.reduce(
    (s, p) => s + p.items.reduce((q, i) => q + i.quantity, 0),
    0,
  );

  return (
    <>
      <PageHeader
        title="Ventas / Facturas"
        description="Facturas emitidas (NCF B02/B01 y e-CF E32/E31). Las proformas pendientes están en la pantalla Proformas."
        breadcrumbs={[{ label: "Ventas" }]}
        actions={
          <Link href="/pos" aria-label="Ir a POS / Nueva venta">
            <Button size="sm" title="Crear nueva venta">
              <Plus className="h-4 w-4" />
              POS / Nueva venta
            </Button>
          </Link>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ventas hoy" value={formatCurrency(total)} icon={Coins} tone="primary" />
        <StatCard label="ITBIS recaudado" value={formatCurrency(itbis)} icon={TrendingUp} />
        <StatCard label="Transacciones" value={sales.length} icon={Receipt} />
        <StatCard label="Items vendidos" value={items} icon={ShoppingCart} />
      </div>

      <FilterBar className="mb-4">
        <Select
          value={sellerFilter}
          onChange={(e) => setSellerFilter(e.target.value)}
          aria-label="Filtrar por vendedor"
        >
          <option value="all">Todos los vendedores</option>
          {sellerOptions.list.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
          {sellerOptions.hasUnassigned && (
            <option value={NO_SELLER}>No asignado</option>
          )}
        </Select>
      </FilterBar>

      <Card>
        <CardContent className="p-0">
          {/* Móvil: tarjetas */}
          <div className="divide-y divide-slate-100 md:hidden">
            {pag.pageItems.length === 0 && (
              <div className="px-4 py-10 text-center text-sm opacity-60">Sin ventas.</div>
            )}
            {pag.pageItems.map((p) => (
              <Link
                key={p.id}
                href={`/ventas/${p.id}`}
                className="block px-4 py-3 active:bg-black/[0.03]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-sm">{p.ecfNumber ?? p.number}</div>
                    <div className="mt-0.5 truncate text-xs opacity-70">{p.customerName}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Badge tone={saleDocumentTone(p)}>{saleDocumentLabel(p)}</Badge>
                      <Badge
                        tone={p.status === "paid" ? "success" : p.status === "partially_paid" ? "warning" : "info"}
                      >
                        {p.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-bold tabular-nums text-[color:var(--brand-accent)]">
                      {formatCurrency(p.total)}
                    </div>
                    <div className="text-[10px] opacity-50">{formatDateTime(p.createdAt)}</div>
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
                <TH>Hora</TH>
                <TH>Comprobante</TH>
                <TH>Documento</TH>
                <TH>Cliente</TH>
                <TH>Cajero</TH>
                <TH>Vendedor</TH>
                <TH className="text-right">Total</TH>
                <TH>Estado</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {pag.pageItems.map((p) => (
                <TR key={p.id}>
                  <TD className="text-xs">{formatDateTime(p.createdAt)}</TD>
                  <TD>
                    <Link href={`/ventas/${p.id}`} className="font-mono text-xs hover:text-[color:var(--brand-accent)]">
                      {p.ecfNumber ?? p.number}
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone={saleDocumentTone(p)}>{saleDocumentLabel(p)}</Badge>
                  </TD>
                  <TD className="text-sm">{p.customerName}</TD>
                  <TD className="text-sm opacity-70">{p.cashierName}</TD>
                  <TD className="text-sm">
                    {p.sellerName ?? (
                      <span className="opacity-40">No asignado</span>
                    )}
                  </TD>
                  <TD className="text-right tabular-nums font-medium">
                    {formatCurrency(p.total)}
                  </TD>
                  <TD>
                    <Badge tone={p.status === "paid" ? "success" : p.status === "partially_paid" ? "warning" : "info"}>
                      {p.status}
                    </Badge>
                  </TD>
                  <TD className="pr-4">
                    <RowActions
                      viewHref={`/ventas/${p.id}`}
                      canEdit={false}
                      canDelete={false}
                      customActions={[
                        {
                          label: "Editar factura",
                          icon: Pencil,
                          ...(canEdit && documentEditability(p).editable
                            ? { href: `/ventas/${p.id}/editar` }
                            : {
                                disabled: true,
                                disabledReason: !canEdit
                                  ? "No tienes permiso para editar facturas."
                                  : documentEditability(p).reason ??
                                    "Este documento no se puede editar.",
                              }),
                        },
                        {
                          label: "Imprimir",
                          icon: Printer,
                          href: `/ventas/${p.id}/print`,
                        },
                        {
                          label: "Enviar WhatsApp",
                          icon: Send,
                          onClick: () => setSendDoc({ doc: p, tab: "whatsapp" }),
                        },
                        {
                          label: "Enviar por correo",
                          icon: Mail,
                          onClick: () => setSendDoc({ doc: p, tab: "email" }),
                        },
                        {
                          label: "Eliminar",
                          icon: Trash2,
                          disabled: true,
                          disabledReason:
                            "No se puede eliminar una venta emitida. Usa anular si aplica.",
                        },
                      ]}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          </div>
          {sales.length > 0 && (
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
      <SendInvoiceModal
        proforma={sendDoc?.doc ?? null}
        open={sendDoc != null}
        initialTab={sendDoc?.tab ?? "whatsapp"}
        onClose={() => setSendDoc(null)}
      />

      <toast.Toast />
    </>
  );
}
