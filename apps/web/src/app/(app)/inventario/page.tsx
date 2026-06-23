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
import { StatCard } from "@/components/ui/stat-card";
import { Boxes, AlertTriangle, PackagePlus, ShieldAlert, X, Layers } from "lucide-react";
import { useProducts } from "@/features/products/product-store";
import {
  useBrandsList,
  useCategoriesList,
  useLaboratoriesList,
} from "@/features/products/catalog-store";
import { useAllLots } from "@/features/inventory/lot-store";
import {
  getInventoryRows,
  getInventoryStockSummary,
  type InventoryRow,
} from "@/features/inventory/inventory-stock-engine";
import {
  useCurrentBranch,
  useBranches,
  getBranchDisplayName,
} from "@/features/tenancy/branch-store";
import { NewLotModal } from "@/features/inventory/lot-modals";
import { formatCurrency } from "@/lib/utils/format";
import type { Product } from "@/types";

type StatusFilter =
  | "all"
  | "con-stock"
  | "sin-stock"
  | "bajo-minimo"
  | "por-vencer"
  | "vencidos"
  | "cuarentena"
  | "recall";

interface Row {
  product: Product;
  brandName: string;
  categoryName: string;
  labName: string;
  inv: InventoryRow;
  lotNumbers: string;
}

function InventarioContent() {
  const params = useSearchParams();
  const urlBranch = params.get("branch") ?? "";
  const { branchId: selectedBranchId } = useCurrentBranch();
  // La sucursal efectiva es la del deep-link (?branch=) o, por defecto, la
  // seleccionada arriba. NUNCA se muestra el UUID.
  const effectiveBranch = urlBranch || selectedBranchId || "";
  const branches = useBranches();
  const branchName =
    branches.find((b) => b.id === effectiveBranch)?.name ??
    getBranchDisplayName(effectiveBranch, "Sucursal seleccionada");

  const products = useProducts();
  // Lotes reales directos (NUNCA `onlyActiveBranches`, que lee el store mock
  // síncrono y borra los lotes de Supabase). El filtro por sucursal lo aplica el
  // motor con el `branchId` seleccionado — misma verdad que POS y Productos.
  const lots = useAllLots();
  const brands = useBrandsList();
  const categories = useCategoriesList();
  const laboratories = useLaboratoriesList();

  const brandName = React.useMemo(() => {
    const m = new Map(brands.map((b) => [b.id, b.name]));
    return (id?: string) => (id ? m.get(id) ?? "—" : "—");
  }, [brands]);
  const categoryName = React.useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c.name]));
    return (id?: string) => (id ? m.get(id) ?? "—" : "—");
  }, [categories]);
  const labName = React.useMemo(() => {
    const m = new Map(laboratories.map((l) => [l.id, l.name]));
    return (id?: string) => (id ? m.get(id) ?? "—" : "—");
  }, [laboratories]);

  // Motor único: mismas filas de stock que usan POS/Productos (por sucursal).
  const allRows: Row[] = React.useMemo(
    () =>
      getInventoryRows(lots, products, effectiveBranch).map((r) => ({
        product: r.product,
        brandName: brandName(r.product.brandId),
        categoryName: categoryName(r.product.categoryId),
        labName: labName(r.product.laboratoryId),
        inv: r.inv,
        lotNumbers: r.lotNumbers.join(" "),
      })),
    [lots, products, effectiveBranch, brandName, categoryName, labName],
  );

  // ── Filtros ────────────────────────────────────────────────────────────────
  const [search, setSearch] = React.useState("");
  const [brandFilter, setBrandFilter] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [labFilter, setLabFilter] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("all");

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (brandFilter && r.product.brandId !== brandFilter) return false;
      if (categoryFilter && r.product.categoryId !== categoryFilter) return false;
      if (labFilter && r.product.laboratoryId !== labFilter) return false;
      if (status !== "all") {
        const { sellableStock, soon, expired, quarantine, recalled } = r.inv;
        if (status === "con-stock" && sellableStock <= 0) return false;
        if (status === "sin-stock" && sellableStock > 0) return false;
        if (status === "bajo-minimo" && sellableStock > r.product.minStock) return false;
        if (status === "por-vencer" && soon <= 0) return false;
        if (status === "vencidos" && !expired) return false;
        if (status === "cuarentena" && !quarantine) return false;
        if (status === "recall" && !recalled) return false;
      }
      if (q) {
        const hay =
          `${r.product.name} ${r.product.sku} ${r.brandName} ${r.categoryName} ${r.labName} ${r.lotNumbers}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, search, brandFilter, categoryFilter, labFilter, status]);

  // ── Ordenamiento (por defecto STOCK mayor→menor) ─────────────────────────────
  const comparators = React.useMemo(
    () => ({
      producto: (a: Row, b: Row) => a.product.name.localeCompare(b.product.name),
      marca: (a: Row, b: Row) => a.brandName.localeCompare(b.brandName),
      categoria: (a: Row, b: Row) => a.categoryName.localeCompare(b.categoryName),
      laboratorio: (a: Row, b: Row) => a.labName.localeCompare(b.labName),
      lotes: (a: Row, b: Row) => a.inv.lotCount - b.inv.lotCount,
      stock: (a: Row, b: Row) => a.inv.sellableStock - b.inv.sellableStock,
      min: (a: Row, b: Row) => a.product.minStock - b.product.minStock,
      valor: (a: Row, b: Row) => a.inv.value - b.inv.value,
    }),
    [],
  );
  const { sort, sorted, toggle } = useTableSort(filtered, "stock", "desc", comparators);

  // ── Totales (motor único, sobre lo filtrado) ─────────────────────────────────
  const { totalUnits, totalValue, lowStockCount, noStockCount } =
    getInventoryStockSummary(filtered);

  const [addStockProduct, setAddStockProduct] = React.useState<{
    id: string;
    name: string;
  } | null>(null);

  return (
    <>
      <PageHeader
        title="Stock actual"
        description="Stock disponible por producto en la sucursal seleccionada. Para detalle por lote, usa Stock por lote."
        breadcrumbs={[{ label: "Inventario" }]}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--brand-primary)]/30 bg-[color:var(--brand-primary)]/5 px-4 py-2.5 text-sm">
        <span>
          Sucursal actual: <strong>{branchName}</strong>
        </span>
        {urlBranch && (
          <Link href="/inventario">
            <Button variant="ghost" size="sm">
              <X className="h-4 w-4" /> Quitar filtro de sucursal
            </Button>
          </Link>
        )}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Unidades disponibles" value={totalUnits} icon={Boxes} tone="primary" />
        <StatCard
          label="Valor de inventario"
          value={formatCurrency(totalValue)}
          icon={Boxes}
          hint="Costo por lotes vendibles"
        />
        <StatCard
          label="Productos en o bajo mínimo"
          value={lowStockCount}
          icon={AlertTriangle}
          tone="warning"
        />
        <StatCard label="Sin stock" value={noStockCount} icon={ShieldAlert} tone="danger" />
      </div>

      {/* Filtros */}
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <SearchInput
          placeholder="Buscar producto, SKU, lote, marca…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          containerClassName="lg:col-span-2"
        />
        <Select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
          <option value="">Todas las marcas</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Select value={labFilter} onChange={(e) => setLabFilter(e.target.value)}>
          <option value="">Todos los laboratorios</option>
          {laboratories.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="lg:col-span-1"
        >
          <option value="all">Todos los estados</option>
          <option value="con-stock">Con stock</option>
          <option value="sin-stock">Sin stock</option>
          <option value="bajo-minimo">Bajo mínimo</option>
          <option value="por-vencer">Por vencer</option>
          <option value="vencidos">Vencidos</option>
          <option value="cuarentena">Cuarentena</option>
          <option value="recall">Recall</option>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH className="w-[60px]"></TH>
                <SortableTH sortKey="producto" state={sort} onClick={toggle}>Producto</SortableTH>
                <SortableTH sortKey="marca" state={sort} onClick={toggle}>Marca</SortableTH>
                <SortableTH sortKey="categoria" state={sort} onClick={toggle}>Categoría</SortableTH>
                <SortableTH sortKey="laboratorio" state={sort} onClick={toggle}>Laboratorio</SortableTH>
                <SortableTH sortKey="lotes" state={sort} onClick={toggle} align="right">Lotes</SortableTH>
                <SortableTH sortKey="stock" state={sort} onClick={toggle} align="right">Stock</SortableTH>
                <SortableTH sortKey="min" state={sort} onClick={toggle} align="right">Mín / Máx</SortableTH>
                <SortableTH sortKey="valor" state={sort} onClick={toggle} align="right">Valor</SortableTH>
                <TH>Alertas</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {sorted.length === 0 && (
                <TR>
                  <TD colSpan={11} className="py-10 text-center text-sm opacity-60">
                    {products.length === 0
                      ? "Esta sucursal no tiene inventario cargado."
                      : "No hay productos que coincidan con los filtros."}
                  </TD>
                </TR>
              )}
              {sorted.map(({ product: p, brandName, categoryName, labName, inv }) => {
                const lowStock = inv.sellableStock <= p.minStock;
                const noStock = inv.sellableStock === 0;
                return (
                  <TR key={p.id}>
                    <TD>
                      <Link href={`/productos/${p.id}`} aria-label={p.name}>
                        <ProductImage
                          src={p.imageUrl ?? undefined}
                          alt={p.imageAlt ?? p.name}
                          name={p.name}
                          size={44}
                        />
                      </Link>
                    </TD>
                    <TD>
                      <Link href={`/productos/${p.id}`} className="block hover:text-[color:var(--brand-accent)]">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs opacity-60 font-mono">{p.sku}</div>
                      </Link>
                    </TD>
                    <TD className="text-sm opacity-70">{brandName}</TD>
                    <TD className="text-sm opacity-70">{categoryName}</TD>
                    <TD className="text-sm opacity-70">{labName}</TD>
                    <TD className="text-right tabular-nums">{inv.lotCount}</TD>
                    <TD className="text-right tabular-nums font-medium">{inv.sellableStock}</TD>
                    <TD className="text-right tabular-nums text-xs opacity-70">
                      {p.minStock} / {p.maxStock}
                    </TD>
                    <TD className="text-right tabular-nums text-sm">{formatCurrency(inv.value)}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {noStock && <Badge tone="danger">Sin stock</Badge>}
                        {!noStock && lowStock && <Badge tone="warning">Bajo mínimo</Badge>}
                        {inv.soon > 0 && <Badge tone="warning">Por vencer</Badge>}
                        {inv.expired && <Badge tone="danger">Vencido</Badge>}
                        {inv.quarantine && <Badge tone="warning">Cuarentena</Badge>}
                        {inv.recalled && <Badge tone="danger">Recall</Badge>}
                      </div>
                    </TD>
                    <TD className="pr-4">
                      <RowActions
                        viewHref={`/productos/${p.id}`}
                        editHref={`/productos/${p.id}/editar`}
                        canDelete={false}
                        customActions={[
                          {
                            label: "Agregar stock",
                            icon: PackagePlus,
                            onClick: () => setAddStockProduct({ id: p.id, name: p.name }),
                          },
                          {
                            label: "Ver lotes",
                            icon: Layers,
                            href: `/inventario/por-lote?productId=${p.id}`,
                          },
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

      {addStockProduct && (
        <NewLotModal
          open={true}
          onClose={() => setAddStockProduct(null)}
          productId={addStockProduct.id}
          productName={addStockProduct.name}
          defaultBranchId={effectiveBranch || undefined}
          requireExpiry={true}
        />
      )}
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
