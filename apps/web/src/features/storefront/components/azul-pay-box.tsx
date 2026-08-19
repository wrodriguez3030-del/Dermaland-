"use client";

import * as React from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

/**
 * La caja con la que el cliente paga por el enlace de Azul.
 *
 * La página de Azul no admite fijar el monto: lo teclea el cliente. Por eso el
 * monto se enseña en grande y se puede copiar TAL CUAL Azul lo espera (cifras,
 * sin "RD$" ni comas de miles), y el número de pedido va como referencia para
 * que el negocio pueda casar el pago con el pedido al revisarlo.
 */
export function AzulPayBox({
  url,
  amountLabel,
  amountRaw,
  orderNumber,
}: {
  /** Enlace del comercio en pagos.azul.com.do, ya validado por el servidor. */
  url: string;
  /** El total formateado para leer: "RD$ 1,250.00". */
  amountLabel: string;
  /** El total como Azul lo espera teclear: "1250.00". */
  amountRaw: string;
  /** Número visible del pedido (WEB-…), para la referencia del pago. */
  orderNumber: string;
}) {
  const [copiado, setCopiado] = React.useState<"monto" | "numero" | null>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function copiar(que: "monto" | "numero", texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(que);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopiado(null), 2000);
    } catch {
      // Sin permiso de portapapeles el cliente copia a mano; el monto y el
      // número están a la vista, así que no hay nada que avisar.
    }
  }

  const filaCopiable = (
    etiqueta: string,
    visible: string,
    que: "monto" | "numero",
    aCopiar: string,
  ) => (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-[color:var(--brand-primary)]/5 px-4 py-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/60">
          {etiqueta}
        </p>
        <p className="font-mono text-lg font-semibold text-[color:var(--brand-fg)]">
          {visible}
        </p>
      </div>
      <button
        type="button"
        onClick={() => copiar(que, aCopiar)}
        className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-[color:var(--brand-primary)]/30 px-3 text-xs font-semibold text-[color:var(--brand-primary)] transition-colors hover:bg-[color:var(--brand-primary)]/5"
      >
        {copiado === que ? (
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
  );

  return (
    <div className="mt-4">
      <div className="space-y-2">
        {filaCopiable("Monto exacto a pagar", amountLabel, "monto", amountRaw)}
        {filaCopiable(
          "Tu número de pedido",
          orderNumber,
          "numero",
          orderNumber,
        )}
      </div>

      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-[color:var(--brand-fg)]/80">
        <li>Abre el enlace seguro de Azul con el botón de abajo.</li>
        <li>
          Teclea el monto exacto:{" "}
          <span className="font-semibold">{amountLabel}</span>.
        </li>
        <li>Pon tu número de pedido como referencia o concepto.</li>
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
