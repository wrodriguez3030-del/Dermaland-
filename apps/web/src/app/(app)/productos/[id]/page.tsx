"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import {
  getBrandById,
  getCategoryById,
  getLaboratoryById,
  getLotsByProduct,
  totalStockForProduct,
} from "@/lib/mock-data/catalog";
import { mockInventoryMovements } from "@/lib/mock-data/inventory-movements";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  daysUntil,
} from "@/lib/utils/format";
import { lotStatusBadge } from "@/features/inventory/lot-badges";
import { ProductImage } from "@/features/products/components/product-image";
import { useProduct } from "@/features/products/product-store";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const product = useProduct(id);

  if (!product) {
    return (
      <>
        <PageHeader
          title="Producto no encontrado"
          breadcrumbs={[
            { label: "Productos", href: "/productos" },
            { label: id },
          ]}
        />
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm opacity-70">
              No encontramos el producto con id <code>{id}</code>.
            </p>
            <Link
              href="/productos"
              className="mt-4 inline-block text-sm text-[color:var(--brand-accent)] hover:underline"
            >
              ← Volver a productos
            </Link>
          </CardContent>
        </Card>
      </>
    );
  }

  const brand = getBrandById(product.brandId);
  const category = getCategoryById(product.categoryId);
  const laboratory = getLaboratoryById(product.laboratoryId);
  const lots = getLotsByProduct(product.id);
  const stock = totalStockForProduct(product.id);
  const movements = mockInventoryMovements
    .filter((m) => m.productId === product.id)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return (
    <>
      <Link
        href="/productos"
        className="mb-4 inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
      >
        <ArrowLeft className="h-3 w-3" /> Volver a productos
      </Link>

      <PageHeader
        title={product.name}
        description={`SKU ${product.sku}${
          product.barcode ? ` · Barcode ${product.barcode}` : ""
        }`}
        breadcrumbs={[
          { label: "Productos", href: "/productos" },
          { label: product.sku },
        ]}
        actions={
          <>
            <Link href={`/productos/${product.id}/editar`}>
              <Button variant="outline" size="sm">
                Editar
              </Button>
            </Link>
            <Button size="sm">Nuevo lote</Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardContent className="flex aspect-square items-center justify-center p-4">
            <ProductImage
              src={product.imageUrl}
              alt={product.imageAlt ?? product.name}
              name={product.name}
              size={220}
              rounded="xl"
              className="border-0"
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {brand && <Badge tone="primary">{brand.name}</Badge>}
              {category && <Badge tone="info">{category.name}</Badge>}
              {product.requiresPrescription && (
                <Badge tone="purple">Requiere receta</Badge>
              )}
              {product.controlled && <Badge tone="danger">Controlado</Badge>}
              <Badge tone={product.active ? "success" : "neutral"}>
                {product.active ? "Activo" : "Inactivo"}
              </Badge>
            </div>

            <p className="mt-3 text-sm opacity-80">
              {product.description ?? "Sin descripción."}
            </p>

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
              <DataPoint label="Forma">
                {product.pharmaceuticalForm ?? "—"}
              </DataPoint>
              <DataPoint label="Presentación">
                {product.presentation ?? "—"}
              </DataPoint>
              <DataPoint label="Principio activo">
                {product.activeIngredient ?? "—"}
              </DataPoint>
              <DataPoint label="Concentración">
                {product.concentration ?? "—"}
              </DataPoint>
              <DataPoint label="Laboratorio">{laboratory?.name ?? "—"}</DataPoint>
              <DataPoint label="Temperatura">
                {product.storageTemperature ?? "Ambiente"}
              </DataPoint>
              <DataPoint label="Stock total disponible">
                <span className="font-semibold">{stock}</span> {product.unit}
              </DataPoint>
              <DataPoint label="Mín / Máx">
                {product.minStock} / {product.maxStock}
              </DataPoint>
              <DataPoint label="Precio">
                <span className="font-semibold">
                  {formatCurrency(product.price)}
                </span>
                <span className="ml-1 text-xs opacity-60">
                  ITBIS {product.itbisRate}%
                </span>
              </DataPoint>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="lots">
        <TabsList>
          <TabsTrigger value="lots">Lotes ({lots.length})</TabsTrigger>
          <TabsTrigger value="movements">Movimientos</TabsTrigger>
          <TabsTrigger value="sales">Ventas</TabsTrigger>
        </TabsList>

        <TabsContent value="lots">
          <Card>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Lote</TH>
                    <TH>Almacén</TH>
                    <TH className="text-right">Inicial</TH>
                    <TH className="text-right">Actual</TH>
                    <TH>Vence</TH>
                    <TH>Días</TH>
                    <TH>Estado</TH>
                    <TH className="text-right">Costo</TH>
                  </TR>
                </THead>
                <TBody>
                  {lots.length === 0 && (
                    <TR>
                      <TD colSpan={8} className="py-8 text-center text-sm opacity-60">
                        Sin lotes registrados aún. Los lotes se crean al recibir
                        órdenes de compra (Fase 3).
                      </TD>
                    </TR>
                  )}
                  {lots.map((lot) => {
                    const days = daysUntil(lot.expiresAt);
                    const tone =
                      days < 0
                        ? "danger"
                        : days < 30
                          ? "danger"
                          : days < 90
                            ? "warning"
                            : "neutral";
                    return (
                      <TR key={lot.id}>
                        <TD>
                          <div className="font-mono text-xs">{lot.lotNumber}</div>
                        </TD>
                        <TD className="text-xs opacity-70">{lot.warehouseId}</TD>
                        <TD className="text-right tabular-nums">
                          {lot.initialQuantity}
                        </TD>
                        <TD className="text-right tabular-nums font-medium">
                          {lot.currentQuantity}
                        </TD>
                        <TD>{formatDate(lot.expiresAt)}</TD>
                        <TD>
                          <Badge tone={tone}>
                            {days < 0
                              ? `${Math.abs(days)} d. venc.`
                              : `${days} d.`}
                          </Badge>
                        </TD>
                        <TD>{lotStatusBadge(lot.status)}</TD>
                        <TD className="text-right tabular-nums text-xs">
                          {formatCurrency(lot.unitCost)}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements">
          <Card>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Fecha</TH>
                    <TH>Tipo</TH>
                    <TH className="text-right">Cantidad</TH>
                    <TH>Lote</TH>
                    <TH>Motivo / Ref.</TH>
                    <TH>Usuario</TH>
                  </TR>
                </THead>
                <TBody>
                  {movements.map((m) => (
                    <TR key={m.id}>
                      <TD className="text-xs">{formatDateTime(m.createdAt)}</TD>
                      <TD>
                        <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[11px]">
                          {m.type}
                        </code>
                      </TD>
                      <TD
                        className={`text-right tabular-nums font-medium ${
                          m.quantity < 0 ? "text-rose-700" : "text-emerald-700"
                        }`}
                      >
                        {m.quantity > 0 ? "+" : ""}
                        {m.quantity}
                      </TD>
                      <TD className="text-xs font-mono">{m.lotId ?? "—"}</TD>
                      <TD className="text-xs opacity-80">
                        {m.reason ?? m.reference ?? "—"}
                      </TD>
                      <TD className="text-xs">{m.userName}</TD>
                    </TR>
                  ))}
                  {movements.length === 0 && (
                    <TR>
                      <TD colSpan={6} className="py-8 text-center text-sm opacity-60">
                        Sin movimientos registrados.
                      </TD>
                    </TR>
                  )}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales">
          <Card>
            <CardContent className="py-12 text-center text-sm opacity-60">
              Reporte de ventas por producto disponible en{" "}
              <Link
                href="/reportes/productos"
                className="text-[color:var(--brand-accent)] hover:underline"
              >
                /reportes/productos
              </Link>
              .
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function DataPoint({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider opacity-50">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
