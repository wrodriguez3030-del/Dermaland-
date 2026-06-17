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
  availableStock as totalStockForProduct,
  useInventoryTick,
} from "@/features/inventory/lot-store";
import { formatCurrency } from "@/lib/utils/format";
import type { Product } from "@/types";

const comparators = {
  name: (a: Product, b: Product) => a.name.localeCompare(b.name),
  sku: (a: Product, b: Product) => a.sku.localeCompare(b.sku),
  brand: (a: Product, b: Product) => {
    const an = getBrandById(a.brandId)?.name ?? "";
    const bn = getBrandById(b.brandId)?.name ?? "";
    return an.localeCompare(bn);
  },
  stock: (a: Product, b: Product) =>
    totalStockForProduct(a.id) - totalStockForProduct(b.id),
  price: (a: Product, b: Product) => a.price - b.price,
};

type StatusFilter = "all" | "active" | "inactive" | "low" | "out";

export default function ProductosPage() {
  const products = useProducts();
  const toast = useToast();
  const tick = useInventoryTick(); // refleja cambios de stock por lotes

  const [q, setQ] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("all");

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
          (p.barcode ?? "").toLowerCase().includes(term);
        if (!hay) return false;
      }
      if (brand && p.brandId !== brand) return false;
      if (category && p.categoryId !== category) return false;
      if (status !== "all") {
        const stock = totalStockForProduct(p.id);
        if (status === "active" && !p.active) return false;
        if (status === "inactive" && p.active) return false;
        if (status === "low" && !(stock <= p.minStock)) return false;
        if (status === "out" && stock > 0) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, q, brand, category, status, tick]);

  const { sort, sorted, toggle } = useTableSort(
    filtered,
    "name",
    "asc",
    comparators,
  );

  const total = products.length;
  const showing = sorted.length;

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
          {sorted.map((p) => {
            const brandObj = getBrandById(p.brandId);
            const category = getCategoryById(p.categoryId);
            const stock = totalStockForProduct(p.id);
            const lowStock = stock <= p.minStock;
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
                  <span className={lowStock ? "text-amber-700 font-semibold" : ""}>
                    {stock}
                  </span>
                  <span className="text-xs opacity-50"> / mín {p.minStock}</span>
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
      <toast.Toast />
    </>
  );
}
