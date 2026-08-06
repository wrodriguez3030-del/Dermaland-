"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";

/**
 * "Procesar ahora": una pasada de la cola sin esperar al cron.
 *
 * El cron corre cada quince minutos. Este botón existe para cuando alguien está
 * mirando la pantalla y no quiere esperarlos — típicamente después de arreglar
 * lo que hacía fallar a un comprobante.
 *
 * **No envía nada a la DGII** mientras el envío esté deshabilitado: el
 * trabajador adelanta lo local y se para en la frontera. El resultado lo dice en
 * vez de callárselo, para que nadie crea que pulsó y no pasó nada.
 */

interface Resultado {
  advanced: number;
  waitingForSend: number;
  failed: number;
  skipped: number;
  picked: number;
}

export function QueueRunButton() {
  const router = useRouter();
  const [corriendo, setCorriendo] = React.useState(false);
  const [resultado, setResultado] = React.useState<Resultado | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function correr() {
    setCorriendo(true);
    setError(null);
    setResultado(null);
    try {
      const resp = await fetch("/api/dgii/cola", { method: "POST" });
      if (!resp.ok) {
        const d = await resp.json().catch(() => null);
        setError(d?.error ?? "No se pudo procesar la cola.");
        return;
      }
      const datos = await resp.json();
      setResultado(datos.total as Resultado);
      router.refresh();
    } catch {
      setError("No se pudo procesar la cola.");
    } finally {
      setCorriendo(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={correr}
        disabled={corriendo}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-5 text-sm font-semibold text-white hover:bg-[color:var(--brand-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50"
      >
        {corriendo ? (
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        ) : (
          <Play aria-hidden className="h-4 w-4" />
        )}
        Procesar la cola ahora
      </button>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {/* Decir qué pasó, siempre. Un botón que no contesta nada deja a quien lo
          pulsa sin saber si funcionó. */}
      {resultado ? (
        <p className="mt-2 text-sm text-[color:var(--brand-fg)]/70">
          {resultado.picked === 0
            ? "No había nada pendiente."
            : [
                resultado.advanced > 0 && `${resultado.advanced} avanzaron`,
                resultado.waitingForSend > 0 &&
                  `${resultado.waitingForSend} esperan a que se habilite el envío`,
                resultado.failed > 0 && `${resultado.failed} fallaron`,
                resultado.skipped > 0 && `${resultado.skipped} los movió otro proceso`,
              ]
                .filter(Boolean)
                .join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
