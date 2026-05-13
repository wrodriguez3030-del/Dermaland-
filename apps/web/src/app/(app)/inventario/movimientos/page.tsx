"use client";

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
import { getProductById } from "@/lib/mock-data/catalog";
import { mockInventoryMovements } from "@/lib/mock-data/inventory-movements";
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

const comparators = {
  date: (a: InventoryMovement, b: InventoryMovement) =>
    +new Date(a.createdAt) - +new Date(b.createdAt),
  product: (a: InventoryMovement, b: InventoryMovement) => {
    const an = getProductById(a.productId)?.name ?? "";
    const bn = getProductById(b.productId)?.name ?? "";
    return an.localeCompare(bn);
  },
  type: (a: InventoryMovement, b: InventoryMovement) =>
    a.type.localeCompare(b.type),
  quantity: (a: InventoryMovement, b: InventoryMovement) =>
    a.quantity - b.quantity,
};

export default function MovimientosPage() {
  const { sort, sorted, toggle } = useTableSort(
    mockInventoryMovements,
    "date",
    "desc",
    comparators,
  );

  return (
    <>
      <PageHeader
        title="Movimientos de inventario"
        description="Cada movimiento queda con producto + lote + sucursal + almacén + usuario + motivo. Auditable — solo lectura."
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
        <select className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm">
          <option>Todos los tipos</option>
          <option>Entradas (compra)</option>
          <option>Salidas (venta)</option>
          <option>Ajustes</option>
          <option>Cuarentena / Liberación</option>
          <option>Vencimiento</option>
        </select>
        <input
          type="date"
          className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm"
        />
      </FilterBar>

      <Card>
        <CardContent className="p-0">
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
              {sorted.map((m) => {
                const p = getProductById(m.productId);
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
        </CardContent>
      </Card>
    </>
  );
}
