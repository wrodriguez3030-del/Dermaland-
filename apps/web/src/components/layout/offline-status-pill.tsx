"use client";

import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useOfflineStatus } from "@/features/inventory-counts/sync/sync";

/**
 * Píldora flotante con estado online/offline + length de la cola de scans.
 * Se monta en el modo móvil del conteo físico.
 */
export function OfflineStatusPill() {
  const { online, queue, syncNow } = useOfflineStatus();

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg ${
        online
          ? "bg-emerald-600 text-white"
          : "bg-amber-500 text-black"
      }`}
    >
      {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
      <span>{online ? "En línea" : "Offline"}</span>
      {queue > 0 && (
        <>
          <span className="opacity-50">·</span>
          <span>{queue} pend.</span>
          {online && (
            <button
              onClick={() => void syncNow()}
              className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 hover:bg-white/30"
              aria-label="Sincronizar ahora"
            >
              <RefreshCw className="h-2.5 w-2.5" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Service worker registration. Llamar desde un Client Component en el layout
 * del modo móvil para activar PWA.
 */
export function registerServiceWorker() {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    process.env.NODE_ENV === "development"
  ) {
    return;
  }
  navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .catch(() => {
      // ignorar — SW falla silenciosamente; la app sigue funcionando
    });
}
