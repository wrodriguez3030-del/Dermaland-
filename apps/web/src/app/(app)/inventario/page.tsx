"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { RowActions } from "@/components/ui/row-actions";
import { ProductImage } from "@/features/products/components/product-image";
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
import { StatCard } from "@/components/ui/stat-card";
import { Boxes, AlertTriangle, ShieldAlert, X } from "lucide-react";
import { getBrandById, mockProducts } from "@/lib/mock-data/catalog";
import { getBranchById } from "@/lib/mock-data/tenancy";
import { listAllLots, useInventoryTick } from "@/features/inventory/lot-store";
import { formatCurrency } from "@/lib/utils/format";
import type { ProductLot } from "@/types";

function InventarioContent() {
  const params = useSearchParams();
  const branch = params.get("branch") ?? "";
  useInventoryTick();

  const branchName = branch ? getBranchById(branch)?.name : undefined;
  const allLots = listAllLots();

  const rows = mockProducts
    .map((p) => {
      const lots = allLots.filter(
        (l) => l.productId === p.id && (!branch || l.branchId === branch),
      );
      const stock = lots
        .filter((l) => l.status === "available")
        .reduce((s, l) => s + l.currentQuantity, 0);
      const value = lots
        .filter((l) => l.status === "available")
        .reduce((s, l) => s + l.currentQuantity * l.unitCost, 0);
      return { p, lots, stock, value };
    })
    // Si se filtra por sucursal, ocultar productos sin lotes en esa sucursal.
    .filter((r) => (branch ? r.lots.length > 0 : true));

  const totalUnits = rows.reduce((s, r) => s + r.stock, 0);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const lowStockCount = rows.filter((r) => r.stock <= r.p.minStock).length;
  const noStockCount = rows.filter((r) => r.stock === 0).length;

  return (
    <>
      <PageHeader
        title="Stock actual"
        description="Stock disponible por producto. Para detalle por lote, usa el módulo Stock por lote."
        breadcrumbs={[{ label: "Inventario" }]}
      />

      {branch && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-[color:var(--brand-primary)]/30 bg-[color:var(--brand-primary)]/5 px-4 py-2.5 text-sm">
          <span>
            Filtrado por sucursal:{" "}
            <strong>{branchName ?? branch}</strong>
          </span>
          <Link href="/inventario">
            <Button variant="ghost" size="sm">
              <X className="h-4 w-4" /> Quitar filtro
            </Button>
          </Link>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Unidades disponibles" value={totalUnits} icon={Boxes} tone="primary" />
        <StatCard
          label="Valor de inventario"
          value={formatCurrency(totalValue)}
          icon={Boxes}
          hint="Costo por lotes disponibles"
        />
        <StatCard
          label="Productos en o bajo mínimo"
          value={lowStockCount}
          icon={AlertTriangle}
          tone="warning"
        />
        <StatCard label="Sin stock" value={noStockCount} icon={ShieldAlert} tone="danger" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH className="w-[60px]"></TH>
                <TH>Producto</TH>
                <TH>Marca</TH>
                <TH className="text-right">Lotes</TH>
                <TH className="text-right">Stock</TH>
                <TH className="text-right">Mín / Máx</TH>
                <TH className="text-right">Valor</TH>
                <TH>Alertas</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {rows.length === 0 && (
                <TR>
                  <TD colSpan={9} className="py-10 text-center text-sm opacity-60">
                    {branch
                      ? "Esta sucursal no tiene inventario cargado."
                      : "Sin productos."}
                  </TD>
                </TR>
              )}
              {rows.map(({ p, lots, stock, value }) => {
                const lowStock = stock <= p.minStock;
                const noStock = stock === 0;
                const brand = getBrandById(p.brandId);
                return (
                  <TR key={p.id}>
                    <TD>
                      <Link href={`/productos/${p.id}`} aria-label={p.name}>
                        <ProductImage
                          src={p.imageUrl}
                          alt={p.imageAlt ?? p.name}
                          name={p.name}
                          size={44}
                        />
                      </Link>
                    </TD>
                    <TD>
                      <Link
                        href={`/productos/${p.id}`}
                        className="block hover:text-[color:var(--brand-accent)]"
                      >
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs opacity-60 font-mono">{p.sku}</div>
                      </Link>
                    </TD>
                    <TD className="text-sm opacity-70">{brand?.name ?? "—"}</TD>
                    <TD className="text-right tabular-nums">{lots.length}</TD>
                    <TD className="text-right tabular-nums font-medium">{stock}</TD>
                    <TD className="text-right tabular-nums text-xs opacity-70">
                      {p.minStock} / {p.maxStock}
                    </TD>
                    <TD className="text-right tabular-nums text-sm">
                      {formatCurrency(value)}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {noStock && <Badge tone="danger">Sin stock</Badge>}
                        {!noStock && lowStock && <Badge tone="warning">Bajo mínimo</Badge>}
                        {lots.some((l: ProductLot) => l.status === "expired") && (
                          <Badge tone="danger">Vencido</Badge>
                        )}
                        {lots.some((l: ProductLot) => l.status === "quarantine") && (
                          <Badge tone="warning">Cuarentena</Badge>
                        )}
                        {lots.some((l: ProductLot) => l.status === "recalled") && (
                          <Badge tone="danger">Recall</Badge>
                        )}
                      </div>
                    </TD>
                    <TD className="pr-4">
                      <RowActions
                        viewHref={`/productos/${p.id}`}
                        editHref={`/productos/${p.id}/editar`}
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

export default function InventarioPage() {
  return (
    <React.Suspense fallback={<div className="p-6 text-sm opacity-60">Cargando…</div>}>
      <InventarioContent />
    </React.Suspense>
  );
}
