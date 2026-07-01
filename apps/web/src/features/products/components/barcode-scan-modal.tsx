"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui";
import { useBarcodeScanner } from "@/features/inventory-counts/use-barcode-scanner";

/**
 * Modal para escanear un código de barra con la cámara del celular. Usa el hook
 * `useBarcodeScanner` (BarcodeDetector nativo + fallback @zxing). Si la cámara no
 * está disponible, muestra un mensaje amigable para escribir el código a mano.
 */
export function BarcodeScanModal({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const { cameraError, cameraReady } = useBarcodeScanner({
    enabled: open,
    source: "camera",
    onScan: (e) => {
      const code = e.barcode.trim();
      if (code) onDetected(code);
      onClose();
    },
    videoRef,
  });

  return (
    <Modal
      open={open}
      title="Escanear código de barra"
      onClose={onClose}
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="space-y-3">
        {cameraError ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            No se pudo abrir la cámara. Puedes escribir el código manualmente.
          </p>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl bg-black">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} className="h-56 w-full object-cover" playsInline muted />
            </div>
            <p className="text-xs opacity-60">
              {cameraReady
                ? "Apunta la cámara al código de barra del empaque."
                : "Iniciando cámara…"}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
