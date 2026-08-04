"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { MAX_RECEIPT_BYTES } from "../payments/receipt";

/**
 * Subir el comprobante de la transferencia, desde la página del pedido.
 *
 * El archivo va al SERVIDOR y no al bucket directamente: subir desde el
 * navegador exigiría darle al cliente una credencial de escritura, y ahí dentro
 * hay comprobantes de otras personas.
 *
 * Se comprueba el tamaño antes de enviar para no hacerle esperar una subida que
 * el servidor va a rechazar igualmente.
 */
export function ReceiptUpload({
  token,
  yaSubido,
}: {
  token: string;
  /** Si ya mandó uno, se le dice; puede mandar otro si se equivocó. */
  yaSubido: boolean;
}) {
  const router = useRouter();
  const [subiendo, setSubiendo] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [listo, setListo] = React.useState(false);

  async function enviar(formData: FormData) {
    const archivo = formData.get("comprobante");
    if (!(archivo instanceof File) || archivo.size === 0) {
      setError("Elige el archivo del comprobante.");
      return;
    }
    if (archivo.size > MAX_RECEIPT_BYTES) {
      setError("El archivo pesa demasiado. El máximo son 5 MB.");
      return;
    }

    setSubiendo(true);
    setError(null);
    try {
      const resp = await fetch(`/api/storefront/orders/${token}/comprobante`, {
        method: "POST",
        body: formData,
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => null);
        setError(d?.error ?? "No pudimos guardar el comprobante.");
        return;
      }
      setListo(true);
      router.refresh();
    } catch {
      setError("No pudimos guardar el comprobante. Inténtalo de nuevo.");
    } finally {
      setSubiendo(false);
    }
  }

  if (listo) {
    return (
      <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 px-5 py-4">
        <CheckCircle2
          aria-hidden
          className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700"
        />
        <p className="text-sm text-emerald-900">
          Recibimos tu comprobante. Lo revisamos y te confirmamos el pago.
        </p>
      </div>
    );
  }

  return (
    <form action={enviar} className="space-y-3">
      {yaSubido ? (
        <p className="text-sm text-[color:var(--brand-fg)]/70">
          Ya recibimos un comprobante de este pedido. Si te equivocaste de
          archivo, puedes mandar otro.
        </p>
      ) : null}

      <div>
        <label
          htmlFor="comprobante"
          className="text-sm font-medium text-[color:var(--brand-fg)]"
        >
          Comprobante de la transferencia
        </label>
        <input
          id="comprobante"
          name="comprobante"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          className="mt-1 block w-full cursor-pointer rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[color:var(--brand-primary)]/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[color:var(--brand-primary)]"
        />
        <p className="mt-1 text-xs text-[color:var(--brand-fg)]/50">
          Una foto o el PDF del banco. Máximo 5 MB.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={subiendo}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-5 text-sm font-semibold text-white hover:bg-[color:var(--brand-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50"
      >
        {subiendo ? (
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        ) : (
          <Upload aria-hidden className="h-4 w-4" />
        )}
        Enviar comprobante
      </button>
    </form>
  );
}
