"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  HelpText,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui";
import { FormSection } from "@/components/ui/filter-bar";
import { useToast } from "@/components/ui/toast";
import {
  mockBrands,
  mockCategories,
  mockLaboratories,
} from "@/lib/mock-data/catalog";
import { ProductImageUploader } from "@/features/products/components/product-image-uploader";
import {
  createProduct,
  listAllProducts,
  updateProduct,
} from "@/features/products/product-store";
import { addLot } from "@/features/inventory/lot-store";
import { getWarehousesByBranch } from "@/lib/mock-data/tenancy";
import { listActiveBranches } from "@/features/tenancy/branch-store";
import type { Product } from "@/types";

type Mode = "create" | "edit";

interface ProductFormProps {
  mode: Mode;
  /** Producto a editar (sólo en mode="edit"). */
  product?: Product;
}

/**
 * Formulario único de producto, usado tanto para crear como para editar.
 *
 * En `create` llama `createProduct`; en `edit` llama `updateProduct` sobre el
 * producto recibido (persistencia en el store local — mismo contrato que
 * mapeará a Supabase cuando el módulo se conecte). Todos los campos son
 * editables en ambos modos.
 */
export function ProductForm({ mode, product }: ProductFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = React.useState(product?.name ?? "");
  const [sku, setSku] = React.useState(product?.sku ?? "");
  const [barcode, setBarcode] = React.useState(product?.barcode ?? "");
  const [description, setDescription] = React.useState(
    product?.description ?? "",
  );
  const [brandId, setBrandId] = React.useState(product?.brandId ?? "");
  const [categoryId, setCategoryId] = React.useState(product?.categoryId ?? "");
  const [laboratoryId, setLaboratoryId] = React.useState(
    product?.laboratoryId ?? "",
  );
  const [pharmaceuticalForm, setPharmaceuticalForm] = React.useState<
    Product["pharmaceuticalForm"] | ""
  >(product?.pharmaceuticalForm ?? "");
  const [presentation, setPresentation] = React.useState(
    product?.presentation ?? "",
  );
  const [activeIngredient, setActiveIngredient] = React.useState(
    product?.activeIngredient ?? "",
  );
  const [concentration, setConcentration] = React.useState(
    product?.concentration ?? "",
  );
  const [requiresPrescription, setRequiresPrescription] = React.useState(
    product?.requiresPrescription ?? false,
  );
  const [controlled, setControlled] = React.useState(product?.controlled ?? false);
  const [price, setPrice] = React.useState(
    product?.price != null ? String(product.price) : "",
  );
  const [itbisRate, setItbisRate] = React.useState(
    product?.itbisRate != null ? String(product.itbisRate) : "18",
  );
  const [cost, setCost] = React.useState(
    product?.cost != null ? String(product.cost) : "",
  );
  const [unit, setUnit] = React.useState(product?.unit ?? "unidad");
  const [minStock, setMinStock] = React.useState(
    product?.minStock != null ? String(product.minStock) : "",
  );
  const [maxStock, setMaxStock] = React.useState(
    product?.maxStock != null ? String(product.maxStock) : "",
  );
  const [active, setActive] = React.useState(product?.active ?? true);

  // Lote inicial opcional (sólo al crear).
  const [withLot, setWithLot] = React.useState(false);
  const [lotBranch, setLotBranch] = React.useState("");
  const [lotWarehouse, setLotWarehouse] = React.useState("");
  const [lotNumber, setLotNumber] = React.useState("");
  const [lotQty, setLotQty] = React.useState("");
  const [lotExpiry, setLotExpiry] = React.useState("");
  const [lotCost, setLotCost] = React.useState("");

  const [imageUrl, setImageUrl] = React.useState<string | null>(
    product?.imageUrl ?? null,
  );
  const [imageAlt, setImageAlt] = React.useState<string>(
    product?.imageAlt ?? "",
  );

  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (name && !imageAlt) setImageAlt(name);
  }, [name, imageAlt]);

  const isMissing = (k: string) => missing.has(k);

  const validate = (): string[] => {
    const m: string[] = [];
    if (!name.trim()) m.push("name");
    if (!sku.trim()) m.push("sku");
    if (price.trim() === "" || Number.isNaN(Number(price))) m.push("price");
    return m;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    const m = validate();
    if (m.length > 0) {
      setMissing(new Set(m));
      setErrorBanner("Complete los campos requeridos.");
      return;
    }
    setSubmitting(true);

    const common = {
      name,
      sku,
      barcode: barcode || undefined,
      description: description || undefined,
      brandId: brandId || undefined,
      categoryId: categoryId || undefined,
      laboratoryId: laboratoryId || undefined,
      pharmaceuticalForm: pharmaceuticalForm || undefined,
      presentation: presentation || undefined,
      activeIngredient: activeIngredient || undefined,
      concentration: concentration || undefined,
      requiresPrescription,
      controlled,
      cost: Number(cost) || 0,
      price: Number(price),
      itbisRate: Number(itbisRate) || 18,
      minStock: Number(minStock) || 0,
      maxStock: Number(maxStock) || 0,
      unit,
      imageUrl,
      imageAlt: imageAlt || name,
    };

    if (mode === "create") {
      const result = createProduct({ ...common, active: true, sellable: true });
      if (!result.ok) {
        setSubmitting(false);
        if (result.missingFields?.length) {
          setMissing(new Set(result.missingFields));
        }
        setErrorBanner(result.error);
        return;
      }
      // Lote inicial opcional.
      if (withLot) {
        const lotRes = addLot({
          productId: result.product.id,
          branchId: lotBranch,
          warehouseId: lotWarehouse,
          lotNumber,
          initialQuantity: Number(lotQty),
          expiresAt: lotExpiry ? new Date(lotExpiry).toISOString() : "",
          unitCost: Number(lotCost) || Number(cost) || 0,
          reason: "Entrada inicial",
        });
        if (!lotRes.ok) {
          setSubmitting(false);
          setErrorBanner(
            `Producto creado, pero el lote inicial falló: ${lotRes.error}`,
          );
          setMissing(new Set(lotRes.missingFields ?? []));
          setTimeout(() => router.push(`/productos/${result.product.id}`), 1200);
          return;
        }
      }
      setSubmitting(false);
      setMissing(new Set());
      toast.success(
        withLot
          ? `Producto y lote inicial guardados · ${result.product.sku}`
          : `Producto guardado · ${result.product.sku}`,
      );
      setTimeout(() => router.push(`/productos/${result.product.id}`), 600);
      return;
    }

    // edit
    if (!product) {
      setSubmitting(false);
      setErrorBanner("No se encontró el producto a editar.");
      return;
    }
    // SKU único (excluyendo el propio producto).
    const skuTaken = listAllProducts().some(
      (p) => p.id !== product.id && p.sku === sku.trim(),
    );
    if (skuTaken) {
      setSubmitting(false);
      setMissing(new Set(["sku"]));
      setErrorBanner(`Ya existe otro producto con SKU ${sku.trim()}.`);
      return;
    }
    updateProduct(product.id, {
      ...common,
      sku: sku.trim(),
      name: name.trim(),
      active,
    });
    setSubmitting(false);
    setMissing(new Set());
    toast.success(`Cambios guardados · ${sku.trim()}`);
    setTimeout(() => router.push(`/productos/${product.id}`), 600);
  };

  const submitLabel = mode === "create" ? "Guardar producto" : "Guardar cambios";

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-6 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={submitting}
          onClick={() => router.back()}
        >
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Guardando…" : submitLabel}
        </Button>
      </div>

      {errorBanner && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
          <AlertTriangle className="mt-0.5 h-5 w-5" />
          <div className="text-sm">{errorBanner}</div>
        </div>
      )}

      <Card>
        <CardContent>
          <FormSection
            title="Identidad"
            description="Datos visibles al cliente y al cajero en POS, e imagen del producto."
          >
            <div>
              <Label>Nombre comercial *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="La Roche-Posay Toleriane Crema 40 ml"
                className={isMissing("name") ? "border-rose-400" : undefined}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>SKU *</Label>
                <Input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="DERM-XXXXXX"
                  className={isMissing("sku") ? "border-rose-400" : undefined}
                />
              </div>
              <div>
                <Label>Código de barra (EAN-13)</Label>
                <Input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="8432598..."
                />
              </div>
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Hidratante prebiótica para piel sensible…"
              />
            </div>
            <div>
              <Label>Imagen del producto</Label>
              <ProductImageUploader
                value={imageUrl}
                alt={imageAlt || name}
                onChange={(v) => setImageUrl(v)}
              />
              <div className="mt-3">
                <Label className="mb-1 text-xs">
                  Texto alternativo (accesibilidad)
                </Label>
                <Input
                  value={imageAlt}
                  onChange={(e) => setImageAlt(e.target.value)}
                  placeholder={name || "Descripción de la imagen"}
                />
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Clasificación"
            description="Marca, categoría y laboratorio para filtros y reportes."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Marca</Label>
                <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                  <option value="">— Sin marca —</option>
                  {mockBrands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Categoría</Label>
                <Select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">— Sin categoría —</option>
                  {mockCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Laboratorio</Label>
                <Select
                  value={laboratoryId}
                  onChange={(e) => setLaboratoryId(e.target.value)}
                >
                  <option value="">— Sin laboratorio —</option>
                  {mockLaboratories.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Datos farmacéuticos"
            description="Forma, principio activo, registro sanitario y temperatura."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Forma farmacéutica</Label>
                <Select
                  value={pharmaceuticalForm}
                  onChange={(e) =>
                    setPharmaceuticalForm(
                      e.target.value as Product["pharmaceuticalForm"],
                    )
                  }
                >
                  <option value="">—</option>
                  <option value="crema">Crema</option>
                  <option value="locion">Loción</option>
                  <option value="serum">Sérum</option>
                  <option value="gel">Gel</option>
                  <option value="espuma">Espuma</option>
                  <option value="tableta">Tableta</option>
                  <option value="capsula">Cápsula</option>
                  <option value="jarabe">Jarabe</option>
                  <option value="shampoo">Shampoo</option>
                  <option value="mascarilla">Mascarilla</option>
                </Select>
              </div>
              <div>
                <Label>Presentación</Label>
                <Input
                  value={presentation}
                  onChange={(e) => setPresentation(e.target.value)}
                  placeholder="Tubo 40 ml"
                />
              </div>
              <div>
                <Label>Principio activo</Label>
                <Input
                  value={activeIngredient}
                  onChange={(e) => setActiveIngredient(e.target.value)}
                  placeholder="Niacinamida + Prebióticos"
                />
              </div>
              <div>
                <Label>Concentración</Label>
                <Input
                  value={concentration}
                  onChange={(e) => setConcentration(e.target.value)}
                  placeholder="1.5%"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <input
                  id="requiresPrescription"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={requiresPrescription}
                  onChange={(e) => setRequiresPrescription(e.target.checked)}
                />
                <Label htmlFor="requiresPrescription" className="mb-0">
                  Requiere receta
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="controlled"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={controlled}
                  onChange={(e) => setControlled(e.target.checked)}
                />
                <Label htmlFor="controlled" className="mb-0">
                  Producto controlado
                </Label>
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Precio y costo"
            description="Costo se actualiza automáticamente al recibir lotes (Fase 3)."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Precio venta (DOP) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="1250.00"
                  className={isMissing("price") ? "border-rose-400" : undefined}
                />
              </div>
              <div>
                <Label>ITBIS (%)</Label>
                <Select
                  value={itbisRate}
                  onChange={(e) => setItbisRate(e.target.value)}
                >
                  <option value="0">0% — Exento</option>
                  <option value="16">16%</option>
                  <option value="18">18%</option>
                </Select>
              </div>
              <div>
                <Label>Costo promedio</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="850.00"
                />
                <HelpText>Si vacío, se calcula al recibir el primer lote.</HelpText>
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Inventario"
            description="Mínimos para alertas. Stock real se gestiona por lote y almacén."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Unidad</Label>
                <Input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="unidad"
                />
              </div>
              <div>
                <Label>Stock mínimo</Label>
                <Input
                  type="number"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                  placeholder="5"
                />
              </div>
              <div>
                <Label>Stock máximo</Label>
                <Input
                  type="number"
                  value={maxStock}
                  onChange={(e) => setMaxStock(e.target.value)}
                  placeholder="40"
                />
              </div>
            </div>
            {mode === "edit" && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="active"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                <Label htmlFor="active" className="mb-0">
                  Producto activo (visible y vendible)
                </Label>
              </div>
            )}
          </FormSection>

          {mode === "create" && (
            <FormSection
              title="Lote inicial (opcional)"
              description="El stock vive por lote, sucursal y almacén. Puedes cargar el primer lote ahora o después desde el detalle del producto."
            >
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={withLot}
                  onChange={(e) => setWithLot(e.target.checked)}
                />
                <span className="text-sm font-medium">
                  Crear un lote inicial junto con el producto
                </span>
              </label>
              {withLot && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Sucursal *</Label>
                    <Select
                      value={lotBranch}
                      onChange={(e) => {
                        setLotBranch(e.target.value);
                        setLotWarehouse("");
                      }}
                      className={isMissing("branchId") ? "border-rose-400" : undefined}
                    >
                      <option value="">— Selecciona —</option>
                      {listActiveBranches().map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Almacén *</Label>
                    <Select
                      value={lotWarehouse}
                      onChange={(e) => setLotWarehouse(e.target.value)}
                      disabled={!lotBranch}
                      className={
                        isMissing("warehouseId") ? "border-rose-400" : undefined
                      }
                    >
                      <option value="">
                        {lotBranch ? "— Selecciona —" : "Elige sucursal"}
                      </option>
                      {(lotBranch ? getWarehousesByBranch(lotBranch) : []).map(
                        (w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ),
                      )}
                    </Select>
                  </div>
                  <div>
                    <Label>Número de lote *</Label>
                    <Input
                      value={lotNumber}
                      onChange={(e) => setLotNumber(e.target.value)}
                      placeholder="LRP24A"
                      className={isMissing("lotNumber") ? "border-rose-400" : undefined}
                    />
                  </div>
                  <div>
                    <Label>Cantidad inicial *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={lotQty}
                      onChange={(e) => setLotQty(e.target.value)}
                      placeholder="24"
                      className={
                        isMissing("initialQuantity") ? "border-rose-400" : undefined
                      }
                    />
                  </div>
                  <div>
                    <Label>Fecha de vencimiento *</Label>
                    <Input
                      type="date"
                      value={lotExpiry}
                      onChange={(e) => setLotExpiry(e.target.value)}
                      className={isMissing("expiresAt") ? "border-rose-400" : undefined}
                    />
                  </div>
                  <div>
                    <Label>Costo del lote</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={lotCost}
                      onChange={(e) => setLotCost(e.target.value)}
                      placeholder="850.00"
                    />
                  </div>
                </div>
              )}
            </FormSection>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={submitting}
          onClick={() => router.back()}
        >
          Cancelar
        </Button>
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? "Guardando…" : submitLabel}
        </Button>
      </div>

      <toast.Toast />
    </form>
  );
}
