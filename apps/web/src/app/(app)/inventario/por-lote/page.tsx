"use client";

import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { SearchInput } from "@/components/ui/search-input";
import { FilterBar } from "@/components/ui/filter-bar";
import { RowActions } from "@/components/ui/row-actions";
import { useToast } from "@/components/ui/toast";
import { ShieldAlert } from "lucide-react";
import { getProductById } from "@/lib/mock-data/catalog";
import { formatCurrency, formatDate, daysUntil } from "@/lib/utils/format";
import { lotStatusBadge } from "@/features/inventory/lot-badges";
import { Badge } from "@/components/ui";
import { ProductImage } from "@/features/products/components/product-image";
import { listAllLots, useInventoryTick } from "@/features/inventory/lot-store";
import {
  resolveBranchName,
  onlyActiveBranches,
} from "@/features/tenancy/branch-store";

export default function StockPorLotePage() {
  const toast = useToast();
  useInventoryTick();
  // Stock operativo: solo lotes de sucursales ACTIVAS.
  const sorted = onlyActiveBranches([...listAllLots()]).sort(
    (a, b) => +new Date(a.expiresAt) - +new Date(b.expiresAt),
  );
  return (
    <>
      <PageHeader
        title="Stock por lote"
        description="Detalle por producto + lote + vencimiento + sucursal. Es el stock real del negocio."
        breadcrumbs={[{ label: "Inventario", href: "/inventario" }, { label: "Por lote" }]}
      />

      <FilterBar className="mb-4">
        <SearchInput
          placeholder="Buscar por SKU, lote o nombre…"
          containerClassName="flex-1 min-w-[260px]"
        />
        <select className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm">
          <option>Todos los estados</option>
          <option>Disponibles</option>
          <option>Cuarentena</option>
          <option>Vencidos</option>
          <option>Recall</option>
        </select>
        <select className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm">
          <option>Todas las sucursales</option>
        </select>
      </FilterBar>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH className="w-[60px]"></TH>
                <TH>Producto</TH>
                <TH>Lote</TH>
                <TH>Sucursal</TH>
                <TH className="text-right">Cantidad</TH>
                <TH>Vence</TH>
                <TH>Días</TH>
                <TH>Estado</TH>
                <TH className="text-right">Valor</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {sorted.map((lot) => {
                const p = getProductById(lot.productId);
                const days = daysUntil(lot.expiresAt);
                const tone =
                  days < 0
                    ? "danger"
                    : days < 30
                      ? "danger"
                      : days < 90
                        ? "warning"
                        : "neutral";
                return (
                  <TR key={lot.id}>
                    <TD>
                      <ProductImage
                        src={p?.imageUrl}
                        alt={p?.imageAlt ?? p?.name ?? ""}
                        name={p?.name}
                        size={40}
                      />
                    </TD>
                    <TD>
                      <div className="font-medium">{p?.name}</div>
                      <div className="font-mono text-xs opacity-60">{p?.sku}</div>
                    </TD>
                    <TD className="font-mono text-xs">{lot.lotNumber}</TD>
                    <TD className="text-xs opacity-70">
                      {resolveBranchName(lot.branchId)}
                    </TD>
                    <TD className="text-right tabular-nums font-medium">
                      {lot.currentQuantity}
                    </TD>
                    <TD className="text-xs">{formatDate(lot.expiresAt)}</TD>
                    <TD>
                      <Badge tone={tone}>
                        {days < 0 ? `${Math.abs(days)}d venc.` : `${days}d`}
                      </Badge>
                    </TD>
                    <TD>{lotStatusBadge(lot.status)}</TD>
                    <TD className="text-right text-xs tabular-nums">
                      {formatCurrency(lot.currentQuantity * lot.unitCost)}
                    </TD>
                    <TD className="pr-4">
                      <RowActions
                        viewHref={`/productos/${lot.productId}`}
                        editHref={`/productos/${lot.productId}/editar`}
                        canDelete={false}
                        customActions={
                          lot.status === "available"
                            ? [
                                {
                                  label: "Cuarentena",
                                  icon: ShieldAlert,
                                  destructive: true,
                                  onClick: () =>
                                    toast.success(
                                      `Lote ${lot.lotNumber} movido a cuarentena.`,
                                    ),
                                  confirm: {
                                    title: "Mover a cuarentena",
                                    message: `¿Mover el lote ${lot.lotNumber} a cuarentena? Quedará bloqueado para venta.`,
                                  },
                                },
                              ]
                            : lot.status === "quarantine"
                              ? [
                                  {
                                    label: "Liberar",
                                    onClick: () =>
                                      toast.success(
                                        `Lote ${lot.lotNumber} liberado.`,
                                      ),
                                  },
                                ]
                              : []
                        }
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <toast.Toast />
    </>
  );
}
