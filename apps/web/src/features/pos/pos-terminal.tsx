"use client";

import * as React from "react";
import Link from "next/link";
import {
  Search,
  ShoppingCart,
  X,
  Plus,
  Minus,
  ScanBarcode,
  CreditCard,
  Banknote,
  Wallet,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ReceiptText,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { formatCurrency, formatDate, daysUntil } from "@/lib/utils/format";
import {
  getProductById,
  selectFefoLot,
  totalStockForProduct,
} from "@/lib/mock-data/catalog";
import { useCustomers } from "@/features/customers/customer-store";
import { useProducts } from "@/features/products/product-store";
import { ProductImage } from "@/features/products/components/product-image";
import { CustomerSearchSelect } from "@/features/customers/components/customer-search-select";
import {
  addProforma,
  generateProformaId,
  generateProformaNumber,
} from "@/features/sales/proforma-store";
import { resolveDocumentToIssue } from "@/features/sales/document-resolver";
import type { DefaultBillingType, PaymentMethod, Proforma } from "@/types";
import {
  billingTypeEcf,
  billingTypeLabel,
} from "@/features/customers/billing";

interface CartLine {
  productId: string;
  productSku: string;
  productName: string;
  lotId: string;
  lotNumber: string;
  expiresAt: string;
  unitPrice: number;
  itbisRate: number;
  quantity: number;
  discount: number;
}

/**
 * Métodos de pago expuestos en el selector visual (los 3 más usados en
 * mostrador). Procesadores específicos (`azul`, `cardnet`, `visanet`,
 * `paypal`, `manual`, `other`) caen en `card`/`transfer`/`cash` para el MVP;
 * el detalle queda para una integración futura.
 */
type PrimaryPaymentMethod = Extract<PaymentMethod, "cash" | "card" | "transfer">;

const PRIMARY_PAYMENT_METHODS: ReadonlyArray<{
  value: PrimaryPaymentMethod;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  { value: "cash", label: "Efectivo", icon: Banknote, description: "DOP en mano" },
  { value: "card", label: "Tarjeta", icon: CreditCard, description: "Crédito / débito" },
  {
    value: "transfer",
    label: "Transferencia",
    icon: Wallet,
    description: "Bancaria / app",
  },
];

export function PosTerminal() {
  const customers = useCustomers();
  const [search, setSearch] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [customerId, setCustomerId] = React.useState<string | "">("");
  const [discountGlobalPercent, setDiscountGlobalPercent] = React.useState(0);
  // null = aún sin elegir → ningún botón resaltado, submit deshabilitado.
  const [paymentMethod, setPaymentMethod] = React.useState<PrimaryPaymentMethod | null>(
    null,
  );
  const [paymentAmount, setPaymentAmount] = React.useState<string>("");
  const [billingType, setBillingType] =
    React.useState<DefaultBillingType>("consumo");
  const [issued, setIssued] = React.useState<{
    id: string;
    number: string;
    total: number;
    documentKind: "proforma" | "invoice";
    documentLabel: string;
  } | null>(null);
  const [warning, setWarning] = React.useState<string | null>(null);

  // Cuando se selecciona un cliente, preseleccionar su tipo de facturación
  // por defecto (consumo / credito_fiscal). Si no se especifica → consumo.
  // Mapea a e-CF tipo 32 / 31 cuando DGII esté activo.
  React.useEffect(() => {
    if (!customerId) {
      setBillingType("consumo");
      return;
    }
    const c = customers.find((x) => x.id === customerId);
    setBillingType(c?.defaultBillingType ?? "consumo");
  }, [customerId, customers]);

  const products = useProducts();
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 16);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.includes(q)),
      )
      .slice(0, 24);
  }, [search, products]);

  const subtotal = cart.reduce(
    (s, l) => s + (l.unitPrice / (1 + l.itbisRate / 100)) * l.quantity - l.discount,
    0,
  );
  const itbis = cart.reduce(
    (s, l) =>
      s +
      ((l.unitPrice / (1 + l.itbisRate / 100)) * (l.itbisRate / 100)) *
        l.quantity,
    0,
  );
  // Descuento global como % sobre el subtotal pre-ITBIS.
  // El ITBIS se recalcula proporcionalmente sobre la base imponible
  // descontada (taxableBase) — mantiene el ratio por línea aunque haya
  // mezcla de tasas (0/16/18%). En producción validar contra reglas DGII
  // (R-POS-01).
  const safePct = Math.min(100, Math.max(0, discountGlobalPercent));
  const globalDiscountAmount = subtotal * (safePct / 100);
  const taxableBase = Math.max(0, subtotal - globalDiscountAmount);
  const scaledItbis = subtotal > 0 ? itbis * (taxableBase / subtotal) : 0;
  const total = Math.max(0, taxableBase + scaledItbis);
  const customer = customers.find((c) => c.id === customerId);

  // Validación crédito fiscal: requiere RNC.
  const creditFiscalNeedsRnc =
    billingType === "credito_fiscal" &&
    (!customer ||
      !customer.documentNumber ||
      customer.documentType !== "rnc");

  // Resolver del documento a emitir.
  const resolved = React.useMemo(
    () => resolveDocumentToIssue({ billingType, paymentMethod }),
    [billingType, paymentMethod],
  );

  const canSubmit =
    cart.length > 0 && paymentMethod !== null && !creditFiscalNeedsRnc;

  const addProduct = (productId: string) => {
    const product = getProductById(productId);
    if (!product) return;
    const lot = selectFefoLot(productId);
    if (!lot) {
      setWarning(`${product.name} sin stock disponible`);
      setTimeout(() => setWarning(null), 2500);
      return;
    }

    const days = daysUntil(lot.expiresAt);
    if (days < 0) {
      setWarning(`Lote ${lot.lotNumber} vencido — bloqueado para venta`);
      setTimeout(() => setWarning(null), 3000);
      return;
    }

    setCart((prev) => {
      const ix = prev.findIndex((l) => l.lotId === lot.id);
      if (ix >= 0) {
        const next = [...prev];
        next[ix] = { ...next[ix]!, quantity: next[ix]!.quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          productId: product.id,
          productSku: product.sku,
          productName: product.name,
          lotId: lot.id,
          lotNumber: lot.lotNumber,
          expiresAt: lot.expiresAt,
          unitPrice: product.price,
          itbisRate: product.itbisRate,
          quantity: 1,
          discount: 0,
        },
      ];
    });
    setSearch("");
  };

  const updateQty = (lotId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.lotId === lotId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  };

  const removeLine = (lotId: string) =>
    setCart((prev) => prev.filter((l) => l.lotId !== lotId));

  const issue = () => {
    if (!canSubmit || paymentMethod === null) return;

    const number = generateProformaNumber();
    const id = generateProformaId();
    const now = new Date().toISOString();
    const amountReceived = Number(paymentAmount) > 0 ? Number(paymentAmount) : total;
    const changeAmount = Math.max(0, amountReceived - total);

    const newProforma: Proforma = {
      id,
      businessId: "biz_dermaland",
      branchId: "br_santiago",
      number,
      customerId: customer?.id,
      customerName: customer
        ? `${customer.firstName} ${customer.lastName}`
        : "Walk-in / Consumidor final",
      customerPhone: customer?.phone,
      customerDocument: customer?.documentNumber,
      cashierId: "usr_cashier_1",
      cashierName: "Rosa Peralta",
      items: cart.map((l) => ({
        productId: l.productId,
        productSku: l.productSku,
        productName: l.productName,
        lotId: l.lotId,
        lotNumber: l.lotNumber,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        itbisRate: l.itbisRate,
        discount: l.discount,
        subtotal: (l.unitPrice / (1 + l.itbisRate / 100)) * l.quantity - l.discount,
        itbis:
          ((l.unitPrice / (1 + l.itbisRate / 100)) * (l.itbisRate / 100)) *
          l.quantity,
        total: l.unitPrice * l.quantity - l.discount,
      })),
      subtotal,
      discount: globalDiscountAmount,
      itbis: scaledItbis,
      total,
      status: amountReceived >= total ? "paid" : "issued",
      payments: [
        {
          id: `pay_${Date.now()}`,
          proformaId: id,
          method: paymentMethod,
          amount: Math.min(amountReceived, total),
          userId: "usr_cashier_1",
          userName: "Rosa Peralta",
          createdAt: now,
        },
      ],
      paid: Math.min(amountReceived, total),
      balance: Math.max(0, total - amountReceived),
      discountPercent: discountGlobalPercent,
      discountAmount: globalDiscountAmount,
      billingType,
      amountReceived,
      changeAmount,
      documentKind: resolved.documentKind,
      ...(resolved.ecfType ? { ecfType: resolved.ecfType } : {}),
      ...(resolved.sequenceType ? { sequenceType: resolved.sequenceType } : {}),
      createdAt: now,
      updatedAt: now,
    };

    addProforma(newProforma);
    setIssued({
      id,
      number,
      total,
      documentKind: resolved.documentKind,
      documentLabel: resolved.label,
    });
    setCart([]);
    setDiscountGlobalPercent(0);
    setCustomerId("");
    setPaymentAmount("");
    setPaymentMethod(null);
  };

  return (
    <div className="grid min-h-[calc(100vh-12rem)] gap-4 xl:gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(380px,1fr)] xl:grid-cols-[minmax(0,2fr)_minmax(420px,1fr)]">
      {/* ───────────────────────── Izquierda: catálogo ──────────────────── */}
      <div className="flex min-w-0 flex-col rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-black/5 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-40" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Escanear o buscar producto · SKU · barcode"
              className="h-12 w-full rounded-xl border border-black/10 bg-black/[0.02] pl-10 pr-3 text-sm focus:border-[color:var(--brand-primary)] focus:bg-white focus:outline-none"
            />
          </div>
          <Button
            variant="outline"
            size="md"
            onClick={() => filtered[0] && addProduct(filtered[0].id)}
          >
            <ScanBarcode className="h-4 w-4" />
            <span className="hidden sm:inline">Simular escaneo</span>
            <span className="sm:hidden">Escanear</span>
          </Button>
        </div>

        {warning && (
          <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <AlertTriangle className="h-4 w-4" /> {warning}
          </div>
        )}

        <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filtered.map((p) => {
            const stock = totalStockForProduct(p.id);
            const lot = selectFefoLot(p.id);
            const outOfStock = stock === 0;
            return (
              <button
                key={p.id}
                onClick={() => addProduct(p.id)}
                disabled={outOfStock}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-black/5 bg-white text-left transition hover:border-[color:var(--brand-primary)] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={`Agregar ${p.name}`}
              >
                <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-[color:var(--brand-bg)] to-white">
                  <ProductImage
                    src={p.imageUrl}
                    alt={p.imageAlt ?? p.name}
                    name={p.name}
                    size={200}
                    rounded="md"
                    className="!h-full !w-full !rounded-none border-0 bg-transparent"
                  />
                  <span
                    className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      outOfStock
                        ? "bg-rose-600 text-white"
                        : stock <= p.minStock
                          ? "bg-amber-500 text-black"
                          : "bg-emerald-600 text-white"
                    }`}
                  >
                    {outOfStock ? "Agotado" : `${stock} unid.`}
                  </span>
                  {lot && !outOfStock && daysUntil(lot.expiresAt) < 90 && (
                    <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-black">
                      FEFO
                    </span>
                  )}
                  {outOfStock && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <span className="rounded-md bg-rose-600 px-3 py-1 text-xs font-bold text-white">
                        AGOTADO
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <div className="line-clamp-2 text-sm font-medium leading-tight">
                    {p.name}
                  </div>
                  <div className="mt-1 font-mono text-[10px] opacity-50">
                    {p.sku}
                  </div>
                  <div className="mt-auto pt-2 text-base font-semibold tabular-nums">
                    {formatCurrency(p.price)}
                  </div>
                  {lot && !outOfStock && (
                    <div className="text-[10px] opacity-60">
                      Lote {lot.lotNumber} · vence {formatDate(lot.expiresAt)}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm opacity-60">
              Sin productos coincidentes.
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────── Derecha: venta actual ──────────────────── */}
      <div className="flex min-w-0 flex-col rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="border-b border-black/5 p-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingCart className="h-4 w-4" /> Venta actual
            </h2>
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="text-xs opacity-60 hover:text-rose-700"
              >
                Vaciar
              </button>
            )}
          </div>
          <div className="mt-3">
            <CustomerSearchSelect
              clients={customers}
              value={customer ?? null}
              onChange={(c) => setCustomerId(c?.id ?? "")}
              businessId="biz_dermaland"
            />
          </div>
          {customer && customer.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {customer.tags.map((t) => (
                <Badge key={t} tone="info" outlined>
                  {t}
                </Badge>
              ))}
            </div>
          )}

          <div className="mt-3">
            <label className="mb-1 flex items-center justify-between text-[11px] font-medium opacity-70">
              <span>Tipo de facturación</span>
              <span className="text-[10px] opacity-60">
                {billingTypeEcf(billingType)}
              </span>
            </label>
            <select
              value={billingType}
              onChange={(e) =>
                setBillingType(e.target.value as DefaultBillingType)
              }
              className="h-9 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
            >
              <option value="consumo">{billingTypeLabel("consumo")}</option>
              <option value="credito_fiscal">
                {billingTypeLabel("credito_fiscal")}
              </option>
            </select>
            {creditFiscalNeedsRnc && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Crédito fiscal</strong> requiere datos fiscales
                  válidos del cliente (RNC). Selecciona un cliente con RNC o
                  cambia a <em>Consumo</em>.
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 && !issued && (
            <div className="flex h-full flex-col items-center justify-center px-8 py-12 text-center text-sm opacity-60">
              <ShoppingCart className="mb-2 h-8 w-8 opacity-30" />
              <div className="font-medium">Carrito vacío</div>
              <div className="text-xs">
                Escanea o haz clic en un producto para agregarlo.
              </div>
            </div>
          )}
          {issued && cart.length === 0 && (
            <div
              className={`m-4 rounded-xl border p-4 ${
                issued.documentKind === "invoice"
                  ? "border-violet-200 bg-violet-50 text-violet-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                {issued.documentKind === "invoice"
                  ? "Factura emitida"
                  : "Proforma emitida"}
              </div>
              <div className="mt-1 font-mono text-sm">{issued.number}</div>
              <div className="mt-0.5 text-[11px] opacity-80">
                {issued.documentLabel}
              </div>
              <div className="mt-2 text-2xl font-bold">
                {formatCurrency(issued.total)}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/proformas/${issued.id}/print?auto=1`} target="_blank">
                  <Button size="sm">Imprimir ticket</Button>
                </Link>
                <Link href={`/proformas/${issued.id}/print`} target="_blank">
                  <Button size="sm" variant="outline">
                    Generar PDF
                  </Button>
                </Link>
                <Link href={`/dgii/preview/${issued.id}`} target="_blank">
                  <Button size="sm" variant="outline">
                    <FileText className="h-4 w-4" />
                    Vista previa e-CF DEMO
                  </Button>
                </Link>
                <Button size="sm" variant="outline">
                  Enviar WhatsApp
                </Button>
                <button
                  onClick={() => setIssued(null)}
                  className="text-xs opacity-70 hover:opacity-100"
                >
                  Nueva venta
                </button>
              </div>
              <p className="mt-2 text-[10px] opacity-60">
                Vista previa DGII en modo mock. No es comprobante fiscal
                válido.
              </p>
            </div>
          )}
          <ul className="divide-y divide-black/5">
            {cart.map((l) => (
              <li key={l.lotId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-tight">
                      {l.productName}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] opacity-60">
                      Lote {l.lotNumber} · vence {formatDate(l.expiresAt)}
                    </div>
                    <div className="mt-1 text-xs opacity-70">
                      {formatCurrency(l.unitPrice)} c/u · ITBIS {l.itbisRate}%
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1 rounded-lg border border-black/10">
                      <button
                        onClick={() => updateQty(l.lotId, -1)}
                        className="flex h-7 w-7 items-center justify-center hover:bg-black/[0.04]"
                        aria-label="Disminuir cantidad"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold tabular-nums">
                        {l.quantity}
                      </span>
                      <button
                        onClick={() => updateQty(l.lotId, 1)}
                        className="flex h-7 w-7 items-center justify-center hover:bg-black/[0.04]"
                        aria-label="Aumentar cantidad"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="text-sm font-semibold tabular-nums">
                      {formatCurrency(l.unitPrice * l.quantity)}
                    </div>
                    <button
                      onClick={() => removeLine(l.lotId)}
                      className="text-rose-600 hover:text-rose-800"
                      aria-label="Quitar línea"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {cart.length > 0 && (
          <div className="border-t border-black/5 p-4">
            <div className="space-y-1 text-sm">
              <Row label="Subtotal" value={formatCurrency(subtotal)} />
              <Row label="ITBIS" value={formatCurrency(scaledItbis)} />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs opacity-70">Descuento global (%)</span>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={discountGlobalPercent}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isNaN(v)) {
                        setDiscountGlobalPercent(0);
                      } else {
                        setDiscountGlobalPercent(
                          Math.min(100, Math.max(0, v)),
                        );
                      }
                    }}
                    className="h-8 w-24 rounded-md border border-black/10 px-2 pr-6 text-right text-sm"
                    aria-label="Descuento global en porcentaje"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] opacity-60">
                    %
                  </span>
                </div>
              </div>
              {discountGlobalPercent > 0 && (
                <Row
                  label="Descuento aplicado"
                  value={`-${formatCurrency(globalDiscountAmount)}`}
                />
              )}
              <div className="mt-2 flex items-center justify-between border-t border-black/5 pt-2">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-2xl font-bold tabular-nums">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>

            {/* ── Selector de método de pago (sin default seleccionado) ── */}
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium opacity-70">
                  Método de pago
                </span>
                {paymentMethod === null && (
                  <span className="text-[10px] text-amber-700">
                    selecciona uno
                  </span>
                )}
              </div>
              <div
                className="grid grid-cols-3 gap-2"
                role="radiogroup"
                aria-label="Método de pago"
              >
                {PRIMARY_PAYMENT_METHODS.map(({ value, label, icon: Icon }) => {
                  const active = paymentMethod === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setPaymentMethod(value)}
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-3 text-xs font-medium transition ${
                        active
                          ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)] shadow-sm"
                          : "border-black/10 bg-white text-black/60 hover:border-black/25 hover:text-black/80"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <input
              type="number"
              placeholder={`Recibido (${formatCurrency(total)})`}
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="mt-3 h-10 w-full rounded-lg border border-black/10 px-3 text-sm"
              aria-label="Monto recibido"
            />

            {/* ── Indicador de documento a emitir ── */}
            <div
              className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                paymentMethod === null
                  ? "border-black/10 bg-black/[0.02] text-black/60"
                  : resolved.documentKind === "invoice"
                    ? "border-violet-200 bg-violet-50 text-violet-900"
                    : "border-blue-200 bg-blue-50 text-blue-900"
              }`}
            >
              {resolved.documentKind === "invoice" ? (
                <FileText className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <ReceiptText className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="font-semibold">Documento a emitir</div>
                <div className="truncate">
                  {paymentMethod === null
                    ? "—"
                    : resolved.label}
                </div>
              </div>
            </div>

            <Button
              className="mt-3 w-full"
              size="lg"
              onClick={issue}
              disabled={!canSubmit}
            >
              {resolved.buttonLabel}
            </Button>
            {!canSubmit && cart.length > 0 && (
              <p className="mt-1 text-center text-[11px] text-black/50">
                {creditFiscalNeedsRnc
                  ? "Cliente sin RNC para crédito fiscal."
                  : paymentMethod === null
                    ? "Selecciona método de pago para continuar."
                    : ""}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="opacity-70">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
