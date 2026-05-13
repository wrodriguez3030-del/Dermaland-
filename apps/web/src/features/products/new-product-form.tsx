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
import { createProduct } from "@/features/products/product-store";
import type { Product } from "@/types";

const initial = {
  name: "",
  sku: "",
  barcode: "",
  description: "",
  brandId: "",
  categoryId: "",
  laboratoryId: "",
  pharmaceuticalForm: "" as Product["pharmaceuticalForm"] | "",
  presentation: "",
  activeIngredient: "",
  concentration: "",
  registry: "",
  storageTemperature: "",
  requiresPrescription: false,
  controlled: false,
  price: "",
  itbisRate: "18",
  cost: "",
  unit: "unidad",
  minStock: "",
  maxStock: "",
};

export function NewProductForm() {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = React.useState(initial.name);
  const [sku, setSku] = React.useState(initial.sku);
  const [barcode, setBarcode] = React.useState(initial.barcode);
  const [description, setDescription] = React.useState(initial.description);
  const [brandId, setBrandId] = React.useState(initial.brandId);
  const [categoryId, setCategoryId] = React.useState(initial.categoryId);
  const [laboratoryId, setLaboratoryId] = React.useState(initial.laboratoryId);
  const [pharmaceuticalForm, setPharmaceuticalForm] = React.useState<
    Product["pharmaceuticalForm"] | ""
  >(initial.pharmaceuticalForm);
  const [presentation, setPresentation] = React.useState(initial.presentation);
  const [activeIngredient, setActiveIngredient] = React.useState(
    initial.activeIngredient,
  );
  const [concentration, setConcentration] = React.useState(initial.concentration);
  const [requiresPrescription, setRequiresPrescription] = React.useState(
    initial.requiresPrescription,
  );
  const [controlled, setControlled] = React.useState(initial.controlled);
  const [price, setPrice] = React.useState(initial.price);
  const [itbisRate, setItbisRate] = React.useState(initial.itbisRate);
  const [cost, setCost] = React.useState(initial.cost);
  const [unit, setUnit] = React.useState(initial.unit);
  const [minStock, setMinStock] = React.useState(initial.minStock);
  const [maxStock, setMaxStock] = React.useState(initial.maxStock);

  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [imageAlt, setImageAlt] = React.useState<string>("");

  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);

  // Mantener imageAlt coherente con el nombre por defecto.
  React.useEffect(() => {
    if (name && !imageAlt) setImageAlt(name);
  }, [name, imageAlt]);

  const isMissing = (k: string) => missing.has(k);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setSubmitting(true);

    const result = createProduct({
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
      active: true,
      sellable: true,
    });

    setSubmitting(false);

    if (!result.ok) {
      if (result.missingFields?.length) setMissing(new Set(result.missingFields));
      setErrorBanner(result.error);
      return;
    }
    setMissing(new Set());
    toast.success(`Producto guardado · ${result.product.sku}`);
    setTimeout(() => router.push(`/productos/${result.product.id}`), 600);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-6 flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Guardando…" : "Guardar producto"}
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
                <Label className="mb-1 text-xs">Texto alternativo (accesibilidad)</Label>
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
          </FormSection>
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? "Guardando…" : "Guardar producto"}
        </Button>
      </div>

      <toast.Toast />
    </form>
  );
}
