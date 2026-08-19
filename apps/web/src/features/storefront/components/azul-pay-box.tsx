"use client";

import * as React from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

/**
 * La caja con la que el cliente paga por el enlace de Azul DE SU PEDIDO.
 *
 * El Link de Pagos se genera con el monto fijado al crearlo, así que el
 * cliente no teclea nada: verifica que Azul diga exactamente el total de su
 * pedido y, si no coincide, NO paga y avisa. El número de pedido se puede
 * copiar por si Azul pide una referencia o concepto.
 */
export function AzulPayBox({
  url,
  amountLabel,
  orderNumber,
}: {
  /** Enlace de Azul de ESTE pedido, ya validado por el servidor. */
  url: string;
  /** El total formateado para leer: "RD$ 1,250.00". */
  amountLabel: string;
  /** Número visible del pedido (WEB-…), para la referencia del pago. */
  orderNumber: string;
}) {
  const [copiado, setCopiado] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function copiarNumero() {
    try {
      await navigator.clipboard.writeText(orderNumber);
      setCopiado(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles el cliente copia a mano; el número está a
      // la vista, así que no hay nada que avisar.
    }
  }

  return (
    <div className="mt-4">
      <div className="space-y-2">
        <div className="rounded-xl bg-[color:var(--brand-primary)]/5 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/60">
            Total de tu pedido
          </p>
          <p className="font-mono text-lg font-semibold text-[color:var(--brand-fg)]">
            {amountLabel}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-[color:var(--brand-primary)]/5 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/60">
              Tu número de pedido
            </p>
            <p className="font-mono text-lg font-semibold text-[color:var(--brand-fg)]">
              {orderNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={copiarNumero}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-[color:var(--brand-primary)]/30 px-3 text-xs font-semibold text-[color:var(--brand-primary)] transition-colors hover:bg-[color:var(--brand-primary)]/5"
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
      </div>

      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-[color:var(--brand-fg)]/80">
        <li>Abre el enlace seguro de Azul con el botón de abajo.</li>
        <li>
          Verifica que el monto diga exactamente{" "}
          <span className="font-semibold">{amountLabel}</span>. Si no coincide,
          no pagues y escríbenos.
        </li>
        <li>Sube aquí el comprobante que te da Azul al terminar.</li>
      </ol>

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-6 text-base font-semibold text-white hover:bg-[color:var(--brand-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] focus-visible:ring-offset-2"
      >
        Pagar con Azul
        <ExternalLink aria-hidden className="h-4 w-4" />
      </a>
    </div>
  );
}
