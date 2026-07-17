"use client";

import * as React from "react";
import Link from "next/link";
import { PackagePlus, Plus, Power, RotateCcw, Upload, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Select,
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
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import {
  SortableTH,
  useTableSort,
} from "@/components/ui/sortable-table-header";
import { useToast } from "@/components/ui/toast";
import { ProductImage } from "@/features/products/components/product-image";
import {
  deleteProductAnywhere,
  setProductActiveAnywhere,
  useProducts,
  PRODUCT_BACKEND,
} from "@/features/products/product-store";
import { useLaboratoriesList } from "@/features/products/catalog-store";
import {
  getBrandById,
  getCategoryById,
  mockBrands,
  mockCategories,
} from "@/lib/mock-data/catalog";
import {
  useAllLots,
  sellableStockForBranch,
  totalSellableStock,
} from "@/features/inventory/lot-store";
import { useActiveBranches } from "@/features/tenancy/branch-store";
import { BranchFilter, ALL_BRANCHES } from "@/features/tenancy/branch-filter";
import { NewLotModal } from "@/features/inventory/lot-modals";
import { formatCurrency } from "@/lib/utils/format";
import type { Product } from "@/types";

type StatusFilter = "all" | "active" | "inactive" | "low" | "out";

export default function ProductosPage() {
  const products = useProducts();
  const laboratories = useLaboratoriesList();
  const labNameById = React.useMemo(
    () => new Map(laboratories.map((l) => [l.id, l.name])),
    [laboratories],
  );
  const toast = useToast();
  const lots = useAllLots(); // ya es reactivo a cambios de inventario (local y supabase)
  const activeBranches = useActiveBranches();
  const activeBranchIds = React.useMemo(
    () => new Set(activeBranches.map((b) => b.id)),
    [activeBranches],
  );
  // Filtro de sucursal por página ("Todas" => "" => stock total). Reemplaza al
  // selector global del encabezado.
  const [branchFilter, setBranchFilter] = React.useState(ALL_BRANCHES);
  const branchId = branchFilter === ALL_BRANCHES ? "" : branchFilter;

  const [q, setQ] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [addStockProduct, setAddStockProduct] = React.useState<{ id: string; name: string } | null>(null);

  // Mapa de stock total vendible por producto (todas las sucursales activas).
  const stockMap = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const pid of [...new Set(lots.map((l) => l.productId))]) {
      m.set(pid, totalSellableStock(lots, pid, activeBranchIds));
    }
    return m;
  }, [lots, activeBranchIds]);

  // Comparadores dependientes del stock: memoizados sobre stockMap para que
  // el orden por stock se recalcule al cambiar el inventario (antes usaban un
  // Map de módulo mutado en render, que podía dejar el orden desactualizado).
  const comparators = React.useMemo(() => {
    const stockOf = (id: string) => stockMap.get(id) ?? 0;
    return {
      name: (a: Product, b: Product) => a.name.localeCompare(b.name),
      sku: (a: Product, b: Product) => a.sku.localeCompare(b.sku),
      brand: (a: Product, b: Product) => {
        const an = getBrandById(a.brandId)?.name ?? "";
        const bn = getBrandById(b.brandId)?.name ?? "";
        return an.localeCompare(bn);
      },
      stock: (a: Product, b: Product) => stockOf(a.id) - stockOf(b.id),
      price: (a: Product, b: Product) => a.price - b.price,
    };
  }, [stockMap]);

  const hasFilters =
    q.trim() !== "" || brand !== "" || category !== "" || status !== "all";

  const clearFilters = () => {
    setQ("");
    setBrand("");
    setCategory("");
    setStatus("all");
  };

  const filtered = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    return products.filter((p) => {
      if (term) {
        const hay =
          p.name.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term) ||
          (p.barcode ?? "").toLowerCase().includes(term) ||
          (p.keywords ?? []).some((k) => k.toLowerCase().includes(term));
        if (!hay) return false;
      }
      if (brand && p.brandId !== brand) return false;
      if (category && p.categoryId !== category) return false;
      if (status !== "all") {
        const stock = stockMap.get(p.id) ?? 0;
        if (status === "active" && !p.active) return false;
        if (status === "inactive" && p.active) return false;
        if (status === "low" && !(stock <= p.minStock)) return false;
        if (status === "out" && stock > 0) return false;
      }
      return true;
    });
  }, [products, q, brand, category, status, stockMap]);

  const { sort, sorted, toggle } = useTableSort(
    filtered,
    "name",
    "asc",
    comparators,
  );

  const total = products.length;
  const showing = sorted.length;
  // Paginación reutilizable; vuelve a la página 1 al cambiar filtros/búsqueda.
  const pag = usePagination(sorted, {
    resetKey: `${q}|${brand}|${category}|${status}`,
  });

  return (
    <>
      <PageHeader
        title="Productos"
        description={
          hasFilters
            ? `Mostrando ${showing} de ${total} productos`
            : `${total} productos en el catálogo`
        }
        breadcrumbs={[{ label: "Productos" }]}
        actions={
          <>
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4" />
              Importar CSV
            </Button>
            <Link href="/productos/nuevo">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Nuevo producto
              </Button>
            </Link>
          </>
        }
      />

      <div className={`mb-4 rounded-xl border px-4 py-2.5 text-xs ${PRODUCT_BACKEND === "local" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
        {PRODUCT_BACKEND === "local"
          ? "Los cambios se guardan en este equipo (modo demo, sin Supabase)."
          : "Los productos son una fuente única compartida (Supabase). Los cambios se ven en todos los equipos."}
      </div>

      <FilterBar className="mb-4">
        <SearchInput
          placeholder="Buscar por nombre, SKU o código de barras…"
          containerClassName="flex-1 min-w-[260px]"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={brand} onChange={(e) => setBrand(e.target.value)}>
          <option value="">Todas las marcas</option>
          {mockBrands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Todas las categorías</option>
          {mockCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="all">Estado: todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="low">Bajo stock</option>
          <option value="out">Sin stock</option>
        </Select>
        <BranchFilter value={branchFilter} onChange={setBranchFilter} />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4" />
            Limpiar filtros
          </Button>
        )}
      </FilterBar>

      {/* Móvil: tarjetas */}
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white md:hidden">
        {sorted.length === 0 && (
          <div className="px-4 py-10 text-center text-sm opacity-60">
            Sin productos que coincidan.
          </div>
        )}
        {pag.pageItems.map((p) => {
          const stock = stockMap.get(p.id) ?? 0;
          const lowStock = stock <= p.minStock;
          return (
            <Link
              key={p.id}
              href={`/productos/${p.id}`}
              className="flex items-center gap-3 px-3 py-3 active:bg-black/[0.03]"
            >
              <ProductImage
                src={p.imageUrl}
                alt={p.imageAlt ?? p.name}
                name={p.name}
                size={44}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                <div className="font-mono text-xs opacity-60">{p.sku}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {p.active ? (
                    <Badge tone="success">Activo</Badge>
                  ) : (
                    <Badge tone="neutral">Inactivo</Badge>
                  )}
                  {stock === 0 ? (
                    <Badge tone="danger">Agotado</Badge>
                  ) : (
                    lowStock && <Badge tone="warning">Bajo stock</Badge>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-bold tabular-nums text-[color:var(--brand-accent)]">
                  {formatCurrency(p.price)}
                </div>
                <div className="text-[10px] opacity-50">
                  {stock} u · mín {p.minStock}
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
            <TH className="w-[60px]"></TH>
            <SortableTH sortKey="name" state={sort} onClick={toggle}>
              Producto
            </SortableTH>
            <SortableTH sortKey="brand" state={sort} onClick={toggle}>
              Marca
            </SortableTH>
            <TH>Categoría</TH>
            <TH>Laboratorio</TH>
            <SortableTH
              sortKey="stock"
              state={sort}
              onClick={toggle}
              align="right"
            >
              Stock
            </SortableTH>
            <SortableTH
              sortKey="price"
              state={sort}
              onClick={toggle}
              align="right"
            >
              Precio
            </SortableTH>
            <TH>Estado</TH>
            <TH className="text-right pr-4">Acciones</TH>
          </TR>
        </THead>
        <TBody>
          {sorted.length === 0 && (
            <TR>
              <TD colSpan={9}>
                <div className="py-12 text-center">
                  <p className="text-sm font-medium">
                    {total === 0
                      ? "Aún no hay productos en el catálogo."
                      : "Ningún producto coincide con los filtros."}
                  </p>
                  <p className="mt-1 text-xs opacity-60">
                    {total === 0
                      ? "Crea el primero con “Nuevo producto” o importa un CSV."
                      : "Ajusta o limpia los filtros para ver más resultados."}
                  </p>
                  {hasFilters && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={clearFilters}
                    >
                      <X className="h-4 w-4" />
                      Limpiar filtros
                    </Button>
                  )}
                </div>
              </TD>
            </TR>
          )}
          {pag.pageItems.map((p) => {
            const brandObj = getBrandById(p.brandId);
            const category = getCategoryById(p.categoryId);
            const stock = stockMap.get(p.id) ?? 0;
            const stockHere = branchId
              ? sellableStockForBranch(lots, p.id, branchId)
              : stock;
            const lowStock = stock <= p.minStock;
            const noStockHere = branchId && stockHere === 0 && stock > 0;
            return (
              <TR key={p.id}>
                <TD>
                  <Link
                    href={`/productos/${p.id}`}
                    aria-label={p.imageAlt ?? p.name}
                  >
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
                    className="block min-w-0 hover:text-[color:var(--brand-accent)]"
                  >
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs opacity-60 font-mono">
                      {p.sku}
                      {p.barcode && (
                        <span className="ml-2 opacity-60">· {p.barcode}</span>
                      )}
                    </div>
                  </Link>
                </TD>
                <TD>{brandObj?.name ?? "—"}</TD>
                <TD>
                  <span className="text-xs opacity-80">
                    {category?.name ?? "—"}
                  </span>
                </TD>
                <TD>
                  <span className="text-xs opacity-80">
                    {labNameById.get(p.laboratoryId ?? "") ?? "—"}
                  </span>
                </TD>
                <TD className="text-right tabular-nums">
                  {branchId ? (
                    <div>
                      <span className={stockHere === 0 && stock > 0 ? "text-amber-700 font-semibold" : stockHere === 0 ? "text-rose-600 font-semibold" : ""}>
                        {stockHere} aquí
                      </span>
                      <span className="text-xs opacity-50"> · {stock} total · mín {p.minStock}</span>
                    </div>
                  ) : (
                    <div>
                      <span className={lowStock ? "text-amber-700 font-semibold" : ""}>{stock}</span>
                      <span className="text-xs opacity-50"> total · mín {p.minStock}</span>
                    </div>
                  )}
                </TD>
                <TD className="text-right tabular-nums">
                  {formatCurrency(p.price)}
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {p.active ? (
                      <Badge tone="success">Activo</Badge>
                    ) : (
                      <Badge tone="neutral">Inactivo</Badge>
                    )}
                    {lowStock && <Badge tone="warning">Bajo stock</Badge>}
                    {stock === 0 && <Badge tone="danger">Agotado</Badge>}
                    {stock > 0 && noStockHere && <Badge tone="warning">Sin stock aquí</Badge>}
                    {p.requiresPrescription && (
                      <Badge tone="purple">Receta</Badge>
                    )}
                    {p.controlled && <Badge tone="danger">Controlado</Badge>}
                  </div>
                </TD>
                <TD className="pr-4">
                  <RowActions
                    viewHref={`/productos/${p.id}`}
                    editHref={`/productos/${p.id}/editar`}
                    onDelete={async () => {
                      const res = await deleteProductAnywhere(p.id);
                      if (!res.ok) toast.error(res.error ?? "No se pudo eliminar.");
                      else toast.success("Producto eliminado correctamente.");
                    }}
                    entityName={p.name}
                    customActions={[
                      {
                        label: "Agregar stock",
                        icon: PackagePlus,
                        onClick: () => setAddStockProduct({ id: p.id, name: p.name }),
                      },
                      p.active
                        ? {
                            label: "Inactivar",
                            icon: Power,
                            onClick: async () => {
                              const res = await setProductActiveAnywhere(p.id, false);
                              if (!res.ok) toast.error(res.error ?? "No se pudo inactivar.");
                              else toast.success(`${p.name} inactivado.`);
                            },
                            confirm: {
                              title: "Inactivar producto",
                              message: `¿Inactivar ${p.name}? Dejará de venderse pero conserva su historial.`,
                            },
                          }
                        : {
                            label: "Reactivar",
                            icon: RotateCcw,
                            onClick: async () => {
                              const res = await setProductActiveAnywhere(p.id, true);
                              if (!res.ok) toast.error(res.error ?? "No se pudo reactivar.");
                              else toast.success(`${p.name} reactivado.`);
                            },
                          },
                    ]}
                  />
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      </div>

      {showing > 0 && (
        <DataPagination
          page={pag.page}
          pageSize={pag.pageSize}
          total={pag.total}
          onPageChange={pag.setPage}
          onPageSizeChange={pag.setPageSize}
        />
      )}
      {addStockProduct && (
        <NewLotModal
          open={true}
          onClose={() => setAddStockProduct(null)}
          productId={addStockProduct.id}
          productName={addStockProduct.name}
          defaultBranchId={branchId || undefined}
          requireExpiry={true}
        />
      )}
      <toast.Toast />
    </>
  );
}
