// Único sitio que toca `localStorage`.
//
// Aislado para que el resto del carrito se pueda probar sin navegador, y para
// que los `try/catch` estén en un solo lugar: `localStorage` lanza en modo
// privado de Safari y cuando el usuario bloquea el almacenamiento. Un carrito
// que no se puede guardar es una molestia; una tienda que explota al cargar, no.

import { parseCartItems, type CartItem } from "./cart";

/** Con versión en la clave: cambiar el formato mañana no rompe carritos viejos. */
export const CART_STORAGE_KEY = "dermaland.tienda.carrito.v1";

/** Avisa a los demás componentes del mismo documento. */
export const CART_CHANGED_EVENT = "dermaland:carrito";

export function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    return parseCartItems(window.localStorage.getItem(CART_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function writeCart(items: readonly CartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Sin almacenamiento el carrito vive solo en memoria hasta recargar. Es peor
    // que guardarlo, pero mucho mejor que romper la página.
  }
  window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT));
}
