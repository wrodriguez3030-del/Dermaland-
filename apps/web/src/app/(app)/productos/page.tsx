"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Power, RotateCcw, Upload, X } from "lucide-react";
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
import {
  SortableTH,
  useTableSort,
} from "@/components/ui/sortable-table-header";
import { useToast } from "@/components/ui/toast";
import { ProductImage } from "@/features/products/components/product-image";
import {
  deleteProduct,
  updateProduct,
  useProducts,
} from "@/features/products/product-store";
import {
  getBrandById,
  getCategoryById,
  mockBrands,
  mockCategories,
} from "@/lib/mock-data/catalog";
import {
  useAllLots,
  useInventoryTick,
  sellableStockForBranch,
  totalSellableStock,
} from "@/features/inventory/lot-store";
import {
  useCurrentBranch,
  listActiveBranchIds,
} from "@/features/tenancy/branch-store";
import { formatCurrency } from "@/lib/utils/format";
import type { Product } from "@/types";

// Lookup de stock compartido con los comparadores (se sincroniza en cada
// render con el mapa precalculado, para no recorrer todos los lotes por fila).
const stockLookup = new Map<string, number>();
const stockOf = (id: string) => stockLookup.get(id) ?? 0;

const comparators = {
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

type StatusFilter = "all" | "active" | "inactive" | "low" | "out";
const PAGE_SIZE = 50;

export default function ProductosPage() {
  const products = useProducts();
  const toast = useToast();
  const tick = useInventoryTick(); // refleja cambios de stock por lotes (modo local)
  const lots = useAllLots();
  const { branchId } = useCurrentBranch();
  const activeBranchIds = React.useMemo(() => listActiveBranchIds(), []);

  const [q, setQ] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [page, setPage] = React.useState(0);

  // Mapa de stock total vendible por producto (todas las sucursales activas).
  // Se recalcula cuando cambian los lotes (tick en modo local, lista en modo supabase).
  const stockMap = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const pid of [...new Set(lots.map((l) => l.productId))]) {
      m.set(pid, totalSellableStock(lots, pid, activeBranchIds));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots, tick, activeBranchIds]);
  // Sincronizar el lookup que usan los comparadores.
  stockLookup.clear();
  stockMap.forEach((v, k) => stockLookup.set(k, v));

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
  const pageCount = Math.max(1, Math.ceil(showing / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Volver a la primera página cuando cambian filtros/orden.
  React.useEffect(() => {
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, brand, category, status, sort.key, sort.direction]);

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
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4" />
            Limpiar filtros
          </Button>
        )}
      </FilterBar>

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
              <TD colSpan={8}>
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
          {paged.map((p) => {
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
                <TD className="text-right tabular-nums">
                  <div>
                    <span className={lowStock ? "text-amber-700 font-semibold" : ""}>
                      {stock}
                    </span>
                    <span className="text-xs opacity-50"> total · mín {p.minStock}</span>
                  </div>
                  {branchId && (
                    <div className={`text-xs ${noStockHere ? "text-rose-600 font-medium" : "opacity-60"}`}>
                      {stockHere} en esta sucursal
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
                    {noStockHere && <Badge tone="danger">Sin stock en esta sucursal</Badge>}
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
                    onDelete={() => {
                      deleteProduct(p.id);
                      toast.success("Producto eliminado correctamente.");
                    }}
                    entityName={p.name}
                    customActions={[
                      p.active
                        ? {
                            label: "Inactivar",
                            icon: Power,
                            onClick: () => {
                              updateProduct(p.id, { active: false });
                              toast.success(`${p.name} inactivado.`);
                            },
                            confirm: {
                              title: "Inactivar producto",
                              message: `¿Inactivar ${p.name}? Dejará de venderse pero conserva su historial.`,
                            },
                          }
                        : {
                            label: "Reactivar",
                            icon: RotateCcw,
                            onClick: () => {
                              updateProduct(p.id, { active: true });
                              toast.success(`${p.name} reactivado.`);
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

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="opacity-60">
            Página {safePage + 1} de {pageCount} · {showing} productos
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
      <toast.Toast />
    </>
  );
}
