"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import {
  useProformaDocument,
  updateProformaFullAnywhere,
} from "@/features/sales/proforma-store";
import {
  documentEditability,
  isElectronicInvoice,
} from "@/features/sales/editability";
import { saleDocumentLabel, getDocumentDisplayInfo } from "@/features/sales/document-label";
import {
  draftFromProforma,
  recalcInvoice,
  validateInvoiceDraft,
  isSensitiveChange,
  stockDeltasForEdit,
  SAFE_EDIT_STATUSES,
  type InvoiceEditDraft,
  type InvoiceEditLine,
} from "@/features/sales/invoice-edit";
import {
  useAllLots,
  adjustStockAnywhere,
  getSellableLotForProduct,
  sellableStockForBranch,
} from "@/features/inventory/lot-store";
import { useProducts } from "@/features/products/product-store";
import { canEditSales, isBillingAdmin } from "@/features/billing/permissions";
import { mockCurrentUser } from "@/lib/mock-data/users";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import type { DefaultBillingType, Payment, PaymentMethod, Proforma, ProformaStatus } from "@/types";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "azul", label: "Azul" },
  { value: "cardnet", label: "CardNET" },
  { value: "visanet", label: "VisaNet" },
  { value: "paypal", label: "PayPal" },
  { value: "manual", label: "Manual" },
  { value: "other", label: "Otro" },
];

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  issued: "Emitida",
  paid: "Pagada",
  partially_paid: "Pago parcial",
  pending_ecf: "Pendiente e-CF",
  converted_to_ecf: "Convertida a e-CF",
  cancelled: "Anulada",
  expired: "Vencida",
};

const BILLING_TYPE_LABELS: Record<DefaultBillingType, string> = {
  consumo: "Factura de consumo (B02)",
  credito_fiscal: "Crédito fiscal (B01)",
};

/** ISO → valor de <input type="date"> (YYYY-MM-DD, en UTC). */
function isoToDateInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/**
 * Editar factura / venta — edición SEGURA y COMPLETA (cliente, ítems,
 * cantidades, precios, descuentos, pagos y notas).
 *
 * Blindaje fiscal: e-CF real → bloqueo total (nota de crédito). NCF/número/tipo
 * NUNCA cambian. El total se recalcula con el motor central (`recalcInvoice`).
 * El stock se ajusta por DELTA (devolver/consumir) igual que el POS. Los cambios
 * sensibles exigen motivo (auditoría en el servidor).
 */
export default function EditarVentaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";
  const { proforma, loading } = useProformaDocument(id);
  const canEdit = canEditSales(mockCurrentUser.role);
  const toast = useToast();

  const lots = useAllLots();
  const products = useProducts();

  const [draft, setDraft] = React.useState<InvoiceEditDraft | null>(null);
  const [original, setOriginal] = React.useState<Proforma | null>(null);
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [saved, setSaved] = React.useState(false);
  const [productQuery, setProductQuery] = React.useState("");

  React.useEffect(() => {
    if (proforma && !draft) {
      setDraft(draftFromProforma(proforma));
      setOriginal(proforma);
    }
  }, [proforma, draft]);

  if (loading || (proforma && !draft)) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-center text-sm opacity-70">
        Cargando documento…
      </div>
    );
  }

  if (!proforma || !draft || !original) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <h2 className="text-lg font-semibold">Documento no encontrado</h2>
            <div className="mt-4">
              <Link href="/ventas">
                <Button size="sm" variant="outline">Volver a ventas</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // e-CF: bloqueo total de edición directa (aunque sea demo) → nota de crédito.
  if (isElectronicInvoice(proforma)) {
    return (
      <div className="mx-auto max-w-xl p-4 sm:p-6">
        <div className="mb-4">
          <Link
            href={`/ventas/${proforma.id}`}
            className="inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
          >
            <ArrowLeft className="h-3 w-3" /> Volver al documento
          </Link>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-600" />
              Esta factura electrónica no puede editarse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Los comprobantes electrónicos e-CF no permiten edición directa.
              Para corregir este documento debes emitir una nota de crédito,
              nota de débito o anulación según corresponda.
            </div>
            <p className="font-mono text-xs opacity-60">
              {saleDocumentLabel(proforma)} · {proforma.ecfNumber ?? proforma.number}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Link href={`/ventas/${proforma.id}`}>
                <Button variant="outline">Volver a la factura</Button>
              </Link>
              <Link href="/dgii/facturas">
                <Button>Crear nota de crédito</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const editability = documentEditability(proforma);
  const blocked = !editability.editable || !canEdit;
  const doc = getDocumentDisplayInfo(proforma);
  const branchId = proforma.branchId;
  const admin = isBillingAdmin(mockCurrentUser.role);
  // Emitido fiscalmente (NCF asignado) → NO se cambia el tipo B02↔B01 aquí.
  const isEmittedFiscal = proforma.documentKind === "invoice";

  const totals = recalcInvoice(draft);
  const sensitive = isSensitiveChange(original, draft);
  const wasEmitted = doc.cls !== "proforma";

  // ── Mutadores del borrador ──────────────────────────────────────────────
  const patchDraft = (patch: Partial<InvoiceEditDraft>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  const updateLine = (index: number, patch: Partial<InvoiceEditLine>) =>
    setDraft((d) =>
      d
        ? { ...d, items: d.items.map((l, i) => (i === index ? { ...l, ...patch } : l)) }
        : d,
    );

  const removeLine = (index: number) =>
    setDraft((d) => (d ? { ...d, items: d.items.filter((_, i) => i !== index) } : d));

  const addProduct = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const sel = getSellableLotForProduct(lots, p.id, branchId);
    const lot = "lot" in sel ? sel.lot : null;
    const newLine: InvoiceEditLine = {
      productId: p.id,
      productSku: p.sku,
      productName: p.name,
      lotId: lot?.id,
      lotNumber: lot?.lotNumber,
      quantity: 1,
      unitPrice: p.price,
      itbisRate: p.itbisRate ?? 18,
      discountAmount: 0,
    };
    setDraft((d) => (d ? { ...d, items: [...d.items, newLine] } : d));
    setProductQuery("");
  };

  const updatePayment = (index: number, patch: Partial<InvoiceEditDraft["payments"][number]>) =>
    setDraft((d) =>
      d
        ? { ...d, payments: d.payments.map((p, i) => (i === index ? { ...p, ...patch } : p)) }
        : d,
    );

  const addPayment = () =>
    setDraft((d) =>
      d ? { ...d, payments: [...d.payments, { method: "cash", amount: 0 }] } : d,
    );

  const removePayment = (index: number) =>
    setDraft((d) => (d ? { ...d, payments: d.payments.filter((_, i) => i !== index) } : d));

  // Stock disponible por lote (para validar aumentos de cantidad).
  const sellableByLot: Record<string, number> = {};
  for (const lot of lots) sellableByLot[lot.id] = lot.currentQuantity;

  const productMatches =
    productQuery.trim().length >= 2
      ? products
          .filter((p) => {
            const q = productQuery.toLowerCase();
            return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
          })
          .slice(0, 8)
      : [];

  // ── Guardar ─────────────────────────────────────────────────────────────
  const handleSave = async (thenPrint = false) => {
    setSaved(false);
    const validation = validateInvoiceDraft(draft, {
      sellableByLot,
      originalItems: original.items,
    });
    if (validation.length > 0) {
      setErrors(validation);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (sensitive && !reason.trim()) {
      setErrors(["Indica el motivo de la modificación."]);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrors([]);
    setSaving(true);

    const recomputed = recalcInvoice(draft);
    const paymentsForPatch: Payment[] = draft.payments.map((p, i) => ({
      id: p.id ?? `pay_${i}`,
      proformaId: proforma.id,
      method: p.method,
      amount: Number(p.amount) || 0,
      reference: p.reference?.trim() || undefined,
      last4: p.last4?.trim() || undefined,
      userId: proforma.cashierId,
      userName: proforma.cashierName,
      createdAt: proforma.createdAt,
    }));

    const res = await updateProformaFullAnywhere(
      proforma.id,
      {
        customerName: draft.customerName.trim(),
        customerPhone: draft.customerPhone?.trim() || null,
        customerDocument: draft.customerDocument?.trim() || null,
        notes: draft.notes?.trim() || null,
        items: recomputed.items,
        payments: paymentsForPatch,
        discountPercent: draft.globalDiscountPercent,
        cashierName: draft.cashierName?.trim() || proforma.cashierName,
        status: admin ? draft.status : undefined,
        emittedAt: admin ? draft.emittedAt : undefined,
        billingType: isEmittedFiscal ? undefined : draft.billingType,
      },
      reason.trim(),
    );

    if (!res.ok) {
      setSaving(false);
      setErrors([res.error]);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Ajuste de stock por DELTA (devolver/consumir), igual que el POS.
    const deltas = stockDeltasForEdit(original.items, draft.items);
    for (const d of deltas) {
      if (!d.lotId) continue;
      const lot = lots.find((l) => l.id === d.lotId);
      if (!lot) continue;
      const newQuantity = Math.max(0, lot.currentQuantity - d.delta);
      await adjustStockAnywhere({
        lotId: d.lotId,
        productId: d.productId,
        warehouseId: lot.warehouseId,
        branchId: lot.branchId,
        newQuantity,
        reason: `Edición factura ${proforma.ecfNumber ?? proforma.number}${
          reason.trim() ? ` — ${reason.trim()}` : ""
        }`,
      });
    }

    setSaving(false);
    setSaved(true);
    toast.success("La factura fue actualizada correctamente.");
    setTimeout(() => {
      if (thenPrint) {
        window.open(`/ventas/${proforma.id}/print?auto=1`, "_blank");
      }
      router.push(`/ventas/${proforma.id}`);
    }, 600);
  };

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/ventas/${proforma.id}`}
          className="inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
        >
          <ArrowLeft className="h-3 w-3" /> Volver al documento
        </Link>
        <Badge tone="info">{saleDocumentLabel(proforma)}</Badge>
      </div>

      <div className="mb-4">
        <h1 className="text-xl font-bold">Editar {doc.title.toLowerCase()}</h1>
        <p className="font-mono text-xs opacity-60">
          {doc.numberLabel}: {doc.number} · {formatDateTime(proforma.createdAt)}
        </p>
      </div>

      {!canEdit && (
        <Banner tone="rose">No tienes permiso para editar facturas.</Banner>
      )}
      {!editability.editable && (
        <Banner tone="amber">{editability.reason}</Banner>
      )}
      {wasEmitted && editability.editable && canEdit && (
        <Banner tone="amber">
          <strong>Factura emitida.</strong> Los cambios quedarán auditados. El número
          de comprobante (NCF) no se modifica.
        </Banner>
      )}
      {errors.length > 0 && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-4 w-4" /> Revisa lo siguiente:
          </div>
          <ul className="ml-5 list-disc space-y-0.5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {saved && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4" /> La factura fue actualizada correctamente.
        </div>
      )}

      <fieldset disabled={blocked} className="space-y-4">
        {/* Cliente */}
        <Card>
          <CardHeader><CardTitle>Cliente</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Cliente *</Label>
              <Input
                value={draft.customerName}
                onChange={(e) => patchDraft({ customerName: e.target.value })}
              />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input
                value={draft.customerPhone ?? ""}
                onChange={(e) => patchDraft({ customerPhone: e.target.value })}
              />
            </div>
            <div>
              <Label>Documento (cédula / RNC)</Label>
              <Input
                value={draft.customerDocument ?? ""}
                onChange={(e) => patchDraft({ customerDocument: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Documento */}
        <Card>
          <CardHeader><CardTitle>Documento</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <ReadonlyField label="Tipo de documento" value={doc.title} />
              <ReadonlyField label={doc.numberLabel} value={doc.number} />
              <div>
                <Label className="text-xs">Cajero</Label>
                <Input
                  value={draft.cashierName ?? ""}
                  onChange={(e) => patchDraft({ cashierName: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {/* Fecha de emisión — solo admin */}
              <div>
                <Label className="text-xs">Fecha de emisión</Label>
                {admin ? (
                  <Input
                    type="date"
                    value={isoToDateInput(draft.emittedAt)}
                    onChange={(e) =>
                      patchDraft({
                        emittedAt: e.target.value
                          ? new Date(`${e.target.value}T12:00:00Z`).toISOString()
                          : proforma.createdAt,
                      })
                    }
                  />
                ) : (
                  <div className="flex h-9 items-center rounded-md border border-black/10 bg-black/[0.02] px-2 text-sm">
                    {formatDateTime(proforma.createdAt)}
                  </div>
                )}
              </div>

              {/* Estado — solo admin, subconjunto no fiscal */}
              <div>
                <Label className="text-xs">Estado</Label>
                {admin ? (
                  <select
                    className="h-9 w-full rounded-md border border-black/10 bg-white px-2 text-sm"
                    value={draft.status}
                    onChange={(e) => patchDraft({ status: e.target.value as ProformaStatus })}
                  >
                    {SAFE_EDIT_STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                    {/* Estado fiscal actual (no editable) mostrado como referencia. */}
                    {draft.status && !SAFE_EDIT_STATUSES.includes(draft.status) && (
                      <option value={draft.status} disabled>
                        {STATUS_LABELS[draft.status] ?? draft.status}
                      </option>
                    )}
                  </select>
                ) : (
                  <div className="flex h-9 items-center rounded-md border border-black/10 bg-black/[0.02] px-2 text-sm">
                    {STATUS_LABELS[proforma.status] ?? proforma.status}
                  </div>
                )}
              </div>

              {/* Tipo de facturación — solo si NO emitido fiscalmente */}
              <div>
                <Label className="text-xs">Tipo de facturación</Label>
                {isEmittedFiscal ? (
                  <div className="flex h-9 items-center rounded-md border border-black/10 bg-black/[0.02] px-2 text-xs">
                    {draft.billingType ? BILLING_TYPE_LABELS[draft.billingType] : "—"}
                  </div>
                ) : (
                  <select
                    className="h-9 w-full rounded-md border border-black/10 bg-white px-2 text-sm"
                    value={draft.billingType ?? ""}
                    onChange={(e) =>
                      patchDraft({
                        billingType: (e.target.value || undefined) as DefaultBillingType | undefined,
                      })
                    }
                  >
                    <option value="">—</option>
                    <option value="consumo">{BILLING_TYPE_LABELS.consumo}</option>
                    <option value="credito_fiscal">{BILLING_TYPE_LABELS.credito_fiscal}</option>
                  </select>
                )}
              </div>
            </div>

            <p className="text-xs opacity-60">
              El número de comprobante y el tipo de documento no se editan (blindaje
              fiscal). {isEmittedFiscal
                ? "El tipo de facturación (B02↔B01) de una factura ya emitida se corrige con nota de crédito."
                : "El tipo de facturación aplica al convertir/facturar la proforma."}
              {!admin && " La fecha de emisión y el estado solo los edita un administrador."}
            </p>
          </CardContent>
        </Card>

        {/* Productos */}
        <Card>
          <CardHeader><CardTitle>Productos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {draft.items.length === 0 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                La factura no tiene productos. Agrega al menos uno.
              </p>
            )}
            {draft.items.map((line, i) => {
              const lineTotal = recalcInvoice({ ...draft, items: [line], globalDiscountPercent: 0 }).total;
              const stock = line.lotId ? sellableStockForBranch(lots, line.productId, branchId) : null;
              return (
                <div key={`${line.productId}_${i}`} className="rounded-lg border border-black/10 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{line.productName}</div>
                      <div className="text-xs opacity-60">
                        {line.productSku}
                        {line.lotNumber ? ` · Lote ${line.lotNumber}` : " · sin lote"}
                        {stock != null ? ` · Stock: ${stock}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="shrink-0 rounded-md p-1.5 text-rose-600 hover:bg-rose-50"
                      title="Quitar producto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div>
                      <Label className="text-xs">Cantidad</Label>
                      <Input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Precio (ITBIS incl.)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Descuento (RD$)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.discountAmount}
                        onChange={(e) => updateLine(i, { discountAmount: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Total línea</Label>
                      <div className="flex h-9 items-center justify-end rounded-md border border-black/10 bg-black/[0.02] px-2 text-sm font-semibold tabular-nums">
                        {formatCurrency(lineTotal)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Buscar / agregar producto */}
            <div className="relative">
              <Label className="text-xs">Agregar producto</Label>
              <div className="flex items-center gap-2 rounded-md border border-black/10 px-2">
                <Search className="h-4 w-4 opacity-40" />
                <input
                  className="h-9 w-full bg-transparent text-sm outline-none"
                  placeholder="Buscar por nombre o SKU / escanear código…"
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                />
              </div>
              {productMatches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-black/10 bg-white shadow-lg">
                  {productMatches.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProduct(p.id)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-black/[0.03]"
                    >
                      <span className="truncate">
                        {p.name}
                        <span className="opacity-50"> · {p.sku}</span>
                      </span>
                      <span className="flex items-center gap-1 text-xs text-[color:var(--brand-accent)]">
                        <Plus className="h-3 w-3" /> {formatCurrency(p.price)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Totales */}
        <Card>
          <CardHeader><CardTitle>Totales</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="sm:max-w-xs">
              <Label className="text-xs">Descuento global (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.globalDiscountPercent}
                onChange={(e) =>
                  patchDraft({ globalDiscountPercent: Number(e.target.value) })
                }
              />
            </div>
            <div className="ml-auto max-w-xs space-y-1 text-sm">
              <Row label="Subtotal (base)" value={formatCurrency(totals.subtotal)} />
              <Row label="Descuento" value={`- ${formatCurrency(totals.discount)}`} />
              <Row label="ITBIS (18% incl.)" value={formatCurrency(totals.itbis)} />
              <div className="flex items-center justify-between border-t border-black/10 pt-1 text-base font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pago */}
        <Card>
          <CardHeader><CardTitle>Pago</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {draft.payments.map((pay, i) => (
              <div key={i} className="rounded-lg border border-black/10 p-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div>
                    <Label className="text-xs">Método</Label>
                    <select
                      className="h-9 w-full rounded-md border border-black/10 bg-white px-2 text-sm"
                      value={pay.method}
                      onChange={(e) => updatePayment(i, { method: e.target.value as PaymentMethod })}
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Monto</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={pay.amount}
                      onChange={(e) => updatePayment(i, { amount: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Últimos 4</Label>
                    <Input
                      value={pay.last4 ?? ""}
                      maxLength={4}
                      onChange={(e) => updatePayment(i, { last4: e.target.value })}
                    />
                  </div>
                  <div className="flex items-end gap-1">
                    <div className="flex-1">
                      <Label className="text-xs">Referencia</Label>
                      <Input
                        value={pay.reference ?? ""}
                        onChange={(e) => updatePayment(i, { reference: e.target.value })}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removePayment(i)}
                      className="mb-1 shrink-0 rounded-md p-1.5 text-rose-600 hover:bg-rose-50"
                      title="Quitar pago"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" size="sm" variant="outline" onClick={addPayment}>
                <Plus className="h-4 w-4" /> Agregar pago
              </Button>
              <div className="text-sm">
                <span className="opacity-60">Pagado: </span>
                <span className="font-semibold tabular-nums">{formatCurrency(totals.paid)}</span>
                {totals.balance !== 0 && (
                  <span className={`ml-2 ${totals.balance > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                    ({totals.balance > 0 ? "falta" : "vuelto"} {formatCurrency(Math.abs(totals.balance))})
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notas */}
        <Card>
          <CardHeader><CardTitle>Notas</CardTitle></CardHeader>
          <CardContent>
            <Label className="text-xs">Nota visible en la factura</Label>
            <Textarea
              rows={2}
              value={draft.notes ?? ""}
              onChange={(e) => patchDraft({ notes: e.target.value })}
            />
          </CardContent>
        </Card>

        {/* Motivo (obligatorio para cambios sensibles) */}
        {sensitive && (
          <Card>
            <CardContent className="pt-6">
              <Label>Motivo de la modificación *</Label>
              <Textarea
                rows={2}
                value={reason}
                placeholder="Indica el motivo de la modificación (ítems, precios, descuentos o pagos)."
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="mt-1 text-xs opacity-60">
                Cambiaste montos, productos o pagos: el motivo se guarda en la bitácora.
              </p>
            </CardContent>
          </Card>
        )}
      </fieldset>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Link href={`/ventas/${proforma.id}`}>
          <Button variant="outline" disabled={saving}>Cancelar</Button>
        </Link>
        <Button
          variant="outline"
          disabled={blocked || saving}
          onClick={() => handleSave(true)}
        >
          <Printer className="h-4 w-4" /> Guardar e imprimir
        </Button>
        <Button disabled={blocked || saving} onClick={() => handleSave(false)}>
          <Save className="h-4 w-4" /> {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>

      <toast.Toast />
    </div>
  );
}

function Banner({ tone, children }: { tone: "rose" | "amber"; children: React.ReactNode }) {
  const cls =
    tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-amber-300 bg-amber-50 text-amber-900";
  return <div className={`mb-4 rounded-lg border p-3 text-sm ${cls}`}>{children}</div>;
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider opacity-50">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="opacity-70">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
