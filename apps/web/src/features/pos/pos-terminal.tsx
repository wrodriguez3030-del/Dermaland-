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
  CheckCircle2,
  AlertTriangle,
  FileText,
  MapPin,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { formatCurrency, formatDate, daysUntil } from "@/lib/utils/format";
import {
  getProductById,
} from "@/lib/mock-data/catalog";
import { useCustomers } from "@/features/customers/customer-store";
import { useProducts } from "@/features/products/product-store";
import { ProductImage } from "@/features/products/components/product-image";
import { CustomerSearchSelect } from "@/features/customers/components/customer-search-select";
import {
  createProformaAnywhere,
  generateProformaId,
  generateProformaNumber,
} from "@/features/sales/proforma-store";
import { resolveDocumentToIssue } from "@/features/sales/document-resolver";
import type { DefaultBillingType, Proforma } from "@/types";
import {
  billingTypeEcf,
  billingTypeLabel,
} from "@/features/customers/billing";
import {
  ChargeSaleModal,
  type ChargeSaleResult,
} from "./components/charge-sale-modal";
import { primaryPaymentMethod } from "./payment-validation";
import { useToast } from "@/components/ui/toast";
import {
  useAllLots,
  sellableStockForBranch,
  totalSellableStock,
  nextFefoLotForBranch,
  lotBlockReason,
  stockByBranchForProduct,
  type LotBlockReason,
} from "@/features/inventory/lot-store";
import {
  useCurrentBranch,
  useActiveBranches,
  resolveBranchName,
} from "@/features/tenancy/branch-store";

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
  /** Stock vendible en la sucursal al momento de agregar al carrito. */
  maxStock: number;
}

function blockReasonLabel(reason: LotBlockReason): string {
  switch (reason) {
    case "expired": return "Lote vencido";
    case "quarantine": return "Lote en cuarentena";
    case "recall": return "Lote en recall";
    case "inactive-branch": return "Sucursal inactiva";
    case "depleted": return "Sin stock en esta sucursal";
    case "no-lot": return "Sin lote registrado en esta sucursal";
  }
}

/** Modal simple de stock por sucursal */
function BranchStockModal({
  open,
  productName,
  rows,
  onClose,
}: {
  open: boolean;
  productName: string;
  rows: { branchId: string; available: number; lots: number; soon: number; expired: number }[];
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Stock por sucursal — {productName}</h3>
          <button onClick={onClose} className="opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs opacity-60">
              <th className="pb-2 font-medium">Sucursal</th>
              <th className="pb-2 text-right font-medium">Disponible</th>
              <th className="pb-2 text-right font-medium">Lotes</th>
              <th className="pb-2 text-right font-medium">Por vencer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.branchId} className="border-b last:border-0">
                <td className="py-2 font-medium">{resolveBranchName(r.branchId)}</td>
                <td className={`py-2 text-right tabular-nums font-semibold ${r.available > 0 ? "text-emerald-700" : "text-rose-600"}`}>
                  {r.available}
                </td>
                <td className="py-2 text-right tabular-nums opacity-70">{r.lots}</td>
                <td className={`py-2 text-right tabular-nums ${r.soon > 0 ? "text-amber-700" : "opacity-40"}`}>
                  {r.soon > 0 ? r.soon : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button size="sm" variant="outline" className="mt-4 w-full" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}

export function PosTerminal() {
  const customers = useCustomers();
  const toast = useToast();
  const [search, setSearch] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [customerId, setCustomerId] = React.useState<string | "">("");
  const [discountGlobalPercent, setDiscountGlobalPercent] = React.useState(0);
  const [chargeOpen, setChargeOpen] = React.useState(false);
  const [billingType, setBillingType] =
    React.useState<DefaultBillingType>("consumo");
  const [issued, setIssued] = React.useState<{
    id: string;
    number: string;
    total: number;
    documentKind: "proforma" | "invoice";
    documentLabel: string;
  } | null>(null);
  const [branchStockModal, setBranchStockModal] = React.useState<{
    productId: string;
    productName: string;
  } | null>(null);

  // ── Sucursal actual ────────────────────────────────────────────────────────
  const { branchId: rawBranchId, branches } = useCurrentBranch();
  // Si aún no se resolvió la sucursal (hydration), usar la primera activa.
  const branchId = rawBranchId || branches[0]?.id || "";
  const branchName = branches.find((b) => b.id === branchId)?.name ?? branchId;

  // ── Lotes reactivos (Supabase o local según NEXT_PUBLIC_DATA_SOURCE) ──────
  const lots = useAllLots();
  const activeBranches = useActiveBranches();
  const activeBranchIds = React.useMemo(
    () => new Set(activeBranches.map((b) => b.id)),
    [activeBranches],
  );

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

  // ── Validación de carrito para Facturar ───────────────────────────────────
  // Calcula la razón de bloqueo del botón Facturar (mensaje claro).
  const chargeBlockReason = React.useMemo((): string | null => {
    if (cart.length === 0) return "El carrito está vacío.";
    if (creditFiscalNeedsRnc)
      return "Crédito fiscal requiere un cliente con RNC válido.";
    // Verificar cada línea del carrito.
    // Orden: primero razón del lote (cuarentena/recall/vencido/sin-lote/inactiva),
    // luego cantidad vs stock vendible — igual que addProduct.
    for (const line of cart) {
      const block = lotBlockReason(lots, line.productId, branchId, activeBranchIds);
      if (block) {
        return `No puedes facturar: "${line.productName}" — ${blockReasonLabel(block)}.`;
      }
      const currentStock = sellableStockForBranch(lots, line.productId, branchId);
      if (line.quantity > currentStock) {
        return `No puedes facturar: la cantidad de "${line.productName}" supera el stock disponible en ${branchName} (disponible: ${currentStock}).`;
      }
    }
    return null;
  }, [cart, creditFiscalNeedsRnc, lots, branchId, branchName, activeBranchIds]);

  const canCharge = chargeBlockReason === null;

  const addProduct = (productId: string) => {
    if (!branchId) {
      toast.error("No hay sucursal seleccionada.");
      return;
    }
    const product = getProductById(productId);
    if (!product) return;

    const lot = nextFefoLotForBranch(lots, productId, branchId);
    if (!lot) {
      // No hay lote vendible en esta sucursal — mostrar causa y stock en otras.
      const totalStock = totalSellableStock(lots, productId, activeBranchIds);
      if (totalStock > 0) {
        const otherRows = stockByBranchForProduct(lots, productId)
          .filter((r) => r.branchId !== branchId && r.available > 0 && activeBranchIds.has(r.branchId));
        const otherList = otherRows
          .map((r) => `${resolveBranchName(r.branchId)} (${r.available})`)
          .join(", ");
        toast.error(
          `Este producto no tiene stock disponible en ${branchName}. Disponible en: ${otherList}.`,
        );
      } else {
        const block = lotBlockReason(lots, productId, branchId, activeBranchIds);
        if (block && block !== "no-lot") {
          toast.error(`${product.name}: ${blockReasonLabel(block)} — bloqueado para venta.`);
        } else {
          toast.error(`${product.name}: Producto agotado.`);
        }
      }
      return;
    }

    // nextFefoLotForBranch ya excluye lotes vencidos; no es necesario re-chequear.
    const stockInBranch = sellableStockForBranch(lots, productId, branchId);

    setCart((prev) => {
      const ix = prev.findIndex((l) => l.lotId === lot.id);
      if (ix >= 0) {
        const next = [...prev];
        const line = next[ix]!;
        const newQty = line.quantity + 1;
        if (newQty > stockInBranch) {
          toast.error(`Solo hay ${stockInBranch} unidades disponibles en ${branchName}.`);
          return prev;
        }
        next[ix] = { ...line, quantity: newQty, maxStock: stockInBranch };
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
          maxStock: stockInBranch,
        },
      ];
    });
    setSearch("");
  };

  const updateQty = (lotId: string, newQty: number) => {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.lotId !== lotId) return l;
          if (newQty > l.maxStock) {
            toast.error(`Solo hay ${l.maxStock} unidades disponibles en ${branchName}.`);
            return { ...l, quantity: l.maxStock };
          }
          return { ...l, quantity: newQty };
        })
        .filter((l) => l.quantity > 0),
    );
  };

  const removeLine = (lotId: string) =>
    setCart((prev) => prev.filter((l) => l.lotId !== lotId));

  const finalizeCharge = async (result: ChargeSaleResult) => {
    if (!canCharge) {
      toast.error(chargeBlockReason ?? "No se puede facturar.");
      return;
    }

    const number = generateProformaNumber();
    const id = generateProformaId();
    const now = new Date().toISOString();
    const amountReceived = result.amountReceived;
    const changeAmount = result.changeAmount;
    const paidTotal = result.payments.reduce((s, p) => s + p.amount, 0);
    const primaryMethod = primaryPaymentMethod(result.payments);
    const resolved = resolveDocumentToIssue({
      billingType,
      paymentMethod: primaryMethod,
    });

    const newProforma: Proforma = {
      id,
      businessId: "biz_dermaland",
      branchId,
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
      status: paidTotal >= total ? "paid" : "issued",
      payments: result.payments.map((p, i) => ({
        id: `pay_${Date.now()}_${i}`,
        proformaId: id,
        method: p.method,
        amount: p.amount,
        ...(p.last4 ? { last4: p.last4 } : {}),
        ...(p.reference ? { reference: p.reference } : {}),
        userId: "usr_cashier_1",
        userName: "Rosa Peralta",
        createdAt: now,
      })),
      paid: Math.min(paidTotal, total),
      balance: Math.max(0, total - paidTotal),
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

    const res = await createProformaAnywhere(newProforma);
    if (!res.ok) {
      toast.error(
        res.error ?? "No se pudo emitir la venta. Revisá la conexión e intentá de nuevo.",
      );
      return;
    }

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
    setChargeOpen(false);
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

        {branchId && (
          <div className="mx-4 mt-3 flex items-center gap-1.5 text-xs text-black/50">
            <MapPin className="h-3 w-3" />
            <span>Sucursal: <strong className="text-black/70">{branchName}</strong></span>
          </div>
        )}


        <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filtered.map((p) => {
            const stockHere = branchId
              ? sellableStockForBranch(lots, p.id, branchId)
              : 0;
            const totalStock = totalSellableStock(lots, p.id, activeBranchIds);
            const lot = branchId
              ? nextFefoLotForBranch(lots, p.id, branchId)
              : null;
            const outOfStockHere = stockHere === 0;
            const availableElsewhere = outOfStockHere && totalStock > 0;
            const fullyOut = totalStock === 0;
            const block = outOfStockHere
              ? lotBlockReason(lots, p.id, branchId, activeBranchIds)
              : null;

            return (
              <button
                key={p.id}
                onClick={() => {
                  if (availableElsewhere) {
                    setBranchStockModal({ productId: p.id, productName: p.name });
                  } else {
                    addProduct(p.id);
                  }
                }}
                disabled={fullyOut && !availableElsewhere}
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
                  {/* Badge de stock en esta sucursal */}
                  <span
                    className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      outOfStockHere
                        ? availableElsewhere
                          ? "bg-amber-500 text-black"
                          : "bg-rose-600 text-white"
                        : stockHere <= p.minStock
                          ? "bg-amber-500 text-black"
                          : "bg-emerald-600 text-white"
                    }`}
                  >
                    {outOfStockHere
                      ? availableElsewhere
                        ? "Otra sucursal"
                        : block && block !== "no-lot"
                          ? blockReasonLabel(block)
                          : "Agotado"
                      : `Disponible aquí: ${stockHere} unid.`}
                  </span>
                  {lot && !outOfStockHere && daysUntil(lot.expiresAt) < 90 && (
                    <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-black">
                      FEFO
                    </span>
                  )}
                  {outOfStockHere && !availableElsewhere && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <span className="rounded-md bg-rose-600 px-3 py-1 text-xs font-bold text-white">
                        {fullyOut ? "Agotado" : block && block !== "no-lot" ? blockReasonLabel(block) : "Agotado en esta sucursal"}
                      </span>
                    </div>
                  )}
                  {availableElsewhere && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <span className="rounded-md bg-amber-500 px-2 py-1 text-[10px] font-bold text-black">
                        Ver stock por sucursal
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
                  {outOfStockHere && availableElsewhere && (
                    <div className="text-[10px] text-amber-700">
                      Disponible en otra sucursal
                    </div>
                  )}
                  {outOfStockHere && fullyOut && (
                    <div className="text-[10px] text-rose-600">
                      Producto agotado.
                    </div>
                  )}
                  {!outOfStockHere && lot && (
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
            {cart.map((l) => {
              const currentStock = sellableStockForBranch(lots, l.productId, branchId);
              return (
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
                      <div className="text-[10px] opacity-50">
                        Disponible: {currentStock} unid.
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1 rounded-lg border border-black/10">
                        <button
                          onClick={() => updateQty(l.lotId, l.quantity - 1)}
                          className="flex h-7 w-7 items-center justify-center hover:bg-black/[0.04]"
                          aria-label="Disminuir cantidad"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={currentStock}
                          value={l.quantity}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!isNaN(v) && v >= 1) {
                              if (v > currentStock) {
                                toast.error(`Solo hay ${currentStock} unidades disponibles en esta sucursal.`);
                                updateQty(l.lotId, currentStock);
                              } else {
                                updateQty(l.lotId, v);
                              }
                            }
                          }}
                          className="w-10 bg-transparent text-center text-sm font-semibold tabular-nums outline-none"
                          aria-label="Cantidad"
                        />
                        <button
                          onClick={() => updateQty(l.lotId, l.quantity + 1)}
                          disabled={l.quantity >= currentStock}
                          className="flex h-7 w-7 items-center justify-center hover:bg-black/[0.04] disabled:opacity-30"
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
              );
            })}
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

            <Button
              className="mt-4 w-full"
              size="lg"
              onClick={() => {
                if (!canCharge) {
                  toast.error(chargeBlockReason ?? "No se puede facturar.");
                  return;
                }
                setChargeOpen(true);
              }}
              disabled={!canCharge}
            >
              Cobrar venta
            </Button>
            {!canCharge && chargeBlockReason && (
              <p className="mt-1 text-center text-[11px] text-rose-600">
                {chargeBlockReason}
              </p>
            )}
          </div>
        )}
      </div>

      <ChargeSaleModal
        open={chargeOpen}
        onClose={() => setChargeOpen(false)}
        subtotal={subtotal}
        itbis={scaledItbis}
        total={total}
        billingType={billingType}
        onConfirm={finalizeCharge}
      />
      <toast.Toast />

      {/* Modal de stock por sucursal */}
      {branchStockModal && (
        <BranchStockModal
          open={true}
          productName={branchStockModal.productName}
          rows={stockByBranchForProduct(lots, branchStockModal.productId).filter(
            (r) => activeBranchIds.has(r.branchId),
          )}
          onClose={() => setBranchStockModal(null)}
        />
      )}
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
