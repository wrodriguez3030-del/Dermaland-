"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ScanBarcode } from "lucide-react";
import { BarcodeScanModal } from "@/features/products/components/barcode-scan-modal";
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
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { recordLabChange } from "@/features/products/laboratory-audit";
import {
  validateProductForm,
  skuTakenOnEdit,
  PRODUCT_FIELD_MESSAGES,
  type PriceMode,
} from "@/features/products/product-form-validation";
import {
  DEFAULT_MARGIN_PERCENT,
  DEFAULT_ROUNDING,
  ROUNDING_LABELS,
  computeSalePrice,
  deriveMarginPercent,
  pricingBreakdown,
  realMarginPercent,
  canOverrideSalePrice,
  type RoundingMode,
} from "@/features/products/pricing";
import { recordPriceOverride } from "@/features/products/price-override-audit";
import { mockCurrentUser } from "@/lib/mock-data/users";
import { formatCurrency } from "@/lib/utils/format";
import {
  saveBrand,
  saveCategory,
  saveLaboratory,
  useBrandsList,
  useCategoriesList,
  useLaboratoriesList,
} from "@/features/products/catalog-store";
import { CreatableClassificationSelect } from "@/features/products/components/creatable-classification-select";
import { ProductImageUploader } from "@/features/products/components/product-image-uploader";
import {
  listAllProducts,
  saveProduct,
  useNextSku,
  PRODUCT_BACKEND,
} from "@/features/products/product-store";
import { addLot } from "@/features/inventory/lot-store";
import {
  useActiveBranches,
  defaultWarehouseForBranch,
} from "@/features/tenancy/branch-store";
import type { Product } from "@/types";

type Mode = "create" | "edit";

interface ProductFormProps {
  mode: Mode;
  /** Producto a editar (sólo en mode="edit"). */
  product?: Product;
}

/** ¿El usuario actual (rol) puede fijar un precio manual (override)? */
const CAN_OVERRIDE_PRICE = canOverrideSalePrice(mockCurrentUser.role);

/**
 * Formulario único de producto, usado tanto para crear como para editar.
 *
 * Llama `saveProduct` que despacha local vs Supabase según el backend
 * configurado. Todos los campos son editables en ambos modos.
 */
export function ProductForm({ mode, product }: ProductFormProps) {
  const router = useRouter();
  const toast = useToast();
  const activeBranches = useActiveBranches();

  const brands = useBrandsList();
  const categories = useCategoriesList();
  const laboratories = useLaboratoriesList();

  const [name, setName] = React.useState(product?.name ?? "");
  const [sku, setSku] = React.useState(product?.sku ?? "");
  // SKU lo genera el sistema (secuencial, no editable). Previsualización para "nuevo".
  const previewSku = useNextSku(mode === "create");
  const [barcode, setBarcode] = React.useState(product?.barcode ?? "");
  const [scanOpen, setScanOpen] = React.useState(false);
  const [description, setDescription] = React.useState(
    product?.description ?? "",
  );
  const [brandId, setBrandId] = React.useState(product?.brandId ?? "");
  const [categoryId, setCategoryId] = React.useState(product?.categoryId ?? "");
  const [laboratoryId, setLaboratoryId] = React.useState(
    product?.laboratoryId ?? "",
  );
  // Cambiar el laboratorio de un producto ya asignado exige confirmación y se
  // audita (el laboratorio pertenece al producto y afecta reportes por lab).
  const initialLaboratoryId = product?.laboratoryId ?? "";
  const [labChangeOpen, setLabChangeOpen] = React.useState(false);
  const labConfirmedRef = React.useRef(false);
  const formRef = React.useRef<HTMLFormElement>(null);
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
  // ── Precio y costo (orden: Costo → ITBIS → Margen → Precio) ──
  const [cost, setCost] = React.useState(
    product?.cost != null ? String(product.cost) : "",
  );
  const [itbisRate, setItbisRate] = React.useState(
    product?.itbisRate != null ? String(product.itbisRate) : "18",
  );
  // Margen: al editar se DERIVA del precio guardado (costo+ITBIS+precio); al
  // crear arranca en el default de negocio (30 %). No se persiste aparte: el
  // precio es la fuente de verdad, el margen se recalcula.
  const [margin, setMargin] = React.useState(
    product != null
      ? String(deriveMarginPercent(product.price, product.cost, product.itbisRate))
      : String(DEFAULT_MARGIN_PERCENT),
  );
  const [rounding, setRounding] = React.useState<RoundingMode>(DEFAULT_ROUNDING);
  // Modo del precio: "auto" (sugerido) por defecto; "manual" solo ADMIN.
  const [priceMode, setPriceMode] = React.useState<PriceMode>("auto");
  // Precio efectivo. En "auto" lo maneja el cálculo; en "manual" lo teclea ADMIN.
  const [price, setPrice] = React.useState(
    product?.price != null ? String(product.price) : "",
  );
  const [manualReason, setManualReason] = React.useState("");
  const [marginModalOpen, setMarginModalOpen] = React.useState(false);
  const [marginDraft, setMarginDraft] = React.useState(String(DEFAULT_MARGIN_PERCENT));
  // Costo con el que se abrió el editor: dispara la alerta si cambia (§10).
  const initialCost = product?.cost ?? null;
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
  const [lotNumber, setLotNumber] = React.useState("");
  const [lotQty, setLotQty] = React.useState("");
  const [lotExpiry, setLotExpiry] = React.useState("");

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

  // ── Cálculo automático del precio (§4) ──────────────────────────────────────
  const costNum = Number(cost);
  const itbisNum = Number(itbisRate);
  const marginNum = Number(margin);
  // Precio sugerido = costo_con_itbis × (1 + margen), con el redondeo elegido.
  const autoPrice = React.useMemo(
    () =>
      computeSalePrice({
        cost: costNum,
        itbisRate: itbisNum,
        marginPercent: marginNum,
        rounding,
      }),
    [costNum, itbisNum, marginNum, rounding],
  );
  // Precio efectivo: manual respeta lo tecleado; auto usa el sugerido.
  const manualPriceNum = Number(price);
  const effectivePrice = priceMode === "manual" ? manualPriceNum : autoPrice;
  const priceString = priceMode === "manual" ? price : String(autoPrice);

  // Desglose para el preview (§6) y margen real (§11).
  const breakdown = React.useMemo(
    () =>
      pricingBreakdown({
        cost: costNum,
        itbisRate: itbisNum,
        marginPercent: marginNum,
        rounding,
      }),
    [costNum, itbisNum, marginNum, rounding],
  );
  const effectiveRealMargin = realMarginPercent(effectivePrice, costNum, itbisNum);
  // Alerta de cambio de costo al EDITAR (§10): no toca el precio en silencio.
  const costChanged =
    mode === "edit" && initialCost != null && Number.isFinite(costNum) && costNum !== initialCost;

  const setMode = (manual: boolean) => {
    if (manual) {
      // Al entrar en manual, parte del precio sugerido actual como base editable.
      setPrice(String(autoPrice));
      setPriceMode("manual");
    } else {
      setPriceMode("auto");
      setManualReason("");
    }
  };

  const openMarginModal = () => {
    setMarginDraft(margin);
    setMarginModalOpen(true);
  };
  const applyMargin = () => {
    setMargin(marginDraft);
    setMarginModalOpen(false);
  };

  const validate = (): string[] =>
    validateProductForm({
      name,
      cost,
      itbisRate,
      margin,
      priceMode,
      price: priceString,
      unit,
      withLot,
      lotBranch,
      lotNumber,
      lotQty,
      lotExpiry,
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    const m = validate();
    // Override manual (§5): ADMIN debe indicar el motivo.
    if (priceMode === "manual" && !manualReason.trim()) m.push("manualReason");
    if (m.length > 0) {
      setMissing(new Set(m));
      setErrorBanner("Completa los campos marcados.");
      // Scroll + focus al primer campo con error (tras el re-render).
      setTimeout(() => {
        const el = formRef.current?.querySelector<HTMLElement>(".border-rose-500");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.focus?.();
        }
      }, 60);
      return;
    }
    // Guard: cambiar un laboratorio ya asignado requiere confirmación explícita.
    if (
      mode === "edit" &&
      initialLaboratoryId &&
      laboratoryId !== initialLaboratoryId &&
      !labConfirmedRef.current
    ) {
      setLabChangeOpen(true);
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
      // Precio EFECTIVO: sugerido (auto) o el manual que fijó ADMIN.
      price: effectivePrice,
      itbisRate: Number(itbisRate) || 18,
      minStock: Number(minStock) || 0,
      maxStock: Number(maxStock) || 0,
      unit,
      imageUrl,
      imageAlt: imageAlt || name,
    };

    // Deja constancia del precio manual (§5/§8): quién, sugerido vs manual y motivo.
    const maybeRecordOverride = (productId: string) => {
      if (priceMode !== "manual") return;
      recordPriceOverride({
        productId,
        sku: sku || undefined,
        suggestedPrice: autoPrice,
        manualPrice: effectivePrice,
        realMarginPercent: effectiveRealMargin,
        userName: mockCurrentUser.fullName,
        reason: manualReason.trim() || "Precio manual (override)",
      });
    };

    if (mode === "create") {
      const result = await saveProduct("create", { ...common, active: true, sellable: true });
      if (!result.ok) {
        setSubmitting(false);
        if (result.missingFields?.length) {
          setMissing(new Set(result.missingFields));
          setTimeout(() => {
            const el = formRef.current?.querySelector<HTMLElement>(".border-rose-500");
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              el.focus?.();
            }
          }, 60);
        }
        setErrorBanner(
          result.missingFields?.length ? "Completa los campos marcados." : result.error,
        );
        return;
      }
      // Lote inicial opcional.
      if (withLot) {
        const lotRes = addLot({
          productId: result.product.id,
          branchId: lotBranch,
          warehouseId: lotBranch ? defaultWarehouseForBranch(lotBranch) : "",
          lotNumber,
          initialQuantity: Number(lotQty),
          expiresAt: lotExpiry ? new Date(lotExpiry).toISOString() : "",
          // El costo del lote inicial SIEMPRE es el costo por unidad del producto.
          unitCost: Number(cost) || 0,
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
      maybeRecordOverride(result.product.id);
      setSubmitting(false);
      setMissing(new Set());
      toast.success(
        withLot
          ? `Producto creado con SKU ${result.product.sku} + lote inicial.`
          : `Producto creado con SKU ${result.product.sku}.`,
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
    // SKU único al editar, EXCLUYENDO el producto actual. En modo supabase la
    // unicidad la garantiza el servidor (índice único business_id+sku) y el SKU
    // es readonly; el catálogo local usa otros ids, por lo que este pre-chequeo
    // solo aplica en modo local (ver skuTakenOnEdit).
    const skuTaken = skuTakenOnEdit({
      backend: PRODUCT_BACKEND,
      products: listAllProducts(),
      sku,
      currentId: product.id,
    });
    if (skuTaken) {
      setSubmitting(false);
      setMissing(new Set(["sku"]));
      setErrorBanner(`Ya existe otro producto con SKU ${sku.trim()}.`);
      return;
    }
    const res = await saveProduct("edit", { ...common, sku: sku.trim(), name: name.trim(), active }, product.id);
    setSubmitting(false);
    if (!res.ok) {
      setErrorBanner(res.error);
      return;
    }
    if (initialLaboratoryId && laboratoryId !== initialLaboratoryId) {
      recordLabChange({
        productId: product.id,
        oldLaboratoryId: initialLaboratoryId,
        newLaboratoryId: laboratoryId,
        reason: "Cambio desde Editar producto",
      });
    }
    maybeRecordOverride(res.product.id);
    labConfirmedRef.current = false;
    setMissing(new Set());
    toast.success(`Cambios guardados · ${sku.trim()}`);
    setTimeout(() => router.push(`/productos/${res.product.id}`), 600);
  };

  const submitLabel = mode === "create" ? "Guardar producto" : "Guardar cambios";

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate>
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
          <div className="text-sm">
            <div>{errorBanner}</div>
            {missing.size > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {[...missing].map((k) => (
                  <li key={k}>{PRODUCT_FIELD_MESSAGES[k] ?? k}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <Card>
        <CardContent>
          <FormSection
            title="Identidad"
            description="Datos visibles al cliente y al cajero en POS, e imagen del producto."
          >
            <div>
              <Label>
                Nombre comercial <span className="text-rose-600">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="La Roche-Posay Toleriane Crema 40 ml"
                className={isMissing("name") ? "border-rose-500 bg-rose-50/60" : undefined}
              />
              {isMissing("name") && (
                <p className="mt-1 text-xs text-rose-600">Este campo es obligatorio.</p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>SKU</Label>
                <Input
                  value={
                    mode === "create"
                      ? previewSku || "Se generará automáticamente…"
                      : sku
                  }
                  readOnly
                  disabled
                  className="cursor-not-allowed bg-black/[0.03]"
                />
                <HelpText>
                  {mode === "create"
                    ? "El SKU se genera automáticamente."
                    : "El SKU no se puede modificar porque identifica el producto en inventario, ventas y reportes."}
                </HelpText>
              </div>
              <div>
                <Label>Código de barra (EAN-13)</Label>
                <div className="flex items-stretch gap-2">
                  <Input
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={(e) => {
                      // El lector envía el código + Enter: no enviar el formulario.
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setBarcode((v) => v.trim());
                      }
                    }}
                    placeholder="8432598..."
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setScanOpen(true)}
                    className="shrink-0"
                  >
                    <ScanBarcode className="h-4 w-4" /> Escanear
                  </Button>
                </div>
                <HelpText>
                  Escanea el código del empaque (lector o cámara) o escríbelo manualmente.
                </HelpText>
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
              <CreatableClassificationSelect
                label="Marca"
                value={brandId}
                onChange={setBrandId}
                options={brands}
                placeholder="Buscar o seleccionar marca..."
                entityName="marca"
                createTitle="Crear marca"
                createTooltip="Crear marca"
                createdToast="Marca creada correctamente."
                onCreate={(v) => saveBrand("create", { name: v.name })}
              />
              <CreatableClassificationSelect
                label="Categoría"
                value={categoryId}
                onChange={setCategoryId}
                options={categories}
                placeholder="Buscar o seleccionar categoría..."
                entityName="categoría"
                createTitle="Crear categoría"
                createTooltip="Crear categoría"
                createdToast="Categoría creada correctamente."
                extraFields={[
                  {
                    key: "description",
                    label: "Descripción",
                    type: "textarea",
                    placeholder: "Opcional",
                  },
                ]}
                onCreate={(v) =>
                  saveCategory("create", {
                    name: v.name,
                    description: v.description,
                  })
                }
              />
              <CreatableClassificationSelect
                label="Laboratorio"
                value={laboratoryId}
                onChange={setLaboratoryId}
                options={laboratories}
                placeholder="Buscar o seleccionar laboratorio..."
                entityName="laboratorio"
                createTitle="Crear laboratorio"
                createTooltip="Crear laboratorio"
                createdToast="Laboratorio creado correctamente."
                extraFields={[
                  { key: "country", label: "País", placeholder: "Opcional" },
                ]}
                onCreate={(v) =>
                  saveLaboratory("create", { name: v.name, country: v.country })
                }
              />
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
            description="El precio de venta se calcula automáticamente con el costo, el ITBIS y el margen."
          >
            {/* Orden: Costo → ITBIS → Margen → Precio (una columna en móvil). */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* 1 · Costo por unidad */}
              <div>
                <Label>
                  Costo por unidad (DOP) <span className="text-rose-600">*</span>
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="1000.00"
                  className={isMissing("cost") ? "border-rose-500 bg-rose-50/60" : undefined}
                />
                {isMissing("cost") ? (
                  <p className="mt-1 text-xs text-rose-600">{PRODUCT_FIELD_MESSAGES.cost}</p>
                ) : (
                  <HelpText>Costo de compra del producto por unidad.</HelpText>
                )}
              </div>

              {/* 2 · ITBIS */}
              <div>
                <Label>
                  ITBIS (%) <span className="text-rose-600">*</span>
                </Label>
                <Select
                  value={itbisRate}
                  onChange={(e) => setItbisRate(e.target.value)}
                  className={isMissing("itbisRate") ? "border-rose-500 bg-rose-50/60" : undefined}
                >
                  <option value="18">18%</option>
                  <option value="0">0% — Exento</option>
                </Select>
                {isMissing("itbisRate") ? (
                  <p className="mt-1 text-xs text-rose-600">{PRODUCT_FIELD_MESSAGES.itbisRate}</p>
                ) : (
                  <HelpText>0% (Exento) es válido.</HelpText>
                )}
              </div>

              {/* 3 · Margen */}
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Label className="mb-0">
                    Margen (%) <span className="text-rose-600">*</span>
                  </Label>
                  <button
                    type="button"
                    onClick={openMarginModal}
                    className="text-xs font-medium text-[color:var(--brand-primary)] hover:underline"
                  >
                    Editar margen
                  </button>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1000"
                  inputMode="decimal"
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                  placeholder="30"
                  className={isMissing("margin") ? "border-rose-500 bg-rose-50/60" : undefined}
                />
                {isMissing("margin") ? (
                  <p className="mt-1 text-xs text-rose-600">{PRODUCT_FIELD_MESSAGES.margin}</p>
                ) : (
                  <HelpText>Margen de ganancia sobre el costo con ITBIS.</HelpText>
                )}
              </div>

              {/* 4 · Precio de venta (readonly en auto) */}
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Label className="mb-0">Precio de venta (DOP)</Label>
                  {priceMode === "manual" && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                      Precio manual
                    </span>
                  )}
                </div>
                {priceMode === "manual" ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="1534.00"
                    className={isMissing("price") ? "border-rose-500 bg-rose-50/60" : undefined}
                  />
                ) : (
                  <Input
                    readOnly
                    value={autoPrice.toFixed(2)}
                    className="cursor-not-allowed bg-black/[0.03] font-semibold"
                  />
                )}
                {isMissing("price") ? (
                  <p className="mt-1 text-xs text-rose-600">{PRODUCT_FIELD_MESSAGES.price}</p>
                ) : (
                  <HelpText>
                    {priceMode === "manual"
                      ? "Precio fijado manualmente. Se registra en la auditoría."
                      : "Calculado automáticamente según costo, ITBIS y margen."}
                  </HelpText>
                )}
              </div>
            </div>

            {/* Redondeo comercial (§7) + override manual (§5) */}
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <div className="w-full sm:w-56">
                <Label className="text-xs">Redondeo del precio</Label>
                <Select value={rounding} onChange={(e) => setRounding(e.target.value as RoundingMode)}>
                  {(Object.keys(ROUNDING_LABELS) as RoundingMode[]).map((m) => (
                    <option key={m} value={m}>
                      {ROUNDING_LABELS[m]}
                    </option>
                  ))}
                </Select>
              </div>
              {CAN_OVERRIDE_PRICE && (
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={priceMode === "manual"}
                    onChange={(e) => setMode(e.target.checked)}
                  />
                  <span>Fijar precio manual (override ADMIN)</span>
                </label>
              )}
            </div>

            {priceMode === "manual" && CAN_OVERRIDE_PRICE && (
              <div className="mt-3">
                <Label>
                  Motivo del precio manual <span className="text-rose-600">*</span>
                </Label>
                <Input
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  placeholder="Ej.: promoción de temporada / precio de lista del proveedor"
                  className={isMissing("manualReason") ? "border-rose-500 bg-rose-50/60" : undefined}
                />
                {isMissing("manualReason") && (
                  <p className="mt-1 text-xs text-rose-600">{PRODUCT_FIELD_MESSAGES.manualReason}</p>
                )}
              </div>
            )}

            {/* Alerta de cambio de costo al editar (§10) */}
            {costChanged && (
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="text-sm">
                  El costo cambió{" "}
                  <span className="opacity-70">
                    ({formatCurrency(initialCost ?? 0)} → {formatCurrency(costNum || 0)})
                  </span>
                  . Revisa el margen y el precio de venta.
                </span>
              </div>
            )}

            {/* Preview del cálculo (§6) + margen real (§11) */}
            <div className="mt-4 rounded-2xl border border-black/5 bg-[color:var(--brand-primary)]/[0.04] p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">
                Resumen del cálculo
              </div>
              <dl className="space-y-1 text-sm tabular-nums">
                <div className="flex items-center justify-between">
                  <dt className="opacity-70">Costo unidad</dt>
                  <dd className="font-medium">{formatCurrency(breakdown.cost)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="opacity-70">+ ITBIS {breakdown.itbisRate}%</dt>
                  <dd>{formatCurrency(breakdown.itbisAmount)}</dd>
                </div>
                <div className="flex items-center justify-between border-t border-black/5 pt-1">
                  <dt className="opacity-70">Costo con ITBIS</dt>
                  <dd className="font-medium">{formatCurrency(breakdown.costWithItbis)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="opacity-70">+ Margen {breakdown.marginPercent}%</dt>
                  <dd>{formatCurrency(breakdown.marginAmount)}</dd>
                </div>
                <div className="flex items-center justify-between border-t border-black/10 pt-1.5">
                  <dt className="font-semibold">Precio venta sugerido</dt>
                  <dd className="font-semibold text-[color:var(--brand-primary)]">
                    {formatCurrency(breakdown.salePrice)}
                  </dd>
                </div>
                {priceMode === "manual" && (
                  <div className="flex items-center justify-between">
                    <dt className="font-semibold">Precio venta manual</dt>
                    <dd className="font-semibold text-amber-700">
                      {formatCurrency(Number.isFinite(manualPriceNum) ? manualPriceNum : 0)}
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-black/5 pt-1.5">
                  <dt className="opacity-70">Margen real</dt>
                  <dd className="font-medium">
                    {effectiveRealMargin == null ? "—" : `${effectiveRealMargin.toFixed(2)}%`}
                  </dd>
                </div>
              </dl>
            </div>
          </FormSection>

          <FormSection
            title="Inventario"
            description="Mínimos para alertas. El stock real se controla por sucursal, lote y fecha de vencimiento."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>
                  Unidad <span className="text-rose-600">*</span>
                </Label>
                <Input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="unidad"
                  className={isMissing("unit") ? "border-rose-500 bg-rose-50/60" : undefined}
                />
                {isMissing("unit") && (
                  <p className="mt-1 text-xs text-rose-600">Este campo es obligatorio.</p>
                )}
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
              description="El stock vive por lote y sucursal. Puedes cargar el primer lote ahora o después desde el detalle del producto."
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
                      onChange={(e) => setLotBranch(e.target.value)}
                      className={isMissing("branchId") ? "border-rose-500 bg-rose-50/60" : undefined}
                    >
                      <option value="">— Selecciona —</option>
                      {activeBranches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                    {isMissing("branchId") && (
                      <p className="mt-1 text-xs text-rose-600">Este campo es obligatorio.</p>
                    )}
                  </div>
                  <div>
                    <Label>Número de lote *</Label>
                    <Input
                      value={lotNumber}
                      onChange={(e) => setLotNumber(e.target.value)}
                      placeholder="LRP24A"
                      className={isMissing("lotNumber") ? "border-rose-500 bg-rose-50/60" : undefined}
                    />
                    {isMissing("lotNumber") && (
                      <p className="mt-1 text-xs text-rose-600">Este campo es obligatorio.</p>
                    )}
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
                        isMissing("initialQuantity") ? "border-rose-500 bg-rose-50/60" : undefined
                      }
                    />
                    {isMissing("initialQuantity") && (
                      <p className="mt-1 text-xs text-rose-600">Este campo es obligatorio.</p>
                    )}
                  </div>
                  <div>
                    <Label>Fecha de vencimiento *</Label>
                    <Input
                      type="date"
                      value={lotExpiry}
                      onChange={(e) => setLotExpiry(e.target.value)}
                      className={isMissing("expiresAt") ? "border-rose-500 bg-rose-50/60 bg-rose-50/50" : undefined}
                    />
                    {isMissing("expiresAt") && (
                      <p className="mt-1 text-xs text-rose-600">Este campo es obligatorio.</p>
                    )}
                  </div>
                </div>
              )}
              {withLot && (
                <p className="mt-3 rounded-lg bg-[color:var(--brand-primary)]/5 px-3 py-2 text-xs opacity-70">
                  El costo del lote inicial usa el <strong>Costo por unidad</strong> del producto. No hace falta capturarlo aparte.
                </p>
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

      <Modal
        open={labChangeOpen}
        title="Cambiar laboratorio del producto"
        onClose={() => setLabChangeOpen(false)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setLabChangeOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                labConfirmedRef.current = true;
                setLabChangeOpen(false);
                formRef.current?.requestSubmit();
              }}
            >
              Confirmo cambiar el laboratorio
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Este producto ya tiene movimientos/ventas. Cambiar el laboratorio afectará los
              reportes por laboratorio. El cambio queda registrado en la auditoría.
            </span>
          </div>
        </div>
      </Modal>

      <Modal
        open={marginModalOpen}
        title="Definir margen"
        onClose={() => setMarginModalOpen(false)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setMarginModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={applyMargin}>
              Aplicar margen
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="opacity-70">
            Margen actual: <strong>{margin || "0"}%</strong>
          </div>
          <div>
            <Label>Margen (%)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="1000"
              inputMode="decimal"
              autoFocus
              value={marginDraft}
              onChange={(e) => setMarginDraft(e.target.value)}
              placeholder="30"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-[color:var(--brand-primary)]/[0.06] px-3 py-2">
            <span className="opacity-70">Precio estimado</span>
            <span className="font-semibold text-[color:var(--brand-primary)]">
              {formatCurrency(
                computeSalePrice({
                  cost: costNum,
                  itbisRate: itbisNum,
                  marginPercent: Number(marginDraft),
                  rounding,
                }),
              )}
            </span>
          </div>
        </div>
      </Modal>

      <BarcodeScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={(code) => setBarcode(code)}
      />

      <toast.Toast />
    </form>
  );
}
