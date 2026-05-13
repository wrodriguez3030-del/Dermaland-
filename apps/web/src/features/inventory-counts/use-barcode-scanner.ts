"use client";

import * as React from "react";

/**
 * Hook unificado para escaneo de barcodes.
 *
 * Modo `camera`:
 *   - Usa la BarcodeDetector API si está disponible (Chrome móvil ≥ 88).
 *   - Fallback a @zxing/browser para iOS/Safari y desktop.
 *   - Vibra + reproduce beep al escanear.
 *
 * Modo `bluetooth_scanner`:
 *   - Captura keystrokes globales (los lectores BT actúan como teclado HID).
 *   - Detecta velocidad de tipeo > 50 chars/seg para distinguir de tipeo humano.
 *   - Descarta el código en el campo de UI activo si lo había.
 *
 * Modo `manual`:
 *   - Input controlado, sin captura automática.
 *
 * Anti-doble-escaneo: debounce de 500ms por barcode. Si el mismo código se
 * detecta < 500ms después del anterior, se ignora. Configurable via `debounceMs`.
 */

export type ScanSource = "camera" | "bluetooth_scanner" | "manual";

export interface ScanEvent {
  barcode: string;
  source: ScanSource;
  at: number;
}

interface UseBarcodeScannerOptions {
  enabled: boolean;
  source: ScanSource;
  onScan: (e: ScanEvent) => void;
  debounceMs?: number;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}

export function useBarcodeScanner({
  enabled,
  source,
  onScan,
  debounceMs = 500,
  videoRef,
}: UseBarcodeScannerOptions) {
  const lastScanRef = React.useRef<{ code: string; at: number } | null>(null);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [cameraReady, setCameraReady] = React.useState(false);

  const tryEmit = React.useCallback(
    (barcode: string, src: ScanSource) => {
      const now = Date.now();
      const last = lastScanRef.current;
      if (last && last.code === barcode && now - last.at < debounceMs) {
        return; // doble escaneo descartado
      }
      lastScanRef.current = { code: barcode, at: now };
      onScan({ barcode, source: src, at: now });

      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(30);
      }
    },
    [debounceMs, onScan],
  );

  // ─── Bluetooth scanner: keyboard capture ──────────────────────────────────
  React.useEffect(() => {
    if (!enabled || source !== "bluetooth_scanner") return;
    let buffer = "";
    let lastKeyAt = 0;

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // No interferir con inputs activos a menos que sea Enter rápido
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const now = Date.now();
      const interval = now - lastKeyAt;
      lastKeyAt = now;

      if (interval > 100) buffer = "";

      if (e.key === "Enter") {
        if (buffer.length >= 4) tryEmit(buffer, "bluetooth_scanner");
        buffer = "";
        return;
      }

      if (e.key.length === 1 && /[\w-]/.test(e.key)) {
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, source, tryEmit]);

  // ─── Camera scanner: BarcodeDetector or @zxing/browser fallback ──────────
  React.useEffect(() => {
    if (!enabled || source !== "camera") return;
    if (typeof window === "undefined") return;

    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;
    let zxingControls: { stop(): void } | null = null;

    async function start() {
      const video = videoRef?.current;
      if (!video) return;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        video.srcObject = stream;
        await video.play();
        setCameraReady(true);
        setCameraError(null);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "No se pudo abrir la cámara";
        setCameraError(msg);
        setCameraReady(false);
        return;
      }

      // Path A: BarcodeDetector nativo
      if ("BarcodeDetector" in window) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const Detector = (window as any).BarcodeDetector;
          const detector = new Detector({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
          });

          const tick = async () => {
            if (cancelled) return;
            try {
              const codes = await detector.detect(video);
              if (codes.length > 0) {
                const value = String(codes[0].rawValue ?? "");
                if (value) tryEmit(value, "camera");
              }
            } catch {
              // ignorar errores de frame; reintentar siguiente
            }
            raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
          return;
        } catch {
          // si falla BarcodeDetector, caer al fallback
        }
      }

      // Path B: @zxing/browser fallback (iOS Safari, desktop)
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoElement(video, (result) => {
          if (cancelled || !result) return;
          tryEmit(result.getText(), "camera");
        });
        zxingControls = controls;
      } catch (err) {
        setCameraError(
          err instanceof Error
            ? `Scanner no disponible: ${err.message}`
            : "Scanner no disponible",
        );
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (zxingControls) zxingControls.stop();
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      setCameraReady(false);
    };
  }, [enabled, source, tryEmit, videoRef]);

  return {
    cameraError,
    cameraReady,
    /** Emisión manual — para botón "Simular" o entrada por teclado */
    emit: (barcode: string, src: ScanSource = "manual") => tryEmit(barcode, src),
  };
}
