"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ArrowRightLeft,
  AlertTriangle,
  ScanBarcode,
  Smartphone,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  Textarea,
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
  useActiveBranches,
  useCurrentBranch,
  resolveBranchName,
} from "@/features/tenancy/branch-store";
import { formatDate } from "@/lib/utils/format";
import {
  LOT_BACKEND,
  fetchLotsFromServer,
  listLotsByProduct,
} from "@/features/inventory/lot-store";
import { submitTransfer } from "@/features/inventory/transfer-store";
import { useProducts } from "@/features/products/product-store";
import { findProductByCode } from "@/features/inventory-counts/scan-session-store";
import { resolveTransferPrefill } from "@/features/inventory/transfer-prefill";
import { addProductLine, type TransferLine } from "@/features/inventory/transfer-lines";
import { BarcodeScanModal } from "@/features/products/components/barcode-scan-modal";
import type { ProductLot } from "@/types";

const today = () => new Date().toISOString().slice(0, 10);

/** Lotes de UN producto (por productId, nunca capado) filtrados al origen. */
async function fetchProductLots(productId: string): Promise<ProductLot[]> {
  return LOT_BACKEND === "supabase"
    ? fetchLotsFromServer(productId)
    : listLotsByProduct(productId);
}
function scopeToOrigin(lots: ProductLot[], originBranchId: string): ProductLot[] {
  return lots.filter(
    (l) =>
      l.branchId === originBranchId &&
      l.status === "available" &&
      l.currentQuantity > 0,
  );
}

function NuevaTransferenciaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillProductId = searchParams.get("producto");
  const toast = useToast();
  const branches = useActiveBranches();
  const { branchId: currentBranchId } = useCurrentBranch();
  const products = useProducts();
  const productById = React.useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const [origin, setOrigin] = React.useState("");
  const [destination, setDestination] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [notes, setNotes] = React.useState("");
  const [responsible, setResponsible] = React.useState("Rosa Peralta");
  const [lines, setLines] = React.useState<TransferLine[]>([]);
  // Lotes por producto (ya filtrados al origen). Se limpia al cambiar de origen.
  const [lotsByProduct, setLotsByProduct] = React.useState<Record<string, ProductLot[]>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [scanValue, setScanValue] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [lastScan, setLastScan] = React.useState<{ ok: boolean; text: string } | null>(null);
  const scanInputRef = React.useRef<HTMLInputElement>(null);

  const lotsFor = React.useCallback(
    (productId: string) => lotsByProduct[productId] ?? [],
    [lotsByProduct],
  );

  // Cambio de origen por el usuario: reinicia líneas y caché de lotes.
  const changeOrigin = (value: string) => {
    setOrigin(value);
    setLines([]);
    setLotsByProduct({});
    setLastScan(null);
    setError(null);
  };

  // Agrega (o incrementa) un producto: carga sus lotes en el origen si hace falta.
  const addProduct = React.useCallback(
    async (product: { id: string; name: string }) => {
      if (!origin) {
        toast.error("Selecciona primero la sucursal origen.");
        return;
      }
      let lots = lotsByProduct[product.id];
      if (!lots) {
        lots = scopeToOrigin(await fetchProductLots(product.id), origin);
        setLotsByProduct((prev) => ({ ...prev, [product.id]: lots! }));
      }
      const outcome = addProductLine({ lines, product, lots });
      if (outcome.result === "no_stock") {
        setLastScan({ ok: false, text: `${product.name} no tiene stock en la sucursal origen.` });
        toast.error(`${product.name} no tiene stock en la sucursal origen.`);
        return;
      }
      setLines(outcome.lines);
      if (outcome.result === "at_max") {
        setLastScan({ ok: true, text: `${product.name} · máximo del lote (${outcome.quantity}).` });
        toast.show(`Alcanzaste el stock disponible del lote (${outcome.quantity}).`, "info");
      } else {
        setLastScan({ ok: true, text: `${product.name} · cantidad ${outcome.quantity}` });
      }
    },
    [origin, lines, lotsByProduct, toast],
  );

  const handleScanCode = React.useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      if (!origin) {
        toast.error("Selecciona primero la sucursal origen.");
        return;
      }
      const product = findProductByCode(products, code);
      if (!product) {
        setLastScan({ ok: false, text: `Código ${code} no encontrado.` });
        toast.error(`Código ${code} no encontrado.`);
        return;
      }
      await addProduct({ id: product.id, name: product.name });
    },
    [origin, products, addProduct, toast],
  );

  const submitScanInput = () => {
    const raw = scanValue.trim();
    setScanValue("");
    void handleScanCode(raw);
    scanInputRef.current?.focus();
  };

  // Sugerencias de búsqueda por nombre / SKU / código de barra.
  const suggestions = React.useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(t) ||
          p.sku.toLowerCase().includes(t) ||
          (p.barcode ?? "").includes(search.trim()),
      )
      .slice(0, 8);
  }, [search, products]);

  // Deep-link desde el detalle de producto (?producto=<id>): elige origen (prefiere
  // la sucursal actual) y precarga el lote FEFO de ESE producto. Corre una vez.
  const prefilledRef = React.useRef(false);
  React.useEffect(() => {
    if (prefilledRef.current || !prefillProductId || !currentBranchId) return;
    const product = productById.get(prefillProductId);
    if (!product) return; // esperar a que carguen los productos
    prefilledRef.current = true;
    void (async () => {
      const productLots = await fetchProductLots(prefillProductId);
      const result = resolveTransferPrefill({
        productId: prefillProductId,
        currentBranchId,
        lots: productLots,
      });
      if (!result) {
        setLastScan({
          ok: false,
          text: `${product.name} no tiene stock disponible en ninguna sucursal.`,
        });
        return;
      }
      const scoped = scopeToOrigin(productLots, result.originBranchId);
      setOrigin(result.originBranchId);
      setLotsByProduct({ [prefillProductId]: scoped });
      setLines([
        {
          productId: prefillProductId,
          productName: product.name,
          lotId: result.lotId,
          quantity: "1",
        },
      ]);
      setLastScan({ ok: true, text: `${product.name} · cantidad 1` });
    })();
  }, [prefillProductId, currentBranchId, productById]);

  const setLine = (i: number, patch: Partial<TransferLine>) =>
    setLines((prev) => prev.map((l, ix) => (ix === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) =>
    setLines((prev) => prev.filter((_, ix) => ix !== i));

  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);

  const validateLocal = (): string | null => {
    if (!origin) return "Selecciona la sucursal origen.";
    if (!destination) return "Selecciona la sucursal destino.";
    if (origin === destination)
      return "La sucursal origen y destino no pueden ser iguales.";
    if (!date) return "Indica la fecha.";
    const valid = lines.filter((l) => l.lotId && Number(l.quantity) > 0);
    if (valid.length === 0) return "Agrega al menos un producto con cantidad.";
    for (const l of valid) {
      const lot = lotsFor(l.productId).find((x) => x.id === l.lotId);
      if (!lot) return `El lote de ${l.productName} ya no está disponible.`;
      if (Number(l.quantity) > lot.currentQuantity) {
        return `La cantidad de ${l.productName} supera el stock del lote.`;
      }
    }
    return null;
  };

  const tryGuardar = () => {
    const e = validateLocal();
    if (e) {
      setError(e);
      return;
    }
    setError(null);
    setConfirm(true);
  };

  const doGuardar = async () => {
    if (saving) return;
    setConfirm(false);
    const items = lines
      .filter((l) => l.lotId && Number(l.quantity) > 0)
      .map((l) => ({ lotId: l.lotId, productId: l.productId, quantity: Number(l.quantity) }));
    setSaving(true);
    const res = await submitTransfer({
      originBranchId: origin,
      destinationBranchId: destination,
      transferDate: date,
      notes: notes || undefined,
      items,
      createdByName: responsible,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success(`Transferencia ${res.transfer.transferNumber} creada.`);
    setTimeout(
      () => router.push(`/inventario/transferencias/${res.transfer.id}`),
      600,
    );
  };

  return (
    <>
      <Link
        href="/inventario/transferencias"
        className="mb-4 inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
      >
        <ArrowLeft className="h-3 w-3" /> Volver a transferencias
      </Link>
      <PageHeader
        title="Nueva transferencia entre sucursales"
        breadcrumbs={[
          { label: "Inventario", href: "/inventario" },
          { label: "Transferencias", href: "/inventario/transferencias" },
          { label: "Nueva" },
        ]}
      />

      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
        Selecciona la sucursal origen y destino, luego agrega los productos a mover
        (escaneando su código, buscándolos por nombre, o desde el botón “Transferir”
        de un producto). Para cada producto solo verás sus propios lotes del origen.
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      <Card className="mb-6">
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Sucursal origen *</Label>
              <Select value={origin} onChange={(e) => changeOrigin(e.target.value)}>
                <option value="">— Selecciona —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Sucursal destino *</Label>
              <Select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                <option value="">— Selecciona —</option>
                {branches
                  .filter((b) => b.id !== origin)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <Label>Fecha *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Usuario responsable</Label>
              <Input value={responsible} onChange={(e) => setResponsible(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Observaciones</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Motivo de la transferencia, referencia, etc."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agregar productos (solo cuando hay origen) */}
      {origin && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex-1">
                <Label>
                  <ScanBarcode className="mr-1 inline h-4 w-4" /> Escanear código de
                  barra o escribir SKU
                </Label>
                <Input
                  ref={scanInputRef}
                  value={scanValue}
                  onChange={(e) => setScanValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitScanInput();
                    }
                  }}
                  placeholder="Escanea con el lector o escribe y presiona Enter…"
                  className="h-12 text-base"
                />
              </div>
              <Button type="button" variant="outline" onClick={() => setCameraOpen(true)}>
                <Smartphone className="h-4 w-4" /> Escanear con cámara
              </Button>
            </div>

            <div className="relative mt-3">
              <Label>Buscar producto por nombre</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Escribe el nombre del producto…"
              />
              {suggestions.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-black/10 bg-white shadow-lg">
                  {suggestions.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5"
                        onClick={() => {
                          setSearch("");
                          void addProduct({ id: p.id, name: p.name });
                        }}
                      >
                        <span className="font-medium">{p.name}</span>{" "}
                        <span className="font-mono text-xs opacity-60">{p.sku}</span>
                        {p.barcode ? (
                          <span className="ml-1 font-mono text-xs opacity-40">
                            · {p.barcode}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {lastScan && (
              <div
                className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  lastScan.ok
                    ? "bg-emerald-50 text-emerald-900"
                    : "bg-rose-50 text-rose-900"
                }`}
              >
                {lastScan.ok ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                <span>{lastScan.text}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardContent className="p-0">
          <div className="border-b border-black/5 px-4 py-3 text-sm font-semibold">
            Productos a transferir
          </div>

          {!origin ? (
            <div className="px-4 py-10 text-center text-sm opacity-60">
              Selecciona primero la sucursal origen.
            </div>
          ) : lines.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm opacity-60">
              Escanea o busca un producto para agregarlo a la transferencia.
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Producto</TH>
                  <TH>Lote</TH>
                  <TH>Vence</TH>
                  <TH className="text-right">Disponible</TH>
                  <TH className="text-right">A transferir</TH>
                  <TH className="text-right pr-4"></TH>
                </TR>
              </THead>
              <TBody>
                {lines.map((line, i) => {
                  const lots = lotsFor(line.productId);
                  const lot = lots.find((l) => l.id === line.lotId);
                  const over =
                    lot != null && Number(line.quantity) > lot.currentQuantity;
                  return (
                    <TR key={`${line.productId}-${i}`}>
                      <TD>
                        <div className="text-sm font-medium">{line.productName}</div>
                        <div className="text-[11px] opacity-60">
                          {productById.get(line.productId)?.sku}
                        </div>
                      </TD>
                      <TD>
                        <Select
                          value={line.lotId}
                          onChange={(e) => setLine(i, { lotId: e.target.value })}
                        >
                          {lots.length === 0 && (
                            <option value="">— sin lotes —</option>
                          )}
                          {lots.map((l) => (
                            <option key={l.id} value={l.id}>
                              lote {l.lotNumber} · vence {formatDate(l.expiresAt)} (disp.{" "}
                              {l.currentQuantity})
                            </option>
                          ))}
                        </Select>
                      </TD>
                      <TD className="text-xs">
                        {lot ? formatDate(lot.expiresAt) : "—"}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {lot ? lot.currentQuantity : "—"}
                      </TD>
                      <TD className="text-right">
                        <Input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(e) => setLine(i, { quantity: e.target.value })}
                          className={`ml-auto w-24 text-right ${
                            over ? "border-rose-400" : ""
                          }`}
                          disabled={!lot}
                        />
                      </TD>
                      <TD className="pr-4 text-right">
                        <button
                          type="button"
                          aria-label="Quitar producto"
                          title="Quitar producto"
                          onClick={() => removeLine(i)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          Total a transferir: <strong className="tabular-nums">{total}</strong>{" "}
          unidades
        </div>
        <div className="flex gap-2">
          <Link href="/inventario/transferencias">
            <Button variant="outline" size="sm">
              Cancelar
            </Button>
          </Link>
          <Button size="sm" onClick={tryGuardar} disabled={saving}>
            <ArrowRightLeft className="h-4 w-4" />{" "}
            {saving ? "Guardando…" : "Guardar transferencia"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Confirmar transferencia"
        destructive={false}
        confirmLabel="Confirmar y mover stock"
        message={
          <>
            Se moverán <strong>{total}</strong> unidades de{" "}
            <strong>{resolveBranchName(origin)}</strong> a{" "}
            <strong>{resolveBranchName(destination)}</strong>. Esta acción
            descuenta del origen y suma al destino.
          </>
        }
        onCancel={() => setConfirm(false)}
        onConfirm={doGuardar}
      />
      <BarcodeScanModal
        open={cameraOpen}
        continuous
        onClose={() => setCameraOpen(false)}
        onDetected={(code) => void handleScanCode(code)}
      />
      <toast.Toast />
    </>
  );
}

export default function NuevaTransferenciaPage() {
  return (
    <React.Suspense
      fallback={<div className="p-6 text-sm opacity-60">Cargando…</div>}
    >
      <NuevaTransferenciaContent />
    </React.Suspense>
  );
}
