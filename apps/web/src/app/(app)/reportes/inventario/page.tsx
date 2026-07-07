"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { BarChart } from "@/components/ui/bar-chart";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import {
  ReportLayout,
  ReportHeader,
  ReportSummaryCards,
  ReportSection,
  ReportFooter,
  ReportEmptyState,
  ReportBadge,
  PrintReportButton,
  type ReportKpi,
} from "@/components/reporting/report-layout";
import { useProducts } from "@/features/products/product-store";
import { useAllLots, useAllMovements } from "@/features/inventory/lot-store";
import { useActiveBranches, useBranches } from "@/features/tenancy/branch-store";
import { ExportExcelButton } from "@/components/reporting/export-excel-button";
import { buildInventoryWorkbookSpec } from "@/features/inventory/inventory-report-excel";
import { mockCurrentUser } from "@/lib/mock-data/users";
import { formatCurrency, formatDate, formatDateTime, daysUntil } from "@/lib/utils/format";
import type { Product, ProductLot } from "@/types";

const MOVEMENT_LABEL: Record<string, string> = {
  entry: "Entrada",
  exit: "Salida",
  sale: "Venta",
  adjustment: "Ajuste",
  transfer: "Transferencia",
  return: "Devolución",
  count: "Conteo",
};

interface ProductStat {
  stock: number;
  value: number;
  soonLots: number;
  expired: boolean;
}

function emptyStat(): ProductStat {
  return { stock: 0, value: 0, soonLots: 0, expired: false };
}

/** Un lote cuenta como stock vendible: disponible, con cantidad y no vencido. */
function isSellableLot(l: ProductLot): boolean {
  return l.status === "available" && l.currentQuantity > 0 && daysUntil(l.expiresAt) >= 0;
}

export default function ReporteInventarioPage() {
  const products = useProducts();
  const lots = useAllLots();
  const branches = useActiveBranches();
  const allBranches = useBranches();
  const movements = useAllMovements(15);

  const [generatedAt, setGeneratedAt] = React.useState("");
  React.useEffect(() => {
    setGeneratedAt(formatDateTime(new Date().toISOString()));
  }, []);

  const branchNames = React.useMemo(
    () => new Map(allBranches.map((b) => [b.id, b.name])),
    [allBranches],
  );
  const productById = React.useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  // Agregación en UNA pasada por lote (eficiente con catálogos grandes).
  const statByProduct = React.useMemo(() => {
    const map = new Map<string, ProductStat>();
    for (const l of lots) {
      const s = map.get(l.productId) ?? emptyStat();
      const d = daysUntil(l.expiresAt);
      const expired = l.status === "expired" || d < 0;
      if (l.currentQuantity > 0 && expired) s.expired = true;
      if (isSellableLot(l)) {
        s.stock += l.currentQuantity;
        s.value += l.currentQuantity * l.unitCost;
        if (d < 90) s.soonLots += 1;
      }
      map.set(l.productId, s);
    }
    return map;
  }, [lots]);

  const rows = React.useMemo(
    () =>
      products.map((p) => ({ product: p, ...(statByProduct.get(p.id) ?? emptyStat()) })),
    [products, statByProduct],
  );

  // ── KPIs / agregados ──
  const totalUnits = rows.reduce((s, r) => s + r.stock, 0);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const lowStock = rows
    .filter((r) => r.stock > 0 && r.stock < r.product.minStock)
    .sort((a, b) => a.stock - b.stock);
  const noStock = rows
    .filter((r) => r.stock === 0 && r.product.minStock > 0)
    .sort((a, b) => a.product.name.localeCompare(b.product.name, "es"));
  const expiringLots = lots
    .filter((l) => isSellableLot(l) && daysUntil(l.expiresAt) < 90)
    .sort((a, b) => (a.expiresAt < b.expiresAt ? -1 : 1));
  const expiredLots = lots
    .filter((l) => l.currentQuantity > 0 && (l.status === "expired" || daysUntil(l.expiresAt) < 0))
    .sort((a, b) => (a.expiresAt < b.expiresAt ? -1 : 1));

  const byBranch = React.useMemo(() => {
    const map = new Map<string, { units: number; value: number }>();
    for (const l of lots) {
      if (!isSellableLot(l)) continue;
      const e = map.get(l.branchId) ?? { units: 0, value: 0 };
      e.units += l.currentQuantity;
      e.value += l.currentQuantity * l.unitCost;
      map.set(l.branchId, e);
    }
    return branches
      .map((b) => ({
        branch: b,
        units: map.get(b.id)?.units ?? 0,
        value: map.get(b.id)?.value ?? 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [lots, branches]);

  // Detalle paginado (ordenado por valor desc).
  const detail = React.useMemo(
    () => [...rows].sort((a, b) => b.value - a.value),
    [rows],
  );
  const pag = usePagination(detail);

  const kpiItems: ReportKpi[] = [
    { label: "Productos (SKUs)", value: products.length, tone: "primary" },
    { label: "Unidades en stock", value: totalUnits.toLocaleString("es-DO") },
    { label: "Valor de inventario", value: formatCurrency(totalValue) },
    { label: "Sucursales", value: branches.length },
    { label: "Bajo stock", value: lowStock.length, tone: lowStock.length ? "warning" : "default" },
    { label: "Sin stock", value: noStock.length, tone: noStock.length ? "danger" : "default" },
    {
      label: "Próximos a vencer",
      value: expiringLots.length,
      tone: expiringLots.length ? "warning" : "default",
    },
    { label: "Vencidos", value: expiredLots.length, tone: expiredLots.length ? "danger" : "default" },
  ];

  const productName = (id: string) => productById.get(id)?.name ?? "Producto";

  // Excel profesional: mismas cifras y agregados que esta pantalla.
  const excelSpec = () =>
    buildInventoryWorkbookSpec(
      {
        detail,
        byBranch: byBranch.map((b) => ({
          name: b.branch.name,
          units: b.units,
          value: b.value,
        })),
        lowStock,
        noStock,
        expiringLots,
        expiredLots,
        movements,
        lots,
        productName,
        branchName: (id) => branchNames.get(id) ?? "Sucursal",
        movementLabel: (t) => MOVEMENT_LABEL[t] ?? t,
        daysUntil,
        kpis: {
          skus: products.length,
          totalUnits,
          totalValue,
          branches: branches.length,
        },
      },
      {
        title: "Reporte de inventario",
        subtitle: "Existencias, valor de inventario, alertas de stock y vencimientos.",
        rangeLabel: "Inventario actual",
        branchLabel: "Todas las sucursales",
        filtersLabel: "Sin filtros adicionales",
        generatedBy: mockCurrentUser.fullName,
        generatedAtLabel: formatDateTime(new Date().toISOString()),
      },
    );

  return (
    <>
      <PageHeader
        title="Reporte de inventario"
        description="Existencias, valor, alertas de stock y vencimientos por sucursal."
        breadcrumbs={[{ label: "Reportes", href: "/reportes" }, { label: "Inventario" }]}
        actions={
          <>
            <ExportExcelButton getSpec={excelSpec} fileSlug="Reporte_Inventario" />
            <PrintReportButton />
          </>
        }
      />

      <ReportLayout>
        <ReportHeader
          businessName="DermaLand"
          title="Reporte de inventario"
          subtitle="Existencias, valor de inventario, alertas de stock y próximos vencimientos."
          generatedBy={mockCurrentUser.fullName}
          generatedAt={generatedAt}
        />

        <ReportSummaryCards items={kpiItems} columns={4} />

        {/* ── Stock por sucursal ── */}
        <ReportSection title="Stock por sucursal">
          {byBranch.length === 0 ? (
            <ReportEmptyState message="Sin existencias registradas." />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Table>
                <THead>
                  <TR>
                    <TH>Sucursal</TH>
                    <TH className="text-right">Unidades</TH>
                    <TH className="text-right">Valor</TH>
                  </TR>
                </THead>
                <TBody>
                  {byBranch.map((b) => (
                    <TR key={b.branch.id}>
                      <TD className="text-sm">{b.branch.name}</TD>
                      <TD className="text-right tabular-nums">{b.units.toLocaleString("es-DO")}</TD>
                      <TD className="text-right tabular-nums">{formatCurrency(b.value)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <BarChart
                data={byBranch.map((b) => ({ label: b.branch.name, value: b.value }))}
                formatter={formatCurrency}
              />
            </div>
          )}
        </ReportSection>

        {/* ── Bajo stock ── */}
        <ReportSection title="Productos con bajo stock" tone="warning">
          {lowStock.length === 0 ? (
            <ReportEmptyState message="Ningún producto por debajo del mínimo." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Producto</TH>
                  <TH>SKU</TH>
                  <TH className="text-right">Stock</TH>
                  <TH className="text-right">Mínimo</TH>
                  <TH>Estado</TH>
                </TR>
              </THead>
              <TBody>
                {lowStock.slice(0, 100).map((r) => (
                  <TR key={r.product.id}>
                    <TD className="text-sm">{r.product.name}</TD>
                    <TD className="font-mono text-xs">{r.product.sku}</TD>
                    <TD className="text-right tabular-nums">{r.stock}</TD>
                    <TD className="text-right tabular-nums opacity-60">{r.product.minStock}</TD>
                    <TD><ReportBadge tone="medium">Bajo</ReportBadge></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </ReportSection>

        {/* ── Sin stock ── */}
        <ReportSection title="Productos sin stock" tone="danger">
          {noStock.length === 0 ? (
            <ReportEmptyState message="Todos los productos rastreados tienen existencias." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Producto</TH>
                  <TH>SKU</TH>
                  <TH className="text-right">Mínimo</TH>
                  <TH>Estado</TH>
                </TR>
              </THead>
              <TBody>
                {noStock.slice(0, 100).map((r) => (
                  <TR key={r.product.id}>
                    <TD className="text-sm">{r.product.name}</TD>
                    <TD className="font-mono text-xs">{r.product.sku}</TD>
                    <TD className="text-right tabular-nums opacity-60">{r.product.minStock}</TD>
                    <TD><ReportBadge tone="high">Agotado</ReportBadge></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </ReportSection>

        {/* ── Próximos vencimientos ── */}
        <ReportSection title="Próximos vencimientos (90 días)" tone="warning">
          {expiringLots.length === 0 ? (
            <ReportEmptyState message="Sin lotes próximos a vencer." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Producto</TH>
                  <TH>Lote</TH>
                  <TH>Sucursal</TH>
                  <TH className="text-right">Cantidad</TH>
                  <TH>Vence</TH>
                  <TH className="text-right">Días</TH>
                </TR>
              </THead>
              <TBody>
                {expiringLots.slice(0, 100).map((l) => {
                  const d = daysUntil(l.expiresAt);
                  return (
                    <TR key={l.id}>
                      <TD className="text-sm">{productName(l.productId)}</TD>
                      <TD className="font-mono text-xs">{l.lotNumber}</TD>
                      <TD className="text-sm">{branchNames.get(l.branchId) ?? "Sucursal"}</TD>
                      <TD className="text-right tabular-nums">{l.currentQuantity}</TD>
                      <TD className="text-sm">{formatDate(l.expiresAt)}</TD>
                      <TD className="text-right">
                        <ReportBadge tone={d < 30 ? "high" : "medium"}>{d} días</ReportBadge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </ReportSection>

        {/* ── Vencidos ── */}
        {expiredLots.length > 0 && (
          <ReportSection title="Lotes vencidos" tone="danger">
            <Table>
              <THead>
                <TR>
                  <TH>Producto</TH>
                  <TH>Lote</TH>
                  <TH>Sucursal</TH>
                  <TH className="text-right">Cantidad</TH>
                  <TH>Venció</TH>
                </TR>
              </THead>
              <TBody>
                {expiredLots.slice(0, 100).map((l) => (
                  <TR key={l.id}>
                    <TD className="text-sm">{productName(l.productId)}</TD>
                    <TD className="font-mono text-xs">{l.lotNumber}</TD>
                    <TD className="text-sm">{branchNames.get(l.branchId) ?? "Sucursal"}</TD>
                    <TD className="text-right tabular-nums">{l.currentQuantity}</TD>
                    <TD className="text-sm">{formatDate(l.expiresAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </ReportSection>
        )}

        {/* ── Movimientos recientes ── */}
        <ReportSection title="Movimientos recientes">
          {movements.length === 0 ? (
            <ReportEmptyState message="Sin movimientos de inventario." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Tipo</TH>
                  <TH>Producto</TH>
                  <TH className="text-right">Cantidad</TH>
                  <TH>Sucursal</TH>
                  <TH>Usuario</TH>
                </TR>
              </THead>
              <TBody>
                {movements.map((m) => (
                  <TR key={m.id}>
                    <TD className="text-xs">{formatDateTime(m.createdAt)}</TD>
                    <TD className="text-sm">{MOVEMENT_LABEL[m.type] ?? m.type}</TD>
                    <TD className="text-sm">{productName(m.productId)}</TD>
                    <TD className="text-right tabular-nums">{m.quantity}</TD>
                    <TD className="text-sm">{branchNames.get(m.branchId) ?? "—"}</TD>
                    <TD className="text-sm opacity-70">{m.userName}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </ReportSection>

        {/* ── Detalle de inventario (pantalla: paginado) ── */}
        <div className="screen-only">
          <ReportSection title="Detalle de inventario" flush>
            <Table>
              <THead>
                <TR>
                  <TH>Producto</TH>
                  <TH>SKU</TH>
                  <TH className="text-right">Stock</TH>
                  <TH className="text-right">Valor</TH>
                  <TH>Estado</TH>
                </TR>
              </THead>
              <TBody>
                {detail.length === 0 && (
                  <TR>
                    <TD colSpan={5} className="py-10 text-center text-sm opacity-60">
                      No hay productos para mostrar.
                    </TD>
                  </TR>
                )}
                {pag.pageItems.map((r) => (
                  <DetailRow key={r.product.id} product={r.product} stock={r.stock} value={r.value} />
                ))}
              </TBody>
            </Table>
            {detail.length > 0 && (
              <DataPagination
                page={pag.page}
                pageSize={pag.pageSize}
                total={pag.total}
                onPageChange={pag.setPage}
                onPageSizeChange={pag.setPageSize}
              />
            )}
          </ReportSection>
        </div>

        {/* ── Detalle COMPLETO solo para impresión / PDF ── */}
        <div className="print-only">
          <ReportSection title={`Detalle de inventario (${detail.length})`} flush>
            <Table>
              <THead>
                <TR>
                  <TH>Producto</TH>
                  <TH>SKU</TH>
                  <TH className="text-right">Stock</TH>
                  <TH className="text-right">Valor</TH>
                </TR>
              </THead>
              <TBody>
                {detail.map((r) => (
                  <TR key={`print-${r.product.id}`}>
                    <TD className="text-xs">{r.product.name}</TD>
                    <TD className="font-mono text-xs">{r.product.sku}</TD>
                    <TD className="text-right tabular-nums text-xs">{r.stock}</TD>
                    <TD className="text-right tabular-nums text-xs">{formatCurrency(r.value)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </ReportSection>
        </div>

        <ReportFooter
          businessName="DermaLand"
          reportName="Reporte de inventario"
          generatedAt={generatedAt}
        />
      </ReportLayout>
    </>
  );
}

function DetailRow({
  product,
  stock,
  value,
}: {
  product: Product;
  stock: number;
  value: number;
}) {
  const tone = stock === 0 ? "high" : stock < product.minStock ? "medium" : "low";
  const label = stock === 0 ? "Agotado" : stock < product.minStock ? "Bajo" : "OK";
  return (
    <TR>
      <TD className="text-sm">{product.name}</TD>
      <TD className="font-mono text-xs">{product.sku}</TD>
      <TD className="text-right tabular-nums">{stock}</TD>
      <TD className="text-right tabular-nums">{formatCurrency(value)}</TD>
      <TD>
        <ReportBadge tone={tone}>{label}</ReportBadge>
      </TD>
    </TR>
  );
}
