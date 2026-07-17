"use client";

import * as React from "react";
import Link from "next/link";
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
import { Plus } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { FilterBar } from "@/components/ui/filter-bar";
import { RowActions } from "@/components/ui/row-actions";
import {
  SortableTH,
  useTableSort,
} from "@/components/ui/sortable-table-header";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { useProducts } from "@/features/products/product-store";
import { useAllMovements } from "@/features/inventory/lot-store";
import { BranchFilter, branchMatches, ALL_BRANCHES } from "@/features/tenancy/branch-filter";
import { formatDateTime } from "@/lib/utils/format";
import type { InventoryMovement } from "@/types";

const typeColors: Record<string, "success" | "danger" | "warning" | "info" | "neutral"> = {
  entry_purchase: "success",
  exit_sale: "info",
  adjustment_positive: "success",
  adjustment_negative: "warning",
  expiry: "danger",
  quarantine: "warning",
  release: "success",
  count_adjustment: "warning",
};

export default function MovimientosPage() {
  const allMovements = useAllMovements();
  const products = useProducts();
  const productById = React.useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  const comparators = React.useMemo(
    () => ({
      date: (a: InventoryMovement, b: InventoryMovement) =>
        +new Date(a.createdAt) - +new Date(b.createdAt),
      product: (a: InventoryMovement, b: InventoryMovement) => {
        const an = productById.get(a.productId)?.name ?? "";
        const bn = productById.get(b.productId)?.name ?? "";
        return an.localeCompare(bn);
      },
      type: (a: InventoryMovement, b: InventoryMovement) =>
        a.type.localeCompare(b.type),
      quantity: (a: InventoryMovement, b: InventoryMovement) =>
        a.quantity - b.quantity,
    }),
    [productById],
  );
  const [branchFilter, setBranchFilter] = React.useState(ALL_BRANCHES);
  const branchFiltered = React.useMemo(
    () => allMovements.filter((m) => branchMatches(m.branchId, branchFilter)),
    [allMovements, branchFilter],
  );
  const { sort, sorted, toggle } = useTableSort(
    branchFiltered,
    "date",
    "desc",
    comparators,
  );
  const pag = usePagination(sorted);

  return (
    <>
      <PageHeader
        title="Movimientos de inventario"
        description="Cada movimiento queda con producto + lote + sucursal + usuario + motivo. Auditable — solo lectura."
        breadcrumbs={[
          { label: "Inventario", href: "/inventario" },
          { label: "Movimientos" },
        ]}
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Ajuste manual
          </Button>
        }
      />

      <FilterBar className="mb-4">
        <SearchInput
          placeholder="Buscar por producto, lote o referencia…"
          containerClassName="flex-1 min-w-[260px]"
        />
        <BranchFilter value={branchFilter} onChange={setBranchFilter} />
      </FilterBar>

      <Card>
        <CardContent className="p-0">
          {/* Móvil: tarjetas */}
          <div className="divide-y divide-slate-100 md:hidden">
            {pag.pageItems.length === 0 && (
              <div className="px-4 py-10 text-center text-sm opacity-60">Sin movimientos.</div>
            )}
            {pag.pageItems.map((m) => {
              const p = productById.get(m.productId);
              return (
                <Link
                  key={m.id}
                  href={`/inventario/movimientos/${m.id}`}
                  className="block px-4 py-3 active:bg-black/[0.03]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{p?.name}</div>
                      <div className="font-mono text-xs opacity-60">{p?.sku}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <Badge tone={typeColors[m.type] ?? "neutral"}>{m.type}</Badge>
                        <span className="text-[10px] opacity-50">{m.reason ?? m.reference ?? ""}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className={`font-semibold tabular-nums ${m.quantity < 0 ? "text-rose-700" : "text-emerald-700"}`}
                      >
                        {m.quantity > 0 ? "+" : ""}
                        {m.quantity}
                      </div>
                      <div className="text-[10px] opacity-50">{formatDateTime(m.createdAt)}</div>
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
                <SortableTH sortKey="product" state={sort} onClick={toggle}>
                  Producto
                </SortableTH>
                <TH>Lote</TH>
                <SortableTH sortKey="type" state={sort} onClick={toggle}>
                  Tipo
                </SortableTH>
                <SortableTH
                  sortKey="quantity"
                  state={sort}
                  onClick={toggle}
                  align="right"
                >
                  Cantidad
                </SortableTH>
                <TH>Motivo / Ref.</TH>
                <TH>Usuario</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {pag.pageItems.map((m) => {
                const p = productById.get(m.productId);
                return (
                  <TR key={m.id}>
                    <TD className="text-xs whitespace-nowrap">
                      {formatDateTime(m.createdAt)}
                    </TD>
                    <TD>
                      <div className="text-sm">{p?.name}</div>
                      <div className="text-xs opacity-60 font-mono">{p?.sku}</div>
                    </TD>
                    <TD className="font-mono text-xs">{m.lotId ?? "—"}</TD>
                    <TD>
                      <Badge tone={typeColors[m.type] ?? "neutral"}>
                        {m.type}
                      </Badge>
                    </TD>
                    <TD
                      className={`text-right tabular-nums font-medium ${
                        m.quantity < 0 ? "text-rose-700" : "text-emerald-700"
                      }`}
                    >
                      {m.quantity > 0 ? "+" : ""}
                      {m.quantity}
                    </TD>
                    <TD className="text-xs opacity-80">
                      {m.reason ?? m.reference ?? "—"}
                    </TD>
                    <TD className="text-xs">{m.userName}</TD>
                    <TD className="pr-4">
                      <RowActions
                        viewHref={`/inventario/movimientos/${m.id}`}
                        canEdit={false}
                        canDelete={false}
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
    </>
  );
}
