"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button, HelpText, Input, Label } from "@/components/ui";
import { normalizeAzulPaymentLink } from "../../azul-link";

/**
 * Pegar el enlace de Azul DE ESTE PEDIDO, en el detalle del ERP.
 *
 * El Link de Pagos se genera en la App AZUL con el monto fijado al crearlo,
 * así que aquí se enseña el monto exacto copiable —para generarlo sin
 * equivocarse— y se pega el enlace resultante. El servidor vuelve a validar
 * dominio y regla: esta pantalla solo ahorra el error temprano.
 */
export function OrderAzulLinkForm({
  orderId,
  amountRaw,
  amountLabel,
  currentUrl,
}: {
  orderId: string;
  /** El total como se teclea en la App AZUL: "1250.00". */
  amountRaw: string;
  /** El total para leer: "RD$ 1,250.00". */
  amountLabel: string;
  /** Enlace vigente del pedido, si ya se pegó uno. */
  currentUrl?: string;
}) {
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [guardando, setGuardando] = React.useState(false);
  const [quitando, setQuitando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copiado, setCopiado] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function copiarMonto() {
    try {
      await navigator.clipboard.writeText(amountRaw);
      setCopiado(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles se copia a mano; el monto está a la vista.
    }
  }

  async function mandar(urlAGuardar: string, quitar: boolean) {
    if (quitar) setQuitando(true);
    else setGuardando(true);
    setError(null);
    try {
      const resp = await fetch(`/api/pedidos-web/${orderId}/azul-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlAGuardar }),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => null);
        setError(d?.error ?? "No se pudo guardar el enlace.");
        return;
      }
      setUrl("");
      router.refresh();
    } catch {
      setError("No se pudo guardar el enlace.");
    } finally {
      setGuardando(false);
      setQuitando(false);
    }
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    // El mismo validador del servidor, para avisar ANTES del viaje.
    const normalizado = normalizeAzulPaymentLink(url);
    if (!normalizado.ok) {
      setError(normalizado.error);
      return;
    }
    if (!normalizado.url) {
      setError("Pega el enlace generado en la App AZUL.");
      return;
    }
    void mandar(url, false);
  }

  return (
    <div className="rounded-xl border border-black/10 bg-black/[0.02] p-4">
      <p className="text-sm font-semibold text-[color:var(--brand-fg)]">
        Enlace de pago de este pedido
      </p>
      <p className="mt-1 text-sm text-[color:var(--brand-fg)]/60">
        Genera el link en la App AZUL con el monto exacto y pégalo aquí. El
        cliente lo verá en su página del pedido
        {currentUrl ? "." : " (y le avisamos por correo si dejó uno)."}
      </p>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
            Monto exacto
          </p>
          <p className="font-mono text-base font-semibold text-[color:var(--brand-fg)]">
            {amountLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={copiarMonto}
          className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-black/10 px-3 text-xs font-semibold text-[color:var(--brand-fg)]/70 transition-colors hover:bg-black/5"
        >
          {copiado ? (
            <>
              <Check aria-hidden className="h-3.5 w-3.5" />
              Copiado
            </>
          ) : (
            <>
              <Copy aria-hidden className="h-3.5 w-3.5" />
              Copiar
            </>
          )}
        </button>
      </div>

      {currentUrl ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2">
          <p className="min-w-0 break-all font-mono text-xs text-emerald-900">
            {currentUrl}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={quitando}
            onClick={() => {
              // Quitarlo deja al cliente sin botón de pago: se confirma.
              if (
                window.confirm(
                  "¿Quitar el enlace de pago de este pedido? El cliente dejará de ver el botón de pagar.",
                )
              ) {
                void mandar("", true);
              }
            }}
          >
            {quitando ? (
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            ) : (
              "Quitar"
            )}
          </Button>
        </div>
      ) : null}

      <form onSubmit={guardar} className="mt-3">
        <Label htmlFor="azulOrderLink">
          {currentUrl ? "Reemplazar el enlace" : "Pegar el enlace"}
        </Label>
        <div className="mt-1 flex gap-2">
          <Input
            id="azulOrderLink"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://pagos.azul.com.do/..."
          />
          <Button type="submit" disabled={guardando}>
            {guardando ? (
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            ) : (
              "Guardar"
            )}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        ) : (
          <HelpText>
            Solo se aceptan enlaces de pagos.azul.com.do. Los links de Azul
            caducan: si venció, genera otro y reemplázalo.
          </HelpText>
        )}
      </form>
    </div>
  );
}
