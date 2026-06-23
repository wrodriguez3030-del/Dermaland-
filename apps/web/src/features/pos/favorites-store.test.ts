// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  toggleFavorite,
  isFavorite,
  listFavoriteIds,
} from "./favorites-store";

const A = "057ebf75-6202-4155-8551-d614b71aca20";
const B = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  window.localStorage.clear();
});

describe("favorites-store (POS)", () => {
  it("marca un producto como favorito y persiste", () => {
    expect(isFavorite(A)).toBe(false);
    const now = toggleFavorite(A);
    expect(now).toBe(true);
    expect(isFavorite(A)).toBe(true);
    // Persistencia: una nueva lectura (simula refresh) lo mantiene.
    expect(listFavoriteIds()).toContain(A);
  });

  it("quita un favorito", () => {
    toggleFavorite(A);
    expect(isFavorite(A)).toBe(true);
    const now = toggleFavorite(A);
    expect(now).toBe(false);
    expect(isFavorite(A)).toBe(false);
  });

  it("maneja varios favoritos independientes", () => {
    toggleFavorite(A);
    toggleFavorite(B);
    expect(listFavoriteIds().sort()).toEqual([A, B].sort());
    toggleFavorite(A);
    expect(listFavoriteIds()).toEqual([B]);
  });

  it("es solo preferencia: no guarda stock ni cantidades (solo ids)", () => {
    toggleFavorite(A);
    const raw = window.localStorage.getItem("dermaland.pos.favorites")!;
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toEqual([A]); // solo el product_id
  });
});
