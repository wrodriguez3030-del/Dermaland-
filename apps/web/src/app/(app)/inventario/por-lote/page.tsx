"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
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
import { SearchInput } from "@/components/ui/search-input";
import {
  SortableTH,
  useTableSort,
} from "@/components/ui/sortable-table-header";
import { RowActions } from "@/components/ui/row-actions";
import { useToast } from "@/components/ui/toast";
import { ShieldAlert, Unlock, History } from "lucide-react";
import { formatCurrency, formatDate, daysUntil } from "@/lib/utils/format";
import { lotStatusBadge } from "@/features/inventory/lot-badges";
import { ProductImage } from "@/features/products/components/product-image";
import {
  useAllLots,
  quarantineLotAnywhere,
  releaseLotAnywhere,
} from "@/features/inventory/lot-store";
import { useProducts } from "@/features/products/product-store";
import {
  useBrandsList,
  useLaboratoriesList,
} from "@/features/products/catalog-store";
import {
  useActiveBranches,
  getBranchDisplayName,
} from "@/features/tenancy/branch-store";
import {
  lotRowMatches,
  LOT_COMPARATORS,
  type LotRow,
  type LotStatusFilter,
} from "@/features/inventory/lot-table";
import type { ProductLot } from "@/types";

export default function StockPorLotePage() {
  const toast = useToast();
  // MISMA fuente de verdad que Stock actual / Productos / POS.
  const lots = useAllLots();
  const products = useProducts();
  const brands = useBrandsList();
  const laboratories = useLaboratoriesList();
  const activeBranches = useActiveBranches();

  const productById = React.useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  const brandName = React.useMemo(() => {
    const m = new Map(brands.map((b) => [b.id, b.name]));
    return (id?: string) => (id ? m.get(id) ?? "" : "");
  }, [brands]);
  const labName = React.useMemo(() => {
    const m = new Map(laboratories.map((l) => [l.id, l.name]));
    return (id?: string) => (id ? m.get(id) ?? "" : "");
  }, [laboratories]);

  const allRows: LotRow[] = React.useMemo(
    () =>
      lots.map((lot) => {
        const product = productById.get(lot.productId);
        return {
          lot,
          product,
          productName: product?.name ?? "Producto no encontrado",
          sku: product?.sku ?? "",
          brandName: brandName(product?.brandId),
          labName: labName(product?.laboratoryId),
          branchName: getBranchDisplayName(lot.branchId),
          days: daysUntil(lot.expiresAt),
          value: lot.currentQuantity * lot.unitCost,
        };
      }),
    [lots, productById, brandName, labName],
  );

  // ── Filtros ────────────────────────────────────────────────────────────────
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<LotStatusFilter>("all");
  const [branchFilter, setBranchFilter] = React.useState("all");

  const filtered = React.useMemo(
    () => allRows.filter((r) => lotRowMatches(r, { search, status, branchFilter })),
    [allRows, search, status, branchFilter],
  );

  // Ordenamiento por defecto CANTIDAD mayor→menor (motor compartido).
  const { sort, sorted, toggle } = useTableSort(
    filtered,
    "cantidad",
    "desc",
    LOT_COMPARATORS,
  );

  const handleQuarantine = async (lot: ProductLot) => {
    const r = await quarantineLotAnywhere(lot.id, {
      reason: "Movido a cuarentena desde Stock por lote",
    });
    if (r.ok) toast.success(`Lote ${lot.lotNumber} movido a cuarentena.`);
    else toast.error(r.error || "No se pudo mover a cuarentena.");
  };
  const handleRelease = async (lot: ProductLot) => {
    const r = await releaseLotAnywhere(lot.id, {
      reason: "Liberado desde Stock por lote",
    });
    if (r.ok) toast.success(`Lote ${lot.lotNumber} liberado.`);
    else toast.error(r.error || "No se pudo liberar el lote.");
  };

  return (
    <>
      <PageHeader
        title="Stock por lote"
        description="Detalle por producto + lote + vencimiento + sucursal. Misma verdad de stock que Stock actual y POS."
        breadcrumbs={[{ label: "Inventario", href: "/inventario" }, { label: "Por lote" }]}
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SearchInput
          placeholder="Buscar producto, SKU, lote, marca…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          containerClassName="lg:col-span-2"
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value as LotStatusFilter)}>
          <option value="all">Todos los estados</option>
          <option value="disponible">Disponible</option>
          <option value="sin-stock">Sin stock</option>
          <option value="por-vencer">Por vencer</option>
          <option value="vencido">Vencido</option>
          <option value="cuarentena">Cuarentena</option>
          <option value="recall">Recall</option>
        </Select>
        <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
          <option value="all">Todas las sucursales</option>
          {activeBranches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH className="w-[60px]"></TH>
                <SortableTH sortKey="producto" state={sort} onClick={toggle}>Producto</SortableTH>
                <SortableTH sortKey="lote" state={sort} onClick={toggle}>Lote</SortableTH>
                <SortableTH sortKey="sucursal" state={sort} onClick={toggle}>Sucursal</SortableTH>
                <SortableTH sortKey="cantidad" state={sort} onClick={toggle} align="right">Cantidad</SortableTH>
                <SortableTH sortKey="vence" state={sort} onClick={toggle}>Vence</SortableTH>
                <SortableTH sortKey="dias" state={sort} onClick={toggle}>Días</SortableTH>
                <SortableTH sortKey="estado" state={sort} onClick={toggle}>Estado</SortableTH>
                <SortableTH sortKey="valor" state={sort} onClick={toggle} align="right">Valor</SortableTH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {sorted.length === 0 && (
                <TR>
                  <TD colSpan={10} className="py-10 text-center text-sm opacity-60">
                    {lots.length === 0
                      ? "Esta sucursal no tiene inventario cargado."
                      : "No hay lotes que coincidan con los filtros."}
                  </TD>
                </TR>
              )}
              {sorted.map((r) => {
                const lot = r.lot;
                const tone =
                  r.days < 30 ? "danger" : r.days < 90 ? "warning" : "neutral";
                return (
                  <TR key={lot.id}>
                    <TD>
                      <ProductImage
                        src={r.product?.imageUrl ?? undefined}
                        alt={r.product?.imageAlt ?? r.productName}
                        name={r.productName}
                        size={40}
                      />
                    </TD>
                    <TD>
                      <div className="font-medium">{r.productName}</div>
                      <div className="font-mono text-xs opacity-60">{r.sku}</div>
                    </TD>
                    <TD className="font-mono text-xs">{lot.lotNumber}</TD>
                    <TD className="text-xs opacity-70">{r.branchName}</TD>
                    <TD className="text-right tabular-nums font-medium">
                      {lot.currentQuantity}
                    </TD>
                    <TD className="text-xs">{formatDate(lot.expiresAt)}</TD>
                    <TD>
                      <Badge tone={tone}>
                        {r.days < 0 ? `${Math.abs(r.days)}d venc.` : `${r.days}d`}
                      </Badge>
                    </TD>
                    <TD>{lotStatusBadge(lot.status)}</TD>
                    <TD className="text-right text-xs tabular-nums">
                      {formatCurrency(r.value)}
                    </TD>
                    <TD className="pr-4">
                      <RowActions
                        viewHref={`/productos/${lot.productId}`}
                        editHref={`/productos/${lot.productId}/editar`}
                        canDelete={false}
                        customActions={[
                          {
                            label: "Ver movimientos",
                            icon: History,
                            href: `/productos/${lot.productId}`,
                          },
                          ...(lot.status === "available"
                            ? [
                                {
                                  label: "Mover a cuarentena",
                                  icon: ShieldAlert,
                                  destructive: true,
                                  onClick: () => handleQuarantine(lot),
                                  confirm: {
                                    title: "Mover a cuarentena",
                                    message: `¿Mover el lote ${lot.lotNumber} a cuarentena? Quedará bloqueado para venta.`,
                                  },
                                },
                              ]
                            : []),
                          ...(lot.status === "quarantine"
                            ? [
                                {
                                  label: "Liberar",
                                  icon: Unlock,
                                  onClick: () => handleRelease(lot),
                                  confirm: {
                                    title: "Liberar lote",
                                    message: `¿Liberar el lote ${lot.lotNumber}? Volverá a estar disponible para venta.`,
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
        </CardContent>
      </Card>
      <toast.Toast />
    </>
  );
}
