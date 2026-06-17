"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  PackagePlus,
  SlidersHorizontal,
  History,
  ShoppingCart,
  Pencil,
  Power,
  PackageX,
} from "lucide-react";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  getBrandById,
  getCategoryById,
  getLaboratoryById,
} from "@/lib/mock-data/catalog";
import { getBranchById } from "@/lib/mock-data/tenancy";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  daysUntil,
} from "@/lib/utils/format";
import { lotStatusBadge } from "@/features/inventory/lot-badges";
import {
  availableStock,
  expiryStatus,
  listLotsByProduct,
  listMovementsByProduct,
  stockBranchSummary,
  useInventoryTick,
  type ExpiryStatus,
} from "@/features/inventory/lot-store";
import { NewLotModal, AdjustStockModal } from "@/features/inventory/lot-modals";
import { ProductImage } from "@/features/products/components/product-image";
import { useProduct, updateProduct } from "@/features/products/product-store";
import type { ProductLot } from "@/types";

const expiryTone: Record<ExpiryStatus, "danger" | "warning" | "success"> = {
  expired: "danger",
  soon: "danger",
  warn: "warning",
  ok: "success",
};
const expiryRowBg: Record<ExpiryStatus, string> = {
  expired: "bg-rose-50",
  soon: "bg-rose-50/60",
  warn: "bg-amber-50/60",
  ok: "",
};

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const product = useProduct(id);
  const toast = useToast();
  useInventoryTick(); // re-render al cambiar lotes/movimientos

  const [lotOpen, setLotOpen] = React.useState(false);
  const [adjustLot, setAdjustLot] = React.useState<ProductLot | null>(null);
  const [confirmInactivate, setConfirmInactivate] = React.useState(false);

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
  const lots = listLotsByProduct(product.id);
  const stock = availableStock(product.id);
  const movements = listMovementsByProduct(product.id);
  const branchGroups = stockBranchSummary(product.id);
  const hasLots = lots.length > 0;
  const requiresExpiry = true; // dermocosmética: todo lote lleva vencimiento

  const firstAdjustable =
    lots.find((l) => l.status === "available") ?? lots[0] ?? null;

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
                <Pencil className="h-4 w-4" /> Editar
              </Button>
            </Link>
            <Button size="sm" onClick={() => setLotOpen(true)}>
              <PackagePlus className="h-4 w-4" /> Nuevo lote
            </Button>
          </>
        }
      />

      {/* Acciones rápidas */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <QuickAction
          icon={PackagePlus}
          label="Nuevo lote"
          onClick={() => setLotOpen(true)}
        />
        <QuickAction
          icon={SlidersHorizontal}
          label="Ajuste de stock"
          onClick={() => {
            if (firstAdjustable) setAdjustLot(firstAdjustable);
            else toast.success("Agrega un lote antes de ajustar stock.");
          }}
        />
        <QuickAction
          icon={History}
          label="Ver movimientos"
          href={`/inventario/movimientos?producto=${product.id}`}
        />
        <QuickAction
          icon={ShoppingCart}
          label="Ver ventas"
          href="/reportes/productos"
        />
        <QuickAction
          icon={Pencil}
          label="Editar producto"
          href={`/productos/${product.id}/editar`}
        />
        <QuickAction
          icon={Power}
          label={product.active ? "Inactivar" : "Reactivar"}
          danger={product.active}
          onClick={() => {
            if (product.active) setConfirmInactivate(true);
            else {
              updateProduct(product.id, { active: true });
              toast.success("Producto reactivado.");
            }
          }}
        />
      </div>

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

      {/* Empty state: producto sin lote */}
      {!hasLots && (
        <Card className="mb-6 border-amber-200 bg-amber-50/40">
          <CardContent className="py-8 text-center">
            <PackageX className="mx-auto mb-2 h-8 w-8 text-amber-600" />
            <p className="text-sm font-semibold">
              Este producto no tiene stock cargado.
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs opacity-70">
              Agrega un lote para poder venderlo. El stock se registra por lote,
              sucursal y almacén, con su fecha de vencimiento.
            </p>
            <Button size="sm" className="mt-4" onClick={() => setLotOpen(true)}>
              <PackagePlus className="h-4 w-4" /> Agregar primer lote
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Ayuda: flujo recomendado */}
      <div className="mb-6 rounded-xl border border-black/10 bg-black/[0.02] p-4 text-xs">
        <div className="mb-1 font-semibold">Para agregar inventario:</div>
        <ol className="ml-4 list-decimal space-y-0.5 opacity-75">
          <li>Crea el producto (ya está creado).</li>
          <li>Agrega un lote con “Nuevo lote”.</li>
          <li>Selecciona sucursal y almacén.</li>
          <li>Indica cantidad y fecha de vencimiento.</li>
          <li>Guarda — el stock queda disponible para vender.</li>
        </ol>
      </div>

      {/* Stock por sucursal */}
      {hasLots && (
        <Card className="mb-6">
          <CardContent className="p-0">
            <div className="border-b border-black/5 px-4 py-3 text-sm font-semibold">
              Stock por sucursal
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Sucursal</TH>
                  <TH className="text-right">Lotes</TH>
                  <TH className="text-right">Disponible</TH>
                  <TH className="text-right">Vencidos</TH>
                  <TH className="text-right">Por vencer</TH>
                </TR>
              </THead>
              <TBody>
                {branchGroups.map((g) => (
                  <TR key={g.branchId}>
                    <TD className="font-medium">
                      {getBranchById(g.branchId)?.name ?? g.branchId}
                    </TD>
                    <TD className="text-right tabular-nums">{g.lots}</TD>
                    <TD className="text-right tabular-nums font-medium">
                      {g.available} {product.unit}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {g.expired > 0 ? (
                        <span className="text-rose-700">{g.expired}</span>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {g.soon > 0 ? (
                        <span className="text-amber-700">{g.soon}</span>
                      ) : (
                        "—"
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="lots">
        <TabsList>
          <TabsTrigger value="lots">Lotes ({lots.length})</TabsTrigger>
          <TabsTrigger value="movements">
            Movimientos ({movements.length})
          </TabsTrigger>
          <TabsTrigger value="sales">Ventas</TabsTrigger>
        </TabsList>

        <TabsContent value="lots">
          <Card>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Lote</TH>
                    <TH>Sucursal</TH>
                    <TH className="text-right">Inicial</TH>
                    <TH className="text-right">Actual</TH>
                    <TH>Vence</TH>
                    <TH>Días</TH>
                    <TH>Estado</TH>
                    <TH className="text-right pr-4">Acciones</TH>
                  </TR>
                </THead>
                <TBody>
                  {lots.length === 0 && (
                    <TR>
                      <TD colSpan={8} className="py-8 text-center text-sm opacity-60">
                        Sin lotes. Usa “Agregar primer lote”.
                      </TD>
                    </TR>
                  )}
                  {lots.map((lot) => {
                    const days = daysUntil(lot.expiresAt);
                    const st = expiryStatus(lot.expiresAt);
                    return (
                      <TR key={lot.id} className={expiryRowBg[st]}>
                        <TD>
                          <div className="font-mono text-xs">{lot.lotNumber}</div>
                        </TD>
                        <TD className="text-xs opacity-70">
                          {getBranchById(lot.branchId)?.name ?? lot.branchId}
                        </TD>
                        <TD className="text-right tabular-nums">
                          {lot.initialQuantity}
                        </TD>
                        <TD className="text-right tabular-nums font-medium">
                          {lot.currentQuantity}
                        </TD>
                        <TD>{formatDate(lot.expiresAt)}</TD>
                        <TD>
                          <Badge tone={expiryTone[st]}>
                            {days < 0 ? `${Math.abs(days)} d. venc.` : `${days} d.`}
                          </Badge>
                        </TD>
                        <TD>{lotStatusBadge(lot.status)}</TD>
                        <TD className="pr-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAdjustLot(lot)}
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" /> Ajustar
                          </Button>
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

      <NewLotModal
        open={lotOpen}
        onClose={() => setLotOpen(false)}
        productId={product.id}
        productName={product.name}
        requireExpiry={requiresExpiry}
      />
      <AdjustStockModal
        open={adjustLot !== null}
        onClose={() => setAdjustLot(null)}
        lot={adjustLot}
        productName={product.name}
      />
      <ConfirmDialog
        open={confirmInactivate}
        title="Inactivar producto"
        message={`¿Inactivar ${product.name}? Dejará de venderse pero conserva su historial y lotes.`}
        confirmLabel="Inactivar"
        destructive
        onCancel={() => setConfirmInactivate(false)}
        onConfirm={() => {
          updateProduct(product.id, { active: false });
          setConfirmInactivate(false);
          toast.success("Producto inactivado.");
        }}
      />
      <toast.Toast />
    </>
  );
}

function QuickAction({
  icon: Icon,
  label,
  href,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  const inner = (
    <div
      className={`flex h-full flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium transition hover:shadow-sm ${
        danger
          ? "border-rose-200 bg-rose-50/40 text-rose-700 hover:bg-rose-50"
          : "border-black/10 bg-white hover:border-[color:var(--brand-primary)]/40"
      }`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return (
    <button type="button" onClick={onClick} className="text-left">
      {inner}
    </button>
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
