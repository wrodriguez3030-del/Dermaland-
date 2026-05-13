"use client";

import * as React from "react";
import {
  ScanLine,
  Pause,
  Play,
  Send,
  Camera,
  Bluetooth,
  Hash,
  Trash2,
  Minus,
  Plus,
  AlertTriangle,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import {
  formatTime,
  daysUntil,
  formatDate,
} from "@/lib/utils/format";
import {
  mockProducts,
  mockProductLots,
  getProductById,
  getProductByBarcode,
} from "@/lib/mock-data/catalog";
import { useBarcodeScanner } from "./use-barcode-scanner";

interface ScanLineRecord {
  productId: string;
  productSku: string;
  productName: string;
  lotId: string;
  lotNumber: string;
  expiresAt: string;
  lotStatus: string;
  scannedQuantity: number;
  lastScanAt: string;
  scans: { source: "camera" | "bluetooth_scanner" | "manual"; at: string }[];
}

const POOL = mockProductLots.filter(
  (l) => l.status === "available" || l.status === "expired",
);

interface MobileScannerProps {
  countNumber: string;
  branchName: string;
  warehouseName: string;
}

export function MobileScanner({
  countNumber,
  branchName,
  warehouseName,
}: MobileScannerProps) {
  const [paused, setPaused] = React.useState(false);
  const [scanSource, setScanSource] = React.useState<
    "camera" | "bluetooth_scanner"
  >("camera");
  const [lines, setLines] = React.useState<ScanLineRecord[]>([]);
  const [flash, setFlash] = React.useState(false);
  const [lastFeedback, setLastFeedback] = React.useState<{
    at: number;
    type: "ok" | "warn" | "err";
    text: string;
  } | null>(null);
  const [showManual, setShowManual] = React.useState(false);
  const [showRemove, setShowRemove] = React.useState<string | null>(null);
  const [removeReason, setRemoveReason] = React.useState("");
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  const accumulated = lines.reduce((s, l) => s + l.scannedQuantity, 0);

  const recordScan = React.useCallback(
    (
      source: "camera" | "bluetooth_scanner" | "manual",
      lot: (typeof mockProductLots)[number],
    ) => {
      const product = getProductById(lot.productId);
      if (!product) return;
      const at = new Date().toISOString();
      const isExpired = lot.status === "expired" || daysUntil(lot.expiresAt) < 0;

      setLines((prev) => {
        const ix = prev.findIndex((l) => l.lotId === lot.id);
        if (ix >= 0) {
          const next = [...prev];
          const line = next[ix]!;
          next[ix] = {
            ...line,
            scannedQuantity: line.scannedQuantity + 1,
            lastScanAt: at,
            scans: [...line.scans, { source, at }],
          };
          return next;
        }
        return [
          {
            productId: product.id,
            productSku: product.sku,
            productName: product.name,
            lotId: lot.id,
            lotNumber: lot.lotNumber,
            expiresAt: lot.expiresAt,
            lotStatus: lot.status,
            scannedQuantity: 1,
            lastScanAt: at,
            scans: [{ source, at }],
          },
          ...prev,
        ];
      });

      setFlash(true);
      setTimeout(() => setFlash(false), 180);
      setLastFeedback({
        at: Date.now(),
        type: isExpired ? "warn" : "ok",
        text: isExpired
          ? `${product.name} — lote vencido (registrado para revisión)`
          : `${product.name} +1`,
      });

      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(isExpired ? [40, 60, 40] : 30);
      }
    },
    [],
  );

  // Hook real: cámara + Bluetooth + debounce automático
  const { cameraError, cameraReady, emit } = useBarcodeScanner({
    enabled: !paused,
    source: scanSource,
    onScan: ({ barcode, source }) => {
      const product = getProductByBarcode(barcode);
      if (!product) {
        setLastFeedback({
          at: Date.now(),
          type: "err",
          text: `Barcode ${barcode} no encontrado en catálogo`,
        });
        return;
      }
      const lot =
        mockProductLots.find((l) => l.productId === product.id) ?? null;
      if (!lot) return;
      recordScan(source, lot);
    },
    videoRef,
  });

  const performScan = React.useCallback(
    (source: "camera" | "bluetooth_scanner" | "manual") => {
      if (paused && source !== "manual") return;

      const lot = POOL[Math.floor(Math.random() * POOL.length)];
      if (!lot) return;
      const product = getProductById(lot.productId);
      if (!product) return;

      const at = new Date().toISOString();
      const isExpired = lot.status === "expired";

      setLines((prev) => {
        const ix = prev.findIndex((l) => l.lotId === lot.id);
        if (ix >= 0) {
          const next = [...prev];
          const line = next[ix]!;
          next[ix] = {
            ...line,
            scannedQuantity: line.scannedQuantity + 1,
            lastScanAt: at,
            scans: [...line.scans, { source, at }],
          };
          return next;
        }
        return [
          {
            productId: product.id,
            productSku: product.sku,
            productName: product.name,
            lotId: lot.id,
            lotNumber: lot.lotNumber,
            expiresAt: lot.expiresAt,
            lotStatus: lot.status,
            scannedQuantity: 1,
            lastScanAt: at,
            scans: [{ source, at }],
          },
          ...prev,
        ];
      });

      setFlash(true);
      setTimeout(() => setFlash(false), 180);
      setLastFeedback({
        at: Date.now(),
        type: isExpired ? "warn" : "ok",
        text: isExpired
          ? `${product.name} — lote vencido (registrado para revisión)`
          : `${product.name} +1`,
      });

      // Vibrate on mobile
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(isExpired ? [40, 60, 40] : 30);
      }
    },
    [paused],
  );

  // El hook useBarcodeScanner ya escucha keystrokes BT y maneja debounce.
  // Si quisieras emitir manualmente desde otro UI (input pegado), usa `emit(barcode)`.
  void emit;

  const decrement = (lotId: string) => {
    setLines((prev) =>
      prev
        .map((l) =>
          l.lotId === lotId
            ? { ...l, scannedQuantity: Math.max(0, l.scannedQuantity - 1) }
            : l,
        )
        .filter((l) => l.scannedQuantity > 0),
    );
  };

  const remove = (lotId: string) => {
    if (!removeReason.trim()) return;
    setLines((prev) => prev.filter((l) => l.lotId !== lotId));
    setShowRemove(null);
    setRemoveReason("");
  };

  return (
    <div className="mx-auto max-w-md pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[color:var(--brand-bg)]/95 px-1 pb-3 backdrop-blur">
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="font-mono text-xs opacity-60">{countNumber}</div>
              <div className="text-sm font-semibold truncate">
                {branchName} · {warehouseName}
              </div>
            </div>
            <Badge tone={paused ? "warning" : "success"}>
              {paused ? "Pausado" : "En vivo"}
            </Badge>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-2xl font-bold tabular-nums">
                {accumulated}
              </div>
              <div className="text-[10px] uppercase tracking-wider opacity-50">
                escaneos
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums">
                {lines.length}
              </div>
              <div className="text-[10px] uppercase tracking-wider opacity-50">
                items
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums text-rose-700">
                {lines.filter((l) => l.lotStatus === "expired").length}
              </div>
              <div className="text-[10px] uppercase tracking-wider opacity-50">
                vencidos
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scanner viewport */}
      <div className="relative mt-3 aspect-[4/3] overflow-hidden rounded-2xl border border-black/5 bg-black text-white shadow-sm">
        {scanSource === "camera" && (
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div
          className={`absolute inset-0 transition-opacity ${
            flash ? "bg-[color:var(--brand-primary)] opacity-90" : "opacity-0"
          }`}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-44 w-72 rounded-xl border-2 border-white/40">
            {!paused && cameraReady && (
              <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-[color:var(--brand-primary)]" />
            )}
            <div className="absolute -top-3 left-3 rounded bg-black/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
              {scanSource === "camera" ? "Cámara" : "Lector BT"}
            </div>
          </div>
        </div>

        {cameraError && scanSource === "camera" && (
          <div className="absolute inset-x-3 top-3 rounded-lg bg-rose-600/90 px-3 py-2 text-xs">
            <div className="flex items-center gap-1 font-medium">
              <AlertTriangle className="h-3 w-3" /> Cámara no disponible
            </div>
            <div className="mt-0.5 opacity-80">
              {cameraError}. Usa "Simular escaneo" o cambia a Lector BT.
            </div>
          </div>
        )}

        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] opacity-80">
          <span>
            {paused
              ? "Escáner pausado"
              : scanSource === "camera"
                ? cameraReady
                  ? "Escaneando…"
                  : cameraError
                    ? "Sin cámara"
                    : "Iniciando cámara…"
                : "Esperando lector BT…"}
          </span>
          <span className="font-mono">{formatTime(new Date())}</span>
        </div>

        {lastFeedback && Date.now() - lastFeedback.at < 1500 && (
          <div
            className={`absolute bottom-12 left-3 right-3 rounded-lg px-3 py-2 text-sm font-medium shadow-lg ${
              lastFeedback.type === "ok"
                ? "bg-emerald-500 text-white"
                : lastFeedback.type === "warn"
                  ? "bg-amber-500 text-black"
                  : "bg-rose-600 text-white"
            }`}
          >
            ✓ {lastFeedback.text}
          </div>
        )}
      </div>

      {/* Source selector & big scan button */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          onClick={() => setScanSource("camera")}
          className={`flex flex-col items-center gap-0.5 rounded-xl border p-2 text-xs ${
            scanSource === "camera"
              ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/10"
              : "border-black/10 bg-white"
          }`}
        >
          <Camera className="h-4 w-4" />
          <span>Cámara</span>
        </button>
        <button
          onClick={() => setScanSource("bluetooth_scanner")}
          className={`flex flex-col items-center gap-0.5 rounded-xl border p-2 text-xs ${
            scanSource === "bluetooth_scanner"
              ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/10"
              : "border-black/10 bg-white"
          }`}
        >
          <Bluetooth className="h-4 w-4" />
          <span>Lector BT</span>
        </button>
        <button
          onClick={() => setShowManual(true)}
          className="flex flex-col items-center gap-0.5 rounded-xl border border-black/10 bg-white p-2 text-xs"
        >
          <Hash className="h-4 w-4" />
          <span>Manual</span>
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          size="lg"
          variant={paused ? "primary" : "outline"}
          onClick={() => setPaused((v) => !v)}
        >
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          {paused ? "Reanudar" : "Pausar"}
        </Button>
        <Button
          size="lg"
          onClick={() => performScan(scanSource)}
          disabled={paused}
        >
          <ScanLine className="h-4 w-4" />
          Simular escaneo
        </Button>
      </div>

      {/* Accumulated table */}
      <div className="mt-4 rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Acumulado</div>
            <div className="text-xs opacity-60">
              Cada escaneo suma +1. El conteo NO se hace por cantidad escrita.
            </div>
          </div>
          <Button size="sm">
            <Send className="h-4 w-4" />
            Enviar
          </Button>
        </div>
        {lines.length === 0 && (
          <div className="px-4 py-10 text-center text-sm opacity-60">
            Aún no has escaneado nada. Apunta la cámara o pulsa Simular escaneo.
          </div>
        )}
        <ul className="divide-y divide-black/5">
          {lines.map((line) => {
            const dleft = daysUntil(line.expiresAt);
            const expired = dleft < 0;
            return (
              <li key={line.lotId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-tight">
                      {line.productName}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] opacity-70">
                      <span className="font-mono">{line.productSku}</span>
                      <span className="opacity-50">·</span>
                      <span className="font-mono">Lote {line.lotNumber}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
                      <Badge tone={expired ? "danger" : dleft < 90 ? "warning" : "neutral"}>
                        {expired
                          ? `Vencido ${formatDate(line.expiresAt)}`
                          : `Vence ${formatDate(line.expiresAt)} · ${dleft}d`}
                      </Badge>
                      <span className="opacity-60">
                        Último: {formatTime(line.lastScanAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="rounded-lg bg-[color:var(--brand-primary)] px-3 py-1.5 text-base font-bold text-white tabular-nums">
                      ×{line.scannedQuantity}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => decrement(line.lotId)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-black/10 hover:bg-black/[0.04]"
                        aria-label="Restar"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => performScan("manual")}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-black/10 hover:bg-black/[0.04]"
                        aria-label="Sumar"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setShowRemove(line.lotId)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {showRemove === line.lotId && (
                  <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                    <div className="text-xs font-medium text-rose-700">
                      Motivo obligatorio para eliminar línea
                    </div>
                    <input
                      autoFocus
                      value={removeReason}
                      onChange={(e) => setRemoveReason(e.target.value)}
                      placeholder="Ej. Escaneo duplicado por error"
                      className="mt-2 h-9 w-full rounded-md border border-rose-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setShowRemove(null);
                          setRemoveReason("");
                        }}
                        className="rounded-md px-3 py-1 text-xs"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => remove(line.lotId)}
                        disabled={!removeReason.trim()}
                        className="rounded-md bg-rose-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                      >
                        Eliminar línea
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Manual entry modal */}
      {showManual && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
          onClick={() => setShowManual(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-lg bg-amber-50 p-1.5 text-amber-700">
                <Hash className="h-4 w-4" />
              </span>
              <div>
                <div className="text-sm font-semibold">Entrada manual</div>
                <div className="text-xs opacity-60">
                  Solo para cajas cerradas, código dañado o productos imposibles
                  de escanear. Requiere permiso{" "}
                  <code className="rounded bg-black/5 px-1 font-mono text-[10px]">
                    inventory_count:manual_quantity
                  </code>
                  .
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">Producto</label>
                <select className="mt-1 h-10 w-full rounded-md border border-black/15 bg-white px-2 text-sm">
                  {mockProducts.map((p) => (
                    <option key={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Cantidad</label>
                  <input
                    type="number"
                    min={1}
                    defaultValue={1}
                    className="mt-1 h-10 w-full rounded-md border border-black/15 bg-white px-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Lote</label>
                  <input
                    placeholder="LRP24A"
                    className="mt-1 h-10 w-full rounded-md border border-black/15 bg-white px-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">Motivo</label>
                <input
                  placeholder="Ej. Caja sellada con 12 unidades"
                  className="mt-1 h-10 w-full rounded-md border border-black/15 bg-white px-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowManual(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  performScan("manual");
                  setShowManual(false);
                }}
              >
                Registrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
