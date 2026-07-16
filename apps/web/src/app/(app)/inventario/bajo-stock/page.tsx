"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  Badge,
  Button,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { ShoppingBag } from "lucide-react";
import { useProducts } from "@/features/products/product-store";
import { useBrandsList } from "@/features/products/catalog-store";
import { useAllLots, totalSellableStock } from "@/features/inventory/lot-store";
import { useActiveBranches } from "@/features/tenancy/branch-store";

export default function BajoStockPage() {
  // Catálogo y stock REALES (Supabase o local según DATA_SOURCE); antes se
  // leía el seed estático `mockProducts` + `mockProductLots` y el listado de
  // reorden salía vacío/incorrecto en producción.
  const products = useProducts();
  const brands = useBrandsList();
  const brandById = React.useMemo(
    () => new Map(brands.map((b) => [b.id, b])),
    [brands],
  );
  const lots = useAllLots();
  const activeBranches = useActiveBranches();
  const activeBranchIds = React.useMemo(
    () => new Set(activeBranches.map((b) => b.id)),
    [activeBranches],
  );

  const rows = React.useMemo(
    () =>
      products
        .map((p) => ({
          p,
          stock: totalSellableStock(lots, p.id, activeBranchIds),
        }))
        .filter(({ p, stock }) => stock <= p.minStock)
        .sort((a, b) => a.stock - b.stock),
    [products, lots, activeBranchIds],
  );

  return (
    <>
      <PageHeader
        title="Productos bajo stock"
        description="Productos en o por debajo del mínimo configurado. Sugerencia de orden de compra."
        breadcrumbs={[
          { label: "Inventario", href: "/inventario" },
          { label: "Bajo stock" },
        ]}
        actions={
          <Button size="sm">
            <ShoppingBag className="h-4 w-4" />
            Crear OC sugerida
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Producto</TH>
                <TH>Marca</TH>
                <TH className="text-right">Stock</TH>
                <TH className="text-right">Mínimo</TH>
                <TH className="text-right">Sugerido reordenar</TH>
                <TH>Estado</TH>
              </TR>
            </THead>
            <TBody>
              {rows.length === 0 && (
                <TR>
                  <TD colSpan={6} className="py-8 text-center text-sm opacity-60">
                    Todos los productos están sobre el mínimo. ✅
                  </TD>
                </TR>
              )}
              {rows.map(({ p, stock }) => {
                const brand = p.brandId ? brandById.get(p.brandId) : undefined;
                const reorder = Math.max(p.maxStock - stock, p.minStock * 2);
                return (
                  <TR key={p.id}>
                    <TD>
                      <div className="font-medium">{p.name}</div>
                      <div className="font-mono text-xs opacity-60">{p.sku}</div>
                    </TD>
                    <TD className="text-sm opacity-70">{brand?.name ?? "—"}</TD>
                    <TD className="text-right tabular-nums font-medium">
                      {stock}
                    </TD>
                    <TD className="text-right tabular-nums text-xs opacity-70">
                      {p.minStock}
                    </TD>
                    <TD className="text-right tabular-nums">{reorder}</TD>
                    <TD>
                      {stock === 0 ? (
                        <Badge tone="danger">Sin stock</Badge>
                      ) : (
                        <Badge tone="warning">Bajo mínimo</Badge>
                      )}
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
