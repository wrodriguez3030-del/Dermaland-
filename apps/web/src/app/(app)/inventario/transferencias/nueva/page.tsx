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
import { getProductById } from "@/lib/mock-data/catalog";
import { formatDate } from "@/lib/utils/format";
import { listAllLots, useInventoryTick } from "@/features/inventory/lot-store";
import { createTransfer } from "@/features/inventory/transfer-store";
import { listAllProducts } from "@/features/products/product-store";
import {
  applyTransferScan,
  type TransferRow,
} from "@/features/inventory/transfer-scan";
import { resolveTransferPrefill } from "@/features/inventory/transfer-prefill";
import { BarcodeScanModal } from "@/features/products/components/barcode-scan-modal";
import type { ProductLot } from "@/types";

const today = () => new Date().toISOString().slice(0, 10);

function NuevaTransferenciaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillProductId = searchParams.get("producto");
  const toast = useToast();
  useInventoryTick();
  const branches = useActiveBranches();
  const { branchId: currentBranchId } = useCurrentBranch();

  const [origin, setOrigin] = React.useState("");
  const [destination, setDestination] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [notes, setNotes] = React.useState("");
  const [responsible, setResponsible] = React.useState("Rosa Peralta");
  const [rows, setRows] = React.useState<TransferRow[]>([{ lotId: "", quantity: "" }]);
  const [error, setError] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  const [scanValue, setScanValue] = React.useState("");
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [lastScan, setLastScan] = React.useState<{ ok: boolean; text: string } | null>(null);
  const scanInputRef = React.useRef<HTMLInputElement>(null);

  // Deep-link desde el detalle de producto (?producto=<id>): precarga origen
  // (prefiere la sucursal actual) y el lote FEFO de ese producto. Corre una sola
  // vez, cuando ya cargó la sucursal actual.
  const prefilledRef = React.useRef(false);
  React.useEffect(() => {
    if (prefilledRef.current || !prefillProductId || !currentBranchId) return;
    const result = resolveTransferPrefill({
      productId: prefillProductId,
      currentBranchId,
      lots: listAllLots(),
    });
    prefilledRef.current = true;
    if (result) {
      setOrigin(result.originBranchId);
      setRows([{ lotId: result.lotId, quantity: "1" }]);
      const p = getProductById(prefillProductId);
      if (p) setLastScan({ ok: true, text: `${p.name} · cantidad 1` });
    }
  }, [prefillProductId, currentBranchId]);

  // Lotes disponibles en la sucursal origen.
  const availableLots = React.useMemo(() => {
    if (!origin) return [] as ProductLot[];
    return listAllLots().filter(
      (l) => l.branchId === origin && l.status === "available" && l.currentQuantity > 0,
    );
  }, [origin]);

  const lotById = (id: string) => availableLots.find((l) => l.id === id);

  const total = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);

  const addRow = () => setRows((r) => [...r, { lotId: "", quantity: "" }]);
  const removeRow = (i: number) =>
    setRows((r) => (r.length === 1 ? r : r.filter((_, ix) => ix !== i)));
  const setRow = (i: number, patch: Partial<TransferRow>) =>
    setRows((r) => r.map((row, ix) => (ix === i ? { ...row, ...patch } : row)));

  const handleScan = (raw: string) => {
    const outcome = applyTransferScan({
      code: raw,
      originSelected: !!origin,
      rows,
      availableLots,
      products: listAllProducts(),
    });
    switch (outcome.result) {
      case "empty":
        break;
      case "no_origin":
        toast.error("Selecciona primero la sucursal origen.");
        break;
      case "not_found":
        setLastScan({ ok: false, text: `Código ${outcome.code} no encontrado.` });
        toast.error(`Código ${outcome.code} no encontrado.`);
        break;
      case "no_stock":
        setLastScan({
          ok: false,
          text: `${outcome.product.name} no tiene stock en la sucursal origen.`,
        });
        toast.error(`${outcome.product.name} no tiene stock en la sucursal origen.`);
        break;
      case "at_max":
        setRows(outcome.rows);
        setLastScan({
          ok: true,
          text: `${outcome.product.name} · máximo del lote (${outcome.quantity}).`,
        });
        toast.show(`Alcanzaste el stock disponible del lote (${outcome.quantity}).`, "info");
        break;
      case "added":
      case "incremented":
        setRows(outcome.rows);
        setLastScan({
          ok: true,
          text: `${outcome.product.name} · cantidad ${outcome.quantity}`,
        });
        break;
    }
  };

  const submitScanInput = () => {
    const raw = scanValue.trim();
    setScanValue("");
    handleScan(raw);
    scanInputRef.current?.focus();
  };

  const validateLocal = (): string | null => {
    if (!origin) return "Selecciona la sucursal origen.";
    if (!destination) return "Selecciona la sucursal destino.";
    if (origin === destination)
      return "La sucursal origen y destino no pueden ser iguales.";
    if (!date) return "Indica la fecha.";
    const valid = rows.filter((r) => r.lotId && Number(r.quantity) > 0);
    if (valid.length === 0) return "Agrega al menos un producto con cantidad.";
    for (const r of valid) {
      const lot = lotById(r.lotId);
      if (!lot) return "Uno de los lotes ya no está disponible.";
      if (Number(r.quantity) > lot.currentQuantity) {
        return "La cantidad a transferir supera el stock disponible.";
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

  const doGuardar = () => {
    const items = rows
      .filter((r) => r.lotId && Number(r.quantity) > 0)
      .map((r) => {
        const lot = lotById(r.lotId)!;
        return { lotId: r.lotId, productId: lot.productId, quantity: Number(r.quantity) };
      });
    const res = createTransfer({
      originBranchId: origin,
      destinationBranchId: destination,
      transferDate: date,
      notes: notes || undefined,
      items,
      createdByName: responsible,
    });
    setConfirm(false);
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
        Selecciona la sucursal origen, la sucursal destino y los productos/lotes
        que deseas mover. El sistema descontará del origen y sumará al destino
        automáticamente, conservando el lote y su vencimiento.
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
              <Select
                value={origin}
                onChange={(e) => {
                  setOrigin(e.target.value);
                  setRows([{ lotId: "", quantity: "" }]);
                }}
              >
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
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Usuario responsable</Label>
              <Input
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
              />
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
                <p className="mt-1 text-xs opacity-60">
                  El lector funciona como teclado: cada escaneo agrega el producto
                  (lote de vencimiento más próximo) y suma +1. El lote es editable
                  en la fila.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCameraOpen(true)}
              >
                <Smartphone className="h-4 w-4" /> Escanear con cámara
              </Button>
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
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
            <div className="text-sm font-semibold">Productos y servicios</div>
            <Button
              size="sm"
              variant="outline"
              onClick={addRow}
              disabled={!origin}
            >
              <Plus className="h-4 w-4" /> Agregar producto
            </Button>
          </div>

          {!origin ? (
            <div className="px-4 py-10 text-center text-sm opacity-60">
              Selecciona primero la sucursal origen para ver los lotes
              disponibles.
            </div>
          ) : availableLots.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm opacity-60">
              La sucursal origen no tiene lotes disponibles para transferir.
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Producto / Lote</TH>
                  <TH>Vence</TH>
                  <TH className="text-right">Disponible</TH>
                  <TH className="text-right">A transferir</TH>
                  <TH className="text-right pr-4"></TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row, i) => {
                  const lot = lotById(row.lotId);
                  const product = lot ? getProductById(lot.productId) : undefined;
                  const over =
                    lot != null && Number(row.quantity) > lot.currentQuantity;
                  return (
                    <TR key={i}>
                      <TD>
                        <Select
                          value={row.lotId}
                          onChange={(e) => setRow(i, { lotId: e.target.value })}
                        >
                          <option value="">— Selecciona producto / lote —</option>
                          {availableLots.map((l) => {
                            const p = getProductById(l.productId);
                            return (
                              <option key={l.id} value={l.id}>
                                {p?.name ?? "Producto no encontrado"} · {p?.sku} · lote{" "}
                                {l.lotNumber} (disp. {l.currentQuantity})
                              </option>
                            );
                          })}
                        </Select>
                        {product && (
                          <div className="mt-1 text-[11px] opacity-60">
                            {product.sku}
                            {product.barcode ? ` · ${product.barcode}` : ""}
                          </div>
                        )}
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
                          value={row.quantity}
                          onChange={(e) => setRow(i, { quantity: e.target.value })}
                          className={`ml-auto w-24 text-right ${
                            over ? "border-rose-400" : ""
                          }`}
                          disabled={!lot}
                        />
                      </TD>
                      <TD className="pr-4 text-right">
                        <button
                          type="button"
                          aria-label="Eliminar fila"
                          title="Eliminar fila"
                          onClick={() => removeRow(i)}
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
          <Button size="sm" onClick={tryGuardar}>
            <ArrowRightLeft className="h-4 w-4" /> Guardar transferencia
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
        onDetected={handleScan}
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
