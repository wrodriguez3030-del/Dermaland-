"use client";

import * as React from "react";

/**
 * Favoritos de POS — persistencia por EQUIPO (localStorage).
 *
 * Modelo elegido (documentado): favoritos por equipo/usuario del navegador. Es
 * lo que se puede persistir sin tocar el esquema. Para favoritos por NEGOCIO
 * (compartidos en todas las PCs) está lista la migración
 * `supabase/migrations/0013_pos_favorites_line_discount.sql`
 * (tabla `pos_product_favorites`, RLS por business_id); al aplicarla se puede
 * conmutar el backend a Supabase sin cambiar la UI.
 *
 * No afecta inventario ni stock: es solo una preferencia de presentación.
 */
const KEY = "dermaland.pos.favorites";
const EVENT = "dermaland:pos-favorites-changed";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

function write(ids: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function listFavoriteIds(): string[] {
  return read();
}

export function isFavorite(productId: string): boolean {
  return read().includes(productId);
}

/** Marca/desmarca un producto como favorito. Devuelve el nuevo estado. */
export function toggleFavorite(productId: string): boolean {
  const cur = read();
  const has = cur.includes(productId);
  const next = has ? cur.filter((id) => id !== productId) : [...cur, productId];
  write(next);
  return !has;
}

export interface FavoritesApi {
  favorites: Set<string>;
  isFavorite: (productId: string) => boolean;
  toggle: (productId: string) => void;
  count: number;
}

/** Hook reactivo de favoritos (se re-renderiza al marcar/desmarcar). */
export function useFavorites(): FavoritesApi {
  const [ids, setIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    const refresh = () => setIds(read());
    refresh();
    if (typeof window === "undefined") return;
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const favorites = React.useMemo(() => new Set(ids), [ids]);
  return {
    favorites,
    isFavorite: (id) => favorites.has(id),
    toggle: (id) => {
      toggleFavorite(id);
    },
    count: favorites.size,
  };
}
