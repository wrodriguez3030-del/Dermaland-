"use client";

import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
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
  useProducts,
} from "@/features/products/product-store";
import {
  getBrandById,
  getCategoryById,
  mockBrands,
  mockCategories,
  totalStockForProduct,
} from "@/lib/mock-data/catalog";
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

export default function ProductosPage() {
  const products = useProducts();
  const toast = useToast();
  const { sort, sorted, toggle } = useTableSort(
    products,
    "name",
    "asc",
    comparators,
  );

  return (
    <>
      <PageHeader
        title="Productos"
        description={`Catálogo del business · ${products.length} productos visibles del seed (1342 totales en CSV inicial)`}
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
        />
        <select className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm">
          <option>Todas las marcas</option>
          {mockBrands.map((b) => (
            <option key={b.id}>{b.name}</option>
          ))}
        </select>
        <select className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm">
          <option>Todas las categorías</option>
          {mockCategories.map((c) => (
            <option key={c.id}>{c.name}</option>
          ))}
        </select>
        <select className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm">
          <option>Estado: todos</option>
          <option>Activos</option>
          <option>Inactivos</option>
          <option>Bajo stock</option>
          <option>Sin stock</option>
        </select>
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
          {sorted.map((p) => {
            const brand = getBrandById(p.brandId);
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
                <TD>{brand?.name ?? "—"}</TD>
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
