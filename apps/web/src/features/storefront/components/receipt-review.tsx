"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui";
import type { OrderReceipt } from "@/server/services/storefront/transfer-payments";

/**
 * Revisar los comprobantes de un pedido, desde el ERP.
 *
 * El enlace al archivo es **firmado y temporal** (10 minutos): el bucket es
 * privado porque un comprobante lleva el nombre del titular, su banco y a veces
 * su número de cuenta. Un enlace eterno es un enlace que acaba reenviado.
 *
 * Aceptar marca el pedido como pagado, y rechazar pide motivo: sin él, el
 * registro no le sirve a nadie cuando el cliente llame preguntando.
 */
export function ReceiptReview({ receipts }: { receipts: OrderReceipt[] }) {
  const router = useRouter();
  const [trabajando, setTrabajando] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (receipts.length === 0) {
    return (
      <p className="text-sm text-[color:var(--brand-fg)]/60">
        El cliente todavía no ha subido el comprobante.
      </p>
    );
  }

  async function revisar(id: string, decision: "aceptado" | "rechazado") {
    let note: string | undefined;
    if (decision === "rechazado") {
      const escrito = window.prompt("¿Por qué se rechaza el comprobante?");
      if (!escrito?.trim()) return;
      note = escrito.trim();
    }

    setTrabajando(id);
    setError(null);
    try {
      const resp = await fetch(`/api/pedidos-web/comprobantes/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => null);
        setError(d?.error ?? "No se pudo guardar la revisión.");
        return;
      }
      router.refresh();
    } catch {
      setError("No se pudo guardar la revisión.");
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-black/5">
        {receipts.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
            <Badge
              tone={
                r.status === "aceptado"
                  ? "success"
                  : r.status === "rechazado"
                    ? "neutral"
                    : "info"
              }
            >
              {r.status === "aceptado"
                ? "Aceptado"
                : r.status === "rechazado"
                  ? "Rechazado"
                  : "Por revisar"}
            </Badge>

            <span className="text-sm text-[color:var(--brand-fg)]/60">
              {new Date(r.uploadedAt).toLocaleString("es-DO")}
            </span>

            {r.signedUrl ? (
              <a
                href={r.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[color:var(--brand-primary)] underline-offset-4 hover:underline"
              >
                Ver comprobante
                <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              </a>
            ) : null}

            {r.reviewNote ? (
              <span className="w-full text-xs text-[color:var(--brand-fg)]/60">
                Motivo: {r.reviewNote}
              </span>
            ) : null}

            {r.status === "pendiente" ? (
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  disabled={trabajando !== null}
                  onClick={() => revisar(r.id, "aceptado")}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-4 text-sm font-semibold text-white hover:bg-[color:var(--brand-accent)] disabled:opacity-50"
                >
                  {trabajando === r.id ? (
                    <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                  ) : null}
                  Aceptar y marcar pagado
                </button>
                <button
                  type="button"
                  disabled={trabajando !== null}
                  onClick={() => revisar(r.id, "rechazado")}
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Rechazar
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
