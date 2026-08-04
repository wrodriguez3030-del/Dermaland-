"use client";

import * as React from "react";
import {
  addItem,
  cartItemCount,
  removeItem,
  setItemQty,
  type CartItem,
} from "../cart";
import {
  CART_CHANGED_EVENT,
  CART_STORAGE_KEY,
  readCart,
  writeCart,
} from "../cart-storage";

/**
 * El carrito, compartido por el encabezado, la ficha y la pantalla del carrito.
 *
 * `mounted` no es un detalle: el servidor no puede saber qué hay en el
 * `localStorage` de nadie, así que el primer render de cliente TIENE que
 * coincidir con el del servidor (regla 6 de `CLAUDE.md`). Los consumidores no
 * pintan nada que dependa del carrito hasta que `mounted` sea `true`.
 */

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  mounted: boolean;
  add: (slug: string, qty?: number) => void;
  setQty: (slug: string, qty: number) => void;
  remove: (slug: string) => void;
  clear: () => void;
}

const CartContext = React.createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<CartItem[]>([]);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setItems(readCart());
    setMounted(true);

    // Dos pestañas abiertas son lo normal cuando alguien compara productos: sin
    // esto, agregar en una y mirar el carrito en la otra enseñaría datos viejos.
    const sincronizar = () => setItems(readCart());
    window.addEventListener(CART_CHANGED_EVENT, sincronizar);
    const desdeOtraPestaña = (e: StorageEvent) => {
      if (e.key === CART_STORAGE_KEY) sincronizar();
    };
    window.addEventListener("storage", desdeOtraPestaña);
    return () => {
      window.removeEventListener(CART_CHANGED_EVENT, sincronizar);
      window.removeEventListener("storage", desdeOtraPestaña);
    };
  }, []);

  const aplicar = React.useCallback((siguiente: CartItem[]) => {
    setItems(siguiente);
    writeCart(siguiente);
  }, []);

  const valor = React.useMemo<CartContextValue>(
    () => ({
      items,
      itemCount: cartItemCount(items),
      mounted,
      add: (slug, qty = 1) => aplicar(addItem(items, slug, qty)),
      setQty: (slug, qty) => aplicar(setItemQty(items, slug, qty)),
      remove: (slug) => aplicar(removeItem(items, slug)),
      clear: () => aplicar([]),
    }),
    [items, mounted, aplicar],
  );

  return <CartContext.Provider value={valor}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = React.useContext(CartContext);
  if (!ctx) throw new Error("useCart necesita estar dentro de <CartProvider>");
  return ctx;
}
