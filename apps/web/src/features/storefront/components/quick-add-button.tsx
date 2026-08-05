"use client";

import * as React from "react";
import { Check, Plus } from "lucide-react";
import { useCart } from "./cart-provider";

/**
 * "Agregar" desde la propia tarjeta del catálogo.
 *
 * Existe por una queja concreta: para meter algo al carrito había que entrar a
 * la ficha, y una vez dentro el cliente se quedaba ahí. Comprar tres cosas eran
 * seis navegaciones. Ahora se agrega sin salir del listado y se sigue mirando —
 * que es como funciona cualquier tienda grande.
 *
 * Es hermano de `AddToCartButton` (el de la ficha) y no el mismo componente:
 * ahí ocupa el ancho y pesa; aquí tiene que caber en una tarjeta de 176 px sin
 * comerse el precio. Compartir uno con cinco props para que se disfrace de dos
 * cosas distintas sería peor que tener dos.
 *
 * Confirma EN EL PROPIO BOTÓN unos segundos, con texto además de icono: un
 * "hecho" en verde y nada más sería invisible para quien no distingue ese verde.
 */
export function QuickAddButton({
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
    const t = window.setTimeout(() => setConfirmado(false), 2000);
    return () => window.clearTimeout(t);
  }, [confirmado]);

  return (
    <button
      type="button"
      // Deshabilitado hasta montar: con el `localStorage` todavía sin leer,
      // pulsar agregaría sobre un carrito vacío y borraría lo que ya había.
      disabled={disabled || !mounted}
      aria-live="polite"
      onClick={() => {
        add(slug);
        setConfirmado(true);
      }}
      className={`inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50 ${
        confirmado
          ? "bg-emerald-700 text-white"
          : "bg-[color:var(--brand-primary)] text-white hover:bg-[color:var(--brand-accent)]"
      }`}
    >
      {confirmado ? (
        <>
          <Check aria-hidden className="h-4 w-4" />
          Agregado
        </>
      ) : (
        <>
          <Plus aria-hidden className="h-4 w-4" />
          Agregar
        </>
      )}
    </button>
  );
}
