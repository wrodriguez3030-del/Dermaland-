"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui";
import { BarChart } from "@/components/ui/bar-chart";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import {
  ReportLayout,
  ReportHeader,
  ReportSummaryCards,
  ReportSection,
  ReportFooter,
  ReportEmptyState,
  PrintReportButton,
  type ReportKpi,
} from "@/components/reporting/report-layout";
import { useProformas } from "@/features/sales/proforma-store";
import { isInvoiceDocument } from "@/features/sales/document-label";
import { useProducts } from "@/features/products/product-store";
import {
  useBrandsList,
  useCategoriesList,
  useLaboratoriesList,
} from "@/features/products/catalog-store";
import { useAllLots } from "@/features/inventory/lot-store";
import { ExportExcelButton } from "@/components/reporting/export-excel-button";
import { buildProductsWorkbookSpec } from "@/features/products/products-report-excel";
import { mockCurrentUser } from "@/lib/mock-data/users";
import { formatCurrency, formatDateTime, daysUntil } from "@/lib/utils/format";

export default function ReporteProductosPage() {
  const allDocs = useProformas();
  const products = useProducts();
  const lots = useAllLots();

  const [generatedAt, setGeneratedAt] = React.useState("");
  React.useEffect(() => {
    setGeneratedAt(formatDateTime(new Date().toISOString()));
  }, []);

  // Ventas por producto (solo facturas, no proformas).
  const top = React.useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const p of allDocs) {
      if (!isInvoiceDocument(p) || p.status === "cancelled") continue;
      for (const it of p.items) {
        const e = map.get(it.productId) ?? { name: it.productName, qty: 0, revenue: 0 };
        e.qty += it.quantity;
        e.revenue += it.total;
        map.set(it.productId, e);
      }
    }
    return [...map.entries()]
      .map(([productId, v]) => ({ productId, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [allDocs]);

  // Stock vendible por producto.
  const stockByProduct = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lots) {
      if (l.status !== "available" || l.currentQuantity <= 0 || daysUntil(l.expiresAt) < 0)
        continue;
      map.set(l.productId, (map.get(l.productId) ?? 0) + l.currentQuantity);
    }
    return map;
  }, [lots]);

  const soldIds = React.useMemo(() => new Set(top.map((t) => t.productId)), [top]);
  const lowRotation = React.useMemo(
    () =>
      products
        .map((p) => ({ p, stock: stockByProduct.get(p.id) ?? 0 }))
        .filter(({ p, stock }) => stock > 0 && !soldIds.has(p.id))
        .sort((a, b) => b.stock - a.stock),
    [products, stockByProduct, soldIds],
  );

  const pag = usePagination(top);

  const unitsSold = top.reduce((s, t) => s + t.qty, 0);
  const revenue = top.reduce((s, t) => s + t.revenue, 0);

  const kpiItems: ReportKpi[] = [
    { label: "Productos vendidos", value: top.length, tone: "primary" },
    { label: "Unidades vendidas", value: unitsSold.toLocaleString("es-DO") },
    { label: "Ingreso por productos", value: formatCurrency(revenue) },
    { label: "Baja rotación", value: lowRotation.length, tone: lowRotation.length ? "warning" : "default" },
  ];

  // Excel profesional — mismos agregados que esta pantalla + catálogo.
  const brands = useBrandsList();
  const categories = useCategoriesList();
  const laboratories = useLaboratoriesList();
  const excelSpec = () => {
    const brandName = new Map(brands.map((b) => [b.id, b.name]));
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    const labName = new Map(laboratories.map((l) => [l.id, l.name]));
    return buildProductsWorkbookSpec(
      {
        products,
        top,
        lowRotation,
        stockByProduct,
        brandName: (id) => (id ? brandName.get(id) ?? "Sin marca" : "Sin marca"),
        categoryName: (id) =>
          id ? categoryName.get(id) ?? "Sin categoría" : "Sin categoría",
        laboratoryName: (id) =>
          id ? labName.get(id) ?? "Sin laboratorio" : "Sin laboratorio",
      },
      {
        title: "Reporte de productos",
        subtitle: "Más vendidos, catálogo, margen y baja rotación.",
        rangeLabel: "Todo",
        branchLabel: "Todas las sucursales",
        filtersLabel: "Sin filtros adicionales",
        generatedBy: mockCurrentUser.fullName,
        generatedAtLabel: formatDateTime(new Date().toISOString()),
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Reporte de productos"
        description="Más vendidos y productos con baja rotación."
        breadcrumbs={[{ label: "Reportes", href: "/reportes" }, { label: "Productos" }]}
        actions={
          <>
            <ExportExcelButton getSpec={excelSpec} fileSlug="Reporte_Productos" />
            <PrintReportButton />
          </>
        }
      />

      <ReportLayout>
        <ReportHeader
          businessName="DermaLand"
          title="Reporte de productos"
          subtitle="Productos más vendidos e inventario con baja rotación."
          generatedBy={mockCurrentUser.fullName}
          generatedAt={generatedAt}
        />

        <ReportSummaryCards items={kpiItems} columns={4} />

        {top.length > 0 && (
          <ReportSection title="Más vendidos">
            <BarChart
              data={top.slice(0, 12).map((t) => ({ label: t.name, value: t.revenue }))}
              formatter={formatCurrency}
            />
          </ReportSection>
        )}

        <ReportSection title="Detalle de ventas por producto" flush>
          {top.length === 0 ? (
            <ReportEmptyState message="Sin ventas de productos en el período." />
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Producto</TH>
                    <TH className="text-right">Cantidad</TH>
                    <TH className="text-right">Total</TH>
                  </TR>
                </THead>
                <TBody>
                  {pag.pageItems.map((t) => (
                    <TR key={t.productId}>
                      <TD className="text-sm">{t.name}</TD>
                      <TD className="text-right tabular-nums">{t.qty}</TD>
                      <TD className="text-right tabular-nums font-medium">
                        {formatCurrency(t.revenue)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <DataPagination
                page={pag.page}
                pageSize={pag.pageSize}
                total={pag.total}
                onPageChange={pag.setPage}
                onPageSizeChange={pag.setPageSize}
              />
            </>
          )}
        </ReportSection>

        <ReportSection title="Baja rotación (sin ventas)" tone="warning">
          {lowRotation.length === 0 ? (
            <ReportEmptyState message="Todos los productos en stock registran ventas." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Producto</TH>
                  <TH>SKU</TH>
                  <TH className="text-right">Stock</TH>
                </TR>
              </THead>
              <TBody>
                {lowRotation.slice(0, 100).map(({ p, stock }) => (
                  <TR key={p.id}>
                    <TD className="text-sm">{p.name}</TD>
                    <TD className="font-mono text-xs">{p.sku}</TD>
                    <TD className="text-right tabular-nums">{stock}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </ReportSection>

        <ReportFooter
          businessName="DermaLand"
          reportName="Reporte de productos"
          generatedAt={generatedAt}
        />
      </ReportLayout>
    </>
  );
}
