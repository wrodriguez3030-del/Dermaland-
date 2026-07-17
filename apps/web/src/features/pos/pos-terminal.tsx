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
  Star,
  Percent,
} from "lucide-react";
import { Badge, Button, Select } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { useCustomers } from "@/features/customers/customer-store";
import { useProducts } from "@/features/products/product-store";
import { ProductCard } from "./product-card";
import { BarcodeScanModal } from "@/features/products/components/barcode-scan-modal";
import { useFavorites } from "./favorites-store";
import { LineDiscountModal } from "./line-discount-modal";
import {
  lineAmounts,
  cartTotals,
  type LineDiscountType,
} from "./cart-line";
import {
  CustomerSearchSelect,
  type CustomerSearchSelectHandle,
} from "@/features/customers/components/customer-search-select";
import { SellerSelect } from "@/features/sales/components/seller-select";
import { useSellers, type SellerOption } from "@/features/sales/seller-store";
import { generateIncentivesForSale } from "@/features/incentives/incentive-store";
import { QuickCreateCustomerModal } from "./components/quick-create-customer-modal";
import {
  CUSTOMER_REQUIRED_MESSAGE,
  isRealCustomerSelected,
} from "./checkout-guards";
import {
  createProformaAnywhere,
  generateProformaId,
  generateProformaNumber,
} from "@/features/sales/proforma-store";
import {
  resolveAutoBilling,
  comprobanteToDocType,
} from "@/features/billing/auto-billing-rules";
import { useBillingSettings } from "@/features/billing/billing-settings-store";
import { reserveNextPreferredAnywhere } from "@/features/dgii/numbering-store";
import type { DefaultBillingType, Proforma } from "@/types";
import {
  billingTypeEcf,
  billingTypeLabel,
} from "@/features/customers/billing";
import {
  ChargeSaleModal,
  type ChargeSaleResult,
} from "./components/charge-sale-modal";
import { useToast } from "@/components/ui/toast";
import {
  useAllLots,
  sellableStockForBranch,
  totalSellableStock,
  nextFefoLotForBranch,
  getSellableLotForProduct,
  lotBlockReason,
  stockByBranchForProduct,
  fefoLotsForBranch,
  decrementLotStock,
  type LotBlockReason,
} from "@/features/inventory/lot-store";
import {
  useCurrentBranch,
  useActiveBranches,
  resolveBranchName,
  getBranchDisplayName,
} from "@/features/tenancy/branch-store";
import { NewLotModal } from "@/features/inventory/lot-modals";

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
  /** Monto de descuento de la línea en BASE (pre-ITBIS) — derivado del tipo/valor. */
  discount: number;
  /** Descuento por producto. */
  discountType: LineDiscountType;
  /** % (0–100) o monto RD$ inclusivo, según el tipo. */
  discountValue: number;
  discountReason?: string;
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

/**
 * Modal de stock por sucursal. Además de listar dónde hay stock, ofrece las
 * acciones para que el cajero no quede perdido cuando el producto no tiene
 * stock en la sucursal actual:
 *   1. Cambiar a la sucursal con stock (cambia la sucursal seleccionada).
 *   2. Agregar stock aquí (abre el modal de alta preseleccionado a la actual).
 *   3. Transferir stock (lleva al flujo de transferencias).
 * Nunca muestra UUIDs: usa `getBranchDisplayName`.
 */
export function BranchStockModal({
  open,
  productName,
  rows,
  currentBranchId,
  currentBranchName,
  onClose,
  onSwitchBranch,
  onAddStockHere,
}: {
  open: boolean;
  productName: string;
  rows: { branchId: string; available: number; lots: number; soon: number; expired: number }[];
  currentBranchId: string;
  currentBranchName: string;
  onClose: () => void;
  onSwitchBranch: (branchId: string, available: number) => void;
  onAddStockHere: () => void;
}) {
  if (!open) return null;
  const branchesWithStock = rows.filter(
    (r) => r.available > 0 && r.branchId !== currentBranchId,
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Stock por sucursal — {productName}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="opacity-60 hover:opacity-100">
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
                <td className="py-2 font-medium">{getBranchDisplayName(r.branchId)}</td>
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

        <div className="mt-5 space-y-2">
          {branchesWithStock.map((r) => (
            <Button
              key={r.branchId}
              size="sm"
              className="w-full justify-center"
              onClick={() => onSwitchBranch(r.branchId, r.available)}
            >
              <MapPin className="h-4 w-4" /> Cambiar a {getBranchDisplayName(r.branchId)} ({r.available} unid.)
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-center"
            onClick={onAddStockHere}
          >
            <Plus className="h-4 w-4" /> Agregar stock aquí — {currentBranchName}
          </Button>
          <Link href="/inventario/transferencias/nueva" className="block">
            <Button size="sm" variant="outline" className="w-full justify-center">
              Transferir stock
            </Button>
          </Link>
        </div>

        <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}

export function PosTerminal({
  canSwitchBranch = false,
}: {
  /**
   * ¿Puede el usuario elegir a qué sucursal facturar? (admin/manager). Lo
   * decide el Server Component `pos/page.tsx` con el rol real del JWT. Si es
   * `false`, la sucursal se muestra como texto fijo (sin selector).
   */
  canSwitchBranch?: boolean;
} = {}) {
  const customers = useCustomers();
  const billingSettings = useBillingSettings();
  const toast = useToast();
  const [search, setSearch] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [customerId, setCustomerId] = React.useState<string | "">("");
  // Cliente OBLIGATORIO para facturar: marca el selector en rojo y muestra
  // el mensaje cuando se intenta cobrar sin cliente.
  const [customerRequired, setCustomerRequired] = React.useState(false);
  // Vendedor responsable de la venta (para incentivos) — obligatorio.
  const [seller, setSeller] = React.useState<SellerOption | null>(null);
  const [sellerRequired, setSellerRequired] = React.useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = React.useState(false);
  const customerSelectRef = React.useRef<CustomerSearchSelectHandle>(null);
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
  const {
    branchId: rawBranchId,
    branches,
    setBranchId,
    loading: branchesLoading,
  } = useCurrentBranch();
  // Si aún no se resolvió la sucursal (hydration), usar la primera activa.
  const branchId = rawBranchId || branches[0]?.id || "";
  // El POS no debe operar hasta tener una sucursal válida.
  const branchReady = branchId !== "";
  // Nombre legible — NUNCA el UUID.
  const branchName =
    branches.find((b) => b.id === branchId)?.name ??
    getBranchDisplayName(branchId, "Sucursal seleccionada");

  // Vendedores elegibles de la sucursal activa (reactivo al cambio de sucursal).
  const { sellers, loading: sellersLoading } = useSellers(branchId);
  // Al cambiar de sucursal, si el vendedor elegido ya no pertenece → limpiar.
  React.useEffect(() => {
    if (seller && !sellers.some((s) => s.id === seller.id)) {
      setSeller(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellers]);

  // Producto para el que se abrió "Agregar stock aquí" (modal de alta de lote).
  const [addStockProduct, setAddStockProduct] = React.useState<{
    id: string;
    name: string;
  } | null>(null);

  // En móvil el carrito es un bottom sheet abierto por un botón flotante.
  const [mobileCartOpen, setMobileCartOpen] = React.useState(false);
  // Escaneo con cámara del celular (busca por barcode/SKU y agrega).
  const [posScanOpen, setPosScanOpen] = React.useState(false);

  // Cambia la sucursal seleccionada a una que sí tiene stock (desde el modal de
  // stock por sucursal). La selección se comparte con Productos y el selector
  // superior (useCurrentBranch).
  const switchToBranchWithStock = (targetBranchId: string, available: number) => {
    setBranchId(targetBranchId);
    setBranchStockModal(null);
    toast.success(
      `Cambiado a ${getBranchDisplayName(targetBranchId)}. ${available} unidades disponibles aquí.`,
    );
  };

  // ── Carrito ligado a su sucursal ───────────────────────────────────────────
  // El carrito pertenece a la sucursal donde se agregaron sus productos
  // (`cartBranchId`). Si cambian la sucursal global (selector superior) y hay
  // carrito de OTRA sucursal, pedimos confirmación porque el stock —y los
  // lotes— dependen de la sucursal. Carrito vacío → cambia sin preguntar.
  const [cartBranchId, setCartBranchId] = React.useState("");
  const [branchSwitchOpen, setBranchSwitchOpen] = React.useState(false);

  React.useEffect(() => {
    setBranchSwitchOpen(
      cart.length > 0 &&
        cartBranchId !== "" &&
        branchId !== "" &&
        branchId !== cartBranchId,
    );
  }, [branchId, cartBranchId, cart.length]);

  // ── Lotes reactivos (Supabase o local según NEXT_PUBLIC_DATA_SOURCE) ──────
  const lots = useAllLots();
  const activeBranches = useActiveBranches();
  const activeBranchIds = React.useMemo(
    () => new Set(activeBranches.map((b) => b.id)),
    [activeBranches],
  );

  // Índice de lotes por producto: evita barrer TODOS los lotes varias veces
  // por tarjeta visible en cada render (O(productos×lotes) → O(lotes)). Los
  // helpers de stock filtran por productId, así que darles solo el subset del
  // producto devuelve exactamente lo mismo.
  const lotsByProduct = React.useMemo(() => {
    const map = new Map<string, typeof lots>();
    for (const l of lots) {
      const arr = map.get(l.productId);
      if (arr) arr.push(l);
      else map.set(l.productId, [l]);
    }
    return map;
  }, [lots]);
  const lotsFor = React.useCallback(
    (productId: string) => lotsByProduct.get(productId) ?? [],
    [lotsByProduct],
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
  const { favorites, isFavorite, toggle: toggleFavorite } = useFavorites();
  const [onlyFavorites, setOnlyFavorites] = React.useState(false);
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = products;
    if (q) {
      list = products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.includes(q)),
      );
    }
    if (onlyFavorites) list = list.filter((p) => favorites.has(p.id));
    // Favoritos PRIMERO (estable), luego el resto — para vender más rápido.
    const fav = list.filter((p) => favorites.has(p.id));
    const rest = list.filter((p) => !favorites.has(p.id));
    return [...fav, ...rest].slice(0, q || onlyFavorites ? 48 : 24);
  }, [search, products, onlyFavorites, favorites]);

  // ── Banner: sucursal sin stock ────────────────────────────────────────────
  // Calculado sobre los productos filtrados para no iterar todo el catálogo.
  // "noBranchStock" → ningún producto visible tiene stock en la sucursal actual
  // pero sí existe stock en otra sucursal activa.
  // "noStockAnywhere" → no hay stock vendible en ninguna sucursal activa.
  const { noBranchStock, noStockAnywhere, alternativeBranchName } =
    React.useMemo(() => {
      if (!branchId || filtered.length === 0) {
        return { noBranchStock: false, noStockAnywhere: false, alternativeBranchName: "" };
      }
      let anyHere = false;
      let anyElsewhere = false;
      let altBranchId = "";
      for (const p of filtered) {
        const here = sellableStockForBranch(lotsFor(p.id), p.id, branchId);
        if (here > 0) { anyHere = true; break; }
        if (!anyElsewhere) {
          const rows = stockByBranchForProduct(lotsFor(p.id), p.id).filter(
            (r) => r.branchId !== branchId && r.available > 0 && activeBranchIds.has(r.branchId),
          );
          if (rows.length > 0) {
            anyElsewhere = true;
            altBranchId = rows[0]!.branchId;
          }
        }
      }
      if (anyHere) return { noBranchStock: false, noStockAnywhere: false, alternativeBranchName: "" };
      const totalOverAllProducts = filtered.reduce(
        (s, p) => s + totalSellableStock(lotsFor(p.id), p.id, activeBranchIds),
        0,
      );
      return {
        noBranchStock: anyElsewhere,
        noStockAnywhere: totalOverAllProducts === 0,
        alternativeBranchName: altBranchId ? resolveBranchName(altBranchId) : "",
      };
    }, [branchId, filtered, lotsFor, activeBranchIds]);

  // Totales con el motor de cálculo (descuento por línea + descuento global).
  const totals = cartTotals(cart, discountGlobalPercent);
  const subtotal = totals.subtotalNeto; // base después de descuentos por línea
  const globalDiscountAmount = totals.globalDiscount;
  const scaledItbis = totals.itbis;
  const total = totals.total;
  const customer = customers.find((c) => c.id === customerId);

  // ── Descuento por línea (mini-modal) ─────────────────────────────────────────
  const [discountLot, setDiscountLot] = React.useState<string | null>(null);
  const applyLineDiscount = (
    lotId: string,
    type: LineDiscountType,
    value: number,
    reason: string,
  ) => {
    setCart((prev) =>
      prev.map((l) => {
        if (l.lotId !== lotId) return l;
        const a = lineAmounts({
          unitPrice: l.unitPrice,
          itbisRate: l.itbisRate,
          quantity: l.quantity,
          discountType: type,
          discountValue: value,
        });
        return {
          ...l,
          discountType: type,
          discountValue: value,
          discountReason: reason || undefined,
          discount: a.discountBase,
        };
      }),
    );
  };

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
    // El producto debe venir de la lista REACTIVA (`useProducts`), que en
    // Supabase trae los productos reales. Antes se usaba `getProductById` del
    // catálogo MOCK → en producción el id real no existía ahí y la función
    // retornaba `undefined`, abortando en silencio (CAUSA RAÍZ del "click no
    // agrega al carrito" pese a mostrar stock).
    const product = products.find((p) => p.id === productId);
    if (!product) {
      toast.error("No se pudo agregar: producto no encontrado.");
      return;
    }

    // Helper CENTRAL FEFO: ignora vencidos/cuarentena/recall y elige el lote
    // vigente más próximo. Solo bloquea si NO hay lote vendible.
    const sellable = getSellableLotForProduct(lots, productId, branchId, activeBranchIds);
    if (!sellable.lot) {
      // No hay lote vendible en esta sucursal — mensaje claro, nunca en silencio.
      const totalStock = totalSellableStock(lots, productId, activeBranchIds);
      if (totalStock > 0) {
        const otherRows = stockByBranchForProduct(lots, productId).filter(
          (r) => r.branchId !== branchId && r.available > 0 && activeBranchIds.has(r.branchId),
        );
        const otherList = otherRows
          .map((r) => `${getBranchDisplayName(r.branchId)} (${r.available})`)
          .join(", ");
        toast.error(`No hay stock en ${branchName}. Disponible en: ${otherList}.`);
      } else {
        switch (sellable.reason) {
          case "quarantine":
            toast.error("Este producto está en cuarentena.");
            break;
          case "recall":
            toast.error("Este producto está bloqueado por recall.");
            break;
          case "expired":
            toast.error("No se puede vender: todos los lotes disponibles están vencidos.");
            break;
          default:
            toast.error("No hay stock vendible en esta sucursal.");
        }
      }
      return;
    }
    const lot = sellable.lot;

    // nextFefoLotForBranch ya excluye lotes vencidos; no es necesario re-chequear.
    const stockInBranch = sellableStockForBranch(lots, productId, branchId);
    const existing = cart.find((l) => l.lotId === lot.id);
    if (existing && existing.quantity + 1 > stockInBranch) {
      toast.error(
        `No se pudo agregar: cantidad no disponible (solo ${stockInBranch} en ${branchName}).`,
      );
      return;
    }

    setCart((prev) => {
      const ix = prev.findIndex((l) => l.lotId === lot.id);
      if (ix >= 0) {
        const next = [...prev];
        const line = next[ix]!;
        next[ix] = { ...line, quantity: line.quantity + 1, maxStock: stockInBranch };
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
          discountType: "none",
          discountValue: 0,
          maxStock: stockInBranch,
        },
      ];
    });
    setCartBranchId(branchId);
    if (sellable.hasExpiredLots) {
      toast.success(
        "Agregado. Este producto tiene lotes vencidos; se vende el lote vigente más próximo.",
      );
    } else {
      toast.success("Producto agregado al carrito.");
    }
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
    // Cliente obligatorio (defensa en profundidad: no se debe llegar aquí sin
    // cliente, pero nunca enviar "walk-in" a Supabase).
    if (!isRealCustomerSelected(customer)) {
      toast.error(CUSTOMER_REQUIRED_MESSAGE);
      setCustomerRequired(true);
      setChargeOpen(false);
      customerSelectRef.current?.focus();
      return;
    }
    if (!branchId) {
      toast.error("Selecciona una sucursal.");
      return;
    }
    // Vendedor obligatorio (base de incentivos).
    if (!seller) {
      toast.error("Selecciona el vendedor responsable de la venta.");
      setSellerRequired(true);
      setChargeOpen(false);
      return;
    }
    if (!canCharge) {
      toast.error(chargeBlockReason ?? "No se puede facturar.");
      return;
    }

    const id = generateProformaId();
    const now = new Date().toISOString();
    const amountReceived = result.amountReceived;
    const changeAmount = result.changeAmount;
    const paidTotal = result.payments.reduce((s, p) => s + p.amount, 0);

    // Decisión CONFIG-AWARE: respeta "Forma de facturación principal"
    // (NCF tradicional → B02/B01; e-CF → E32/E31; Proforma solo cuando aplica).
    const decision = resolveAutoBilling({
      billingType,
      payments: result.payments.map((p) => ({ method: p.method, amount: p.amount })),
      settings: billingSettings,
    });

    let docKind: "proforma" | "invoice" = "proforma";
    let ecfType: "31" | "32" | undefined;
    let sequenceType: "consumo" | "credito_fiscal" | undefined;
    let comprobante: string | undefined; // NCF (B02/B01) o e-CF (E32/E31)
    let numberingId: string | undefined;
    let sequenceEnvironment: string | undefined;

    if (decision.documentKind === "ncf" || decision.documentKind === "ecf") {
      const dt = comprobanteToDocType(decision.comprobanteType);
      if (dt) {
        // Reserva el siguiente número de la secuencia activa/preferida
        // (nunca producción). En modo supabase la reserva es ATÓMICA en
        // servidor (compartida entre cajas); en mock usa el store local.
        // Si no hay secuencia o se agotó → mensaje claro y aborta.
        const reservation = await reserveNextPreferredAnywhere(
          dt,
          billingSettings.ecfEnvironment,
          { branchId, cashierId: "usr_cashier_1" },
        );
        if (!reservation.ok) {
          toast.error(reservation.error);
          return;
        }
        comprobante = reservation.formatted;
        if (reservation.source === "server") {
          numberingId = reservation.numberingId;
          sequenceEnvironment = reservation.environment;
        }
      }
      docKind = "invoice";
      sequenceType =
        decision.comprobanteType === "B01" || decision.comprobanteType === "E31"
          ? "credito_fiscal"
          : "consumo";
      if (decision.documentKind === "ecf") {
        ecfType = decision.comprobanteType === "E31" ? "31" : "32";
      }
    }

    // Número del documento: el comprobante fiscal (B02/B01/E32/E31) para
    // facturas; PROF-… solo para proformas reales (cotización / pendiente cierre).
    const number = comprobante ?? generateProformaNumber();

    // B-02: plan de descuento de inventario (FEFO, multi-lote) calculado ANTES de
    // emitir. En modo supabase el servidor lo aplica ATÓMICAMENTE junto con la
    // venta (RPC `emit_sale_atomic`): si un lote no alcanza, la venta se revierte
    // completa. Si el snapshot ya muestra stock insuficiente, ni siquiera emitimos.
    const stockDecrements: { lotId: string; qty: number; reason?: string }[] = [];
    for (const line of cart) {
      let remaining = line.quantity;
      const fefoLots = fefoLotsForBranch(lots, line.productId, branchId);
      for (const lot of fefoLots) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, lot.currentQuantity);
        if (take > 0) {
          stockDecrements.push({ lotId: lot.id, qty: take, reason: `Venta ${number}` });
          remaining -= take;
        }
      }
      if (remaining > 0) {
        toast.error(
          `Stock insuficiente para ${line.productName} (faltan ${remaining} unidades). Refrescá el inventario e intentá de nuevo.`,
        );
        return;
      }
    }

    const newProforma: Proforma = {
      id,
      // SEC-011: clave de idempotencia del cobro (el id de esta emisión). Si el
      // mismo cobro se reenvía (reintento de red / doble-submit), el servidor
      // devuelve la venta ya creada en vez de duplicar factura + NCF.
      idempotencyKey: id,
      // B-02: plan FEFO para descuento atómico de stock en el servidor.
      stockDecrements,
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
      // Vendedor responsable (para incentivos): relación por id + snapshot.
      sellerId: seller.id,
      sellerName: seller.name,
      items: cart.map((l) => {
        // Montos por línea con descuento aplicado (motor único).
        const a = lineAmounts(l);
        return {
          productId: l.productId,
          productSku: l.productSku,
          productName: l.productName,
          lotId: l.lotId,
          lotNumber: l.lotNumber,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          itbisRate: l.itbisRate,
          discount: a.discountBase,
          subtotal: a.netBase,
          itbis: a.itbis,
          total: a.total,
        };
      }),
      subtotal,
      discount: globalDiscountAmount,
      itbis: scaledItbis,
      total,
      // CxC: pago parcial → "partially_paid"; sin pagos → "issued". Ambas con
      // balance > 0 = cuenta por cobrar (el server deriva igual en supabase).
      status: paidTotal >= total ? "paid" : paidTotal > 0 ? "partially_paid" : "issued",
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
      documentKind: docKind,
      ...(ecfType ? { ecfType } : {}),
      ...(sequenceType ? { sequenceType } : {}),
      // Comprobante fiscal generado (NCF B02/B01 o e-CF E32/E31) en mock/demo.
      ...(comprobante ? { ecfNumber: comprobante } : {}),
      // Trazabilidad de la reserva atómica en servidor (modo supabase).
      ...(numberingId ? { numberingId } : {}),
      ...(sequenceEnvironment ? { sequenceEnvironment } : {}),
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
    // ID PERSISTENTE del documento: en supabase es el UUID que devuelve el
    // servidor; en local es el id generado. NUNCA usar el id local temporal
    // para ver/imprimir en producción (rompía con "documento no encontrado").
    const savedId = res.proforma?.id ?? id;

    // Generar incentivos del vendedor (fire-and-forget; no bloquea la venta).
    void generateIncentivesForSale(savedId);

    // B-02: en modo supabase el descuento de inventario ya ocurrió ATÓMICAMENTE
    // dentro de la emisión (RPC `emit_sale_atomic`, plan `stockDecrements`): la
    // venta no pudo persistirse sin descontar el stock. Solo en modo LOCAL/mock
    // aplicamos el plan al store local aquí.
    if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "supabase") {
      const stockErrors: string[] = [];
      for (const d of stockDecrements) {
        const adjResult = await decrementLotStock(d.lotId, d.qty, d.reason ?? `Venta ${number}`);
        if (!adjResult.ok) {
          stockErrors.push(`No se pudo descontar stock (lote ${d.lotId}): ${adjResult.error}`);
        }
      }
      if (stockErrors.length > 0) {
        toast.error(
          `Venta emitida, pero hay errores en el descuento de stock:\n${stockErrors.join("\n")}`,
        );
      }
    }

    setIssued({
      id: savedId,
      number,
      total,
      documentKind: docKind,
      documentLabel: comprobante
        ? `${decision.label} · ${comprobante}`
        : decision.label,
    });
    setCart([]);
    setCartBranchId("");
    setDiscountGlobalPercent(0);
    setCustomerId("");
    setSeller(null);
    setSellerRequired(false);
    setChargeOpen(false);
  };

  // Sin sucursal válida todavía: no cargar catálogo/stock. Mostrar carga o aviso.
  if (!branchReady) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-black/5 bg-white p-10 text-sm text-black/60 shadow-sm">
        {branchesLoading
          ? "Cargando sucursal…"
          : "No hay sucursales activas. Crea o activa una sucursal para vender."}
      </div>
    );
  }

  return (
    <div className="grid min-h-[calc(100vh-12rem)] gap-4 xl:gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(380px,1fr)] xl:grid-cols-[minmax(0,2fr)_minmax(420px,1fr)]">
      {/* ───────────────────────── Izquierda: catálogo ──────────────────── */}
      <div className="flex min-w-0 flex-col rounded-2xl border border-black/5 bg-white shadow-sm">
        {/* Sucursal PRIMERO: se elige a qué sucursal facturar y desde ahí se busca. */}
        {branchId && (
          <div className="flex items-center gap-2 border-b border-black/5 px-4 py-3 text-xs text-black/50">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {canSwitchBranch && activeBranches.length > 1 ? (
              <label className="flex items-center gap-2">
                <span className="font-medium">Facturar a:</span>
                <Select
                  aria-label="Sucursal a facturar"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="h-8 w-auto py-0 text-xs font-medium"
                >
                  {activeBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <span>
                Sucursal: <strong className="text-black/70">{branchName}</strong>
              </span>
            )}
          </div>
        )}
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
          {/* Escanear con cámara (móvil) */}
          <Button
            variant="outline"
            size="md"
            className="sm:hidden"
            onClick={() => setPosScanOpen(true)}
          >
            <ScanBarcode className="h-4 w-4" />
            Escanear
          </Button>
          {/* Simular escaneo (desktop / lector) */}
          <Button
            variant="outline"
            size="md"
            className="hidden sm:inline-flex"
            onClick={() => filtered[0] && addProduct(filtered[0].id)}
          >
            <ScanBarcode className="h-4 w-4" />
            Simular escaneo
          </Button>
          <Button
            variant={onlyFavorites ? "primary" : "outline"}
            size="md"
            onClick={() => setOnlyFavorites((v) => !v)}
            title={onlyFavorites ? "Ver todos los productos" : "Ver solo favoritos"}
            aria-pressed={onlyFavorites}
          >
            <Star className={`h-4 w-4 ${onlyFavorites ? "fill-current" : ""}`} />
            <span className="hidden sm:inline">
              {onlyFavorites ? "Favoritos" : "Solo favoritos"}
            </span>
          </Button>
        </div>

        {/* ── Banner: sin stock en esta sucursal ──────────────────────────── */}
        {noBranchStock && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <span>
                No hay stock en <strong>{branchName}</strong>.{" "}
                {alternativeBranchName && (
                  <>Hay stock en <strong>{alternativeBranchName}</strong>. </>
                )}
                Cambiá de sucursal o usá{" "}
                <strong>&quot;Agregar stock&quot;</strong> en un producto.
              </span>
            </div>
          </div>
        )}
        {noStockAnywhere && !noBranchStock && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-black/10 bg-black/[0.03] p-3 text-xs text-black/60">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Aún no hay stock cargado. Usá <strong>&quot;Agregar stock&quot;</strong> en un producto.
            </span>
          </div>
        )}

        <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filtered.map((p) => {
            const pLots = lotsFor(p.id);
            const stockHere = branchId
              ? sellableStockForBranch(pLots, p.id, branchId)
              : 0;
            const totalStock = totalSellableStock(pLots, p.id, activeBranchIds);
            const lot = branchId
              ? nextFefoLotForBranch(pLots, p.id, branchId)
              : null;
            const outOfStockHere = stockHere === 0;
            const availableElsewhere = outOfStockHere && totalStock > 0;
            const block = outOfStockHere
              ? lotBlockReason(pLots, p.id, branchId, activeBranchIds)
              : null;
            const blockLabel =
              block && block !== "no-lot" && block !== "depleted"
                ? blockReasonLabel(block)
                : null;

            return (
              <ProductCard
                key={p.id}
                name={p.name}
                sku={p.sku}
                price={p.price}
                imageUrl={p.imageUrl ?? undefined}
                imageAlt={p.imageAlt ?? undefined}
                minStock={p.minStock}
                stockHere={stockHere}
                availableElsewhere={availableElsewhere}
                blockLabel={blockLabel}
                lotNumber={lot?.lotNumber}
                lotExpiresAt={lot?.expiresAt}
                onAdd={() => addProduct(p.id)}
                onViewBranchStock={() =>
                  setBranchStockModal({ productId: p.id, productName: p.name })
                }
                isFavorite={isFavorite(p.id)}
                onToggleFavorite={() => toggleFavorite(p.id)}
              />
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm opacity-60">
              {onlyFavorites
                ? "Todavía no tienes productos favoritos. Marca productos con ⭐ para vender más rápido."
                : "Sin productos coincidentes."}
            </div>
          )}
        </div>
      </div>

      {/* Backdrop del carrito en móvil */}
      {mobileCartOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileCartOpen(false)}
          aria-hidden
        />
      )}

      {/* ─────────────────────── Derecha: venta actual ──────────────────── */}
      <div
        className={`flex min-w-0 flex-col self-start rounded-2xl border border-slate-200 bg-white shadow-sm max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-50 max-lg:max-h-[88vh] max-lg:overflow-y-auto max-lg:rounded-b-none max-lg:shadow-2xl max-lg:transition-transform max-lg:duration-300 ${
          mobileCartOpen ? "max-lg:translate-y-0" : "max-lg:translate-y-full"
        }`}
      >
        {/* Barra para cerrar en móvil */}
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-2 lg:hidden">
          <span className="text-xs font-medium opacity-60">Venta actual</span>
          <button
            type="button"
            onClick={() => setMobileCartOpen(false)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-black/5"
          >
            Cerrar ✕
          </button>
        </div>
        <div className="border-b border-black/5 p-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingCart className="h-4 w-4" /> Venta actual
            </h2>
            {cart.length > 0 && (
              <button
                onClick={() => {
                  setCart([]);
                  setCartBranchId("");
                }}
                className="text-xs opacity-60 hover:text-rose-700"
              >
                Vaciar
              </button>
            )}
          </div>
          <div className="mt-3">
            {/* No se pasa `businessId`: los clientes ya vienen scopeados por
                business_id (RLS en Supabase, single-tenant en mock). Pasar la
                constante mock "biz_dermaland" excluía a TODOS los clientes
                reales (cuyo businessId es el UUID), por eso WILLIAN no aparecía. */}
            <CustomerSearchSelect
              ref={customerSelectRef}
              clients={customers}
              value={customer ?? null}
              allowWalkIn={false}
              invalid={customerRequired}
              onChange={(c) => {
                setCustomerId(c?.id ?? "");
                if (c) setCustomerRequired(false);
              }}
              onCreateNew={() => setQuickCreateOpen(true)}
            />
            {customerRequired && !customer && (
              <p className="mt-1 text-[11px] text-rose-600">
                Cliente obligatorio para facturar.
              </p>
            )}
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
            <label className="mb-1 block text-[11px] font-medium opacity-70">
              Vendedor <span className="text-rose-600">*</span>
            </label>
            <SellerSelect
              sellers={sellers}
              value={seller}
              loading={sellersLoading}
              invalid={sellerRequired}
              onChange={(s) => {
                setSeller(s);
                if (s) setSellerRequired(false);
              }}
            />
            {sellerRequired && !seller && (
              <p className="mt-1 text-[11px] text-rose-600">
                Selecciona el vendedor responsable de la venta.
              </p>
            )}
          </div>

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

        <div className="max-h-[55vh] overflow-y-auto">
          {cart.length === 0 && !issued && (
            <div className="flex flex-col items-center justify-center px-8 py-12 text-center text-sm opacity-60">
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
                {/* Facturas → /ventas; proformas → /proformas. */}
                <Link
                  href={`/${issued.documentKind === "invoice" ? "ventas" : "proformas"}/${issued.id}/print?auto=1`}
                  target="_blank"
                >
                  <Button size="sm">Imprimir ticket</Button>
                </Link>
                <Link
                  href={`/${issued.documentKind === "invoice" ? "ventas" : "proformas"}/${issued.id}/print`}
                  target="_blank"
                >
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
              const amt = lineAmounts(l);
              const hasDiscount = l.discountType !== "none" && amt.discountInclusive > 0;
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
                      <button
                        type="button"
                        onClick={() => setDiscountLot(l.lotId)}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--brand-accent)] hover:underline"
                        aria-label={`Descuento de ${l.productName}`}
                      >
                        <Percent className="h-3 w-3" />
                        {hasDiscount
                          ? l.discountType === "percent"
                            ? `Descuento: ${l.discountValue}% (-${formatCurrency(amt.discountInclusive)})`
                            : `Descuento: -${formatCurrency(amt.discountInclusive)}`
                          : "Agregar descuento"}
                      </button>
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
                      <div className="text-right">
                        {hasDiscount && (
                          <div className="text-[10px] tabular-nums text-black/40 line-through">
                            {formatCurrency(amt.grossInclusive)}
                          </div>
                        )}
                        <div className="text-sm font-semibold tabular-nums">
                          {formatCurrency(amt.total)}
                        </div>
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
              <Row label="Subtotal bruto" value={formatCurrency(totals.subtotalBruto)} />
              {totals.lineDiscounts > 0 && (
                <Row
                  label="Descuentos productos"
                  value={`-${formatCurrency(totals.lineDiscounts)}`}
                />
              )}
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
                  label="Descuento global"
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
                // 1) Cliente obligatorio — antes de carrito/caja/stock/pago.
                if (!isRealCustomerSelected(customer)) {
                  toast.error(CUSTOMER_REQUIRED_MESSAGE);
                  setCustomerRequired(true);
                  customerSelectRef.current?.focus();
                  return;
                }
                // 2) Resto de validaciones (carrito, stock, RNC).
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
        creditCustomerName={customer ? `${customer.firstName} ${customer.lastName}`.trim() : null}
      />
      <QuickCreateCustomerModal
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={(c) => {
          setCustomerId(c.id);
          setCustomerRequired(false);
        }}
      />
      <toast.Toast />

      {/* Modal de stock por sucursal + acciones (cambiar / agregar / transferir) */}
      {branchStockModal && (
        <BranchStockModal
          open={true}
          productName={branchStockModal.productName}
          rows={stockByBranchForProduct(lots, branchStockModal.productId).filter(
            (r) => activeBranchIds.has(r.branchId),
          )}
          currentBranchId={branchId}
          currentBranchName={branchName}
          onClose={() => setBranchStockModal(null)}
          onSwitchBranch={switchToBranchWithStock}
          onAddStockHere={() => {
            setAddStockProduct({
              id: branchStockModal.productId,
              name: branchStockModal.productName,
            });
            setBranchStockModal(null);
          }}
        />
      )}

      {/* Agregar stock aquí — preseleccionado a la sucursal actual del POS */}
      {addStockProduct && (
        <NewLotModal
          open={true}
          onClose={() => setAddStockProduct(null)}
          productId={addStockProduct.id}
          productName={addStockProduct.name}
          defaultBranchId={branchId || undefined}
          requireExpiry={true}
        />
      )}

      {/* Cambio de sucursal con carrito no vacío: confirmar antes de limpiar. */}
      <ConfirmDialog
        open={branchSwitchOpen}
        destructive={false}
        title="Cambiar de sucursal"
        message="Cambiar de sucursal limpiará la venta actual porque el stock depende de la sucursal. ¿Deseas continuar?"
        confirmLabel="Cambiar sucursal"
        cancelLabel="Cancelar"
        onConfirm={() => {
          setCart([]);
          setCartBranchId("");
          setBranchSwitchOpen(false);
        }}
        onCancel={() => {
          // Revertir la selección global a la sucursal del carrito.
          setBranchId(cartBranchId);
          setBranchSwitchOpen(false);
        }}
      />

      {/* Descuento por línea */}
      {(() => {
        const dl = cart.find((l) => l.lotId === discountLot);
        if (!dl) return null;
        return (
          <LineDiscountModal
            open={true}
            productName={dl.productName}
            unitPrice={dl.unitPrice}
            itbisRate={dl.itbisRate}
            quantity={dl.quantity}
            initialType={dl.discountType}
            initialValue={dl.discountValue}
            initialReason={dl.discountReason}
            onClose={() => setDiscountLot(null)}
            onApply={(type, value, reason) =>
              applyLineDiscount(dl.lotId, type, value, reason)
            }
          />
        );
      })()}

      {/* Escaneo con cámara del celular */}
      <BarcodeScanModal
        open={posScanOpen}
        onClose={() => setPosScanOpen(false)}
        onDetected={(code) => {
          const c = code.trim();
          const p =
            products.find((x) => (x.barcode ?? "") !== "" && x.barcode === c) ??
            products.find((x) => x.sku.toLowerCase() === c.toLowerCase());
          if (p) addProduct(p.id);
          else toast.error("Producto no encontrado.");
        }}
      />

      {/* Botón flotante del carrito (solo móvil) */}
      {!mobileCartOpen && (
        <button
          type="button"
          onClick={() => setMobileCartOpen(true)}
          className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--brand-primary)] px-5 py-3.5 text-white shadow-xl active:scale-[0.99] lg:hidden"
          aria-label="Ver carrito"
        >
          <span className="flex items-center gap-2">
            <span className="relative">
              <ShoppingCart className="h-5 w-5" />
              {cart.length > 0 && (
                <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold">
                  {cart.length}
                </span>
              )}
            </span>
            <span className="text-sm font-medium">
              {cart.length} {cart.length === 1 ? "item" : "items"}
            </span>
          </span>
          <span className="text-base font-bold tabular-nums">{formatCurrency(total)}</span>
        </button>
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
