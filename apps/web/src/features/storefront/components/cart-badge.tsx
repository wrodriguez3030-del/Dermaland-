"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCart } from "./cart-provider";

/**
 * Contador del encabezado.
 *
 * Hasta que `mounted` sea `true` no se pinta el número: el servidor no sabe qué
 * hay en el `localStorage` del visitante, y pintar un 0 que enseguida salta a 3
 * es exactamente el parpadeo que la regla de hidratación evita.
 *
 * El número va también en el nombre accesible, no solo en el globo: quien usa
 * lector de pantalla tiene que enterarse de que lleva tres cosas en el carrito.
 */
export function CartBadge() {
  const { itemCount, mounted } = useCart();

  return (
    <Link
      href="/tienda/carrito"
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[color:var(--brand-fg)] transition-colors hover:bg-[color:var(--brand-primary)]/5 hover:text-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]"
    >
      <ShoppingBag aria-hidden className="h-5 w-5" />
      <span className="sr-only">
        {mounted && itemCount > 0
          ? `Carrito, ${itemCount} ${itemCount === 1 ? "artículo" : "artículos"}`
          : "Carrito"}
      </span>
      {mounted && itemCount > 0 ? (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--brand-primary)] px-1 text-xs font-bold text-white"
        >
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      ) : null}
    </Link>
  );
}
