"use client";

import * as React from "react";
import { Check, ShoppingBag } from "lucide-react";
import { useCart } from "./cart-provider";

/**
 * "Agregar al carrito" de la ficha.
 *
 * Confirma en el propio botón durante unos segundos en vez de abrir un aviso:
 * el cliente ya está mirando ahí, y un cartel flotante en móvil taparía el
 * precio. El TEXTO cambia además del icono — un "hecho" en verde y nada más
 * sería invisible para quien no distingue ese verde.
 */
export function AddToCartButton({
  slug,
  disabled = false,
}: {
  slug: string;
  disabled?: boolean;
}) {
  const { add, mounted } = useCart();
  const [confirmado, setConfirmado] = React.useState(false);

  React.useEffect(() => {
    if (!confirmado) return;
    const t = window.setTimeout(() => setConfirmado(false), 2500);
    return () => window.clearTimeout(t);
  }, [confirmado]);

  return (
    <button
      type="button"
      // Deshabilitado hasta montar: con el `localStorage` todavía sin leer,
      // pulsar agregaría sobre un carrito vacío y borraría lo que ya había.
      disabled={disabled || !mounted}
      onClick={() => {
        add(slug);
        setConfirmado(true);
      }}
      className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-6 text-base font-semibold text-white transition-colors hover:bg-[color:var(--brand-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50 sm:w-auto"
    >
      {confirmado ? (
        <>
          <Check aria-hidden className="h-5 w-5" />
          Agregado al carrito
        </>
      ) : (
        <>
          <ShoppingBag aria-hidden className="h-5 w-5" />
          Agregar al carrito
        </>
      )}
    </button>
  );
}
