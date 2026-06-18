"use client";

import * as React from "react";
import type { Brand, Category, Laboratory } from "@/types";
import { mockBrands, mockCategories, mockLaboratories } from "@/lib/mock-data/catalog";

const CHANGE_EVENT = "dermaland:catalog-changed";

export const CATALOG_BACKEND: "local" | "supabase" =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase"
    ? "supabase"
    : "local";

function notifyCatalogChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

// Overlays locales (modo demo) por entidad.
type Overlay<T> = { extra: T[]; deleted: Set<string>; patches: Record<string, Partial<T>> };
function newOverlay<T>(): Overlay<T> { return { extra: [], deleted: new Set(), patches: {} }; }
const brandOverlay = newOverlay<Brand>();
const categoryOverlay = newOverlay<Category>();
const labOverlay = newOverlay<Laboratory>();

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
function viewLocal<T extends { id: string }>(seed: T[], o: Overlay<T>): T[] {
  const base = seed.map((x) => (o.patches[x.id] ? { ...x, ...o.patches[x.id] } : x));
  return [...base, ...o.extra].filter((x) => !o.deleted.has(x.id));
}

export type CatalogResult<T> = { ok: true; item: T } | { ok: false; error: string };
export type CatalogDeleteResult = { ok: true } | { ok: false; error: string };

// ─── Fetch servidor ──────────────────────────────────────────────────────────
async function fetchList<T>(path: string, key: string): Promise<T[]> {
  const res = await fetch(`/api/${path}`, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as Record<string, T[]>)[key] ?? [];
}

// ─── Hook genérico de lista con fallback ─────────────────────────────────────
function useCatalogList<T extends { id: string }>(
  seed: T[], overlay: Overlay<T>, path: string, key: string,
): T[] {
  const [list, setList] = React.useState<T[]>(() =>
    CATALOG_BACKEND === "supabase" ? [] : viewLocal(seed, overlay),
  );
  React.useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (CATALOG_BACKEND === "supabase") {
        fetchList<T>(path, key)
          .then((d) => { if (alive) setList(d); })
          .catch(() => { if (alive) setList(viewLocal(seed, overlay)); });
      } else {
        setList(viewLocal(seed, overlay));
      }
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      alive = false;
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
    // seed y overlay son constantes de módulo (estables); no van en deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);
  return list;
}

export function useBrandsList(): Brand[] {
  return useCatalogList(mockBrands, brandOverlay, "brands", "brands");
}
export function useCategoriesList(): Category[] {
  return useCatalogList(mockCategories, categoryOverlay, "categories", "categories");
}
export function useLaboratoriesList(): Laboratory[] {
  return useCatalogList(mockLaboratories, labOverlay, "laboratories", "laboratories");
}

// ─── Wrappers de escritura ───────────────────────────────────────────────────
async function serverWrite<T>(method: string, url: string, body: unknown, key: string): Promise<CatalogResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !json[key]) return { ok: false, error: (json.error as string) ?? `HTTP ${res.status}` };
    notifyCatalogChanged();
    return { ok: true, item: json[key] as T };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
async function serverDelete(url: string): Promise<CatalogDeleteResult> {
  try {
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    }
    notifyCatalogChanged();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Brands
export async function saveBrand(mode: "create" | "edit", input: { name: string }, id?: string): Promise<CatalogResult<Brand>> {
  if (!input.name?.trim()) return { ok: false, error: "El nombre es obligatorio." };
  if (CATALOG_BACKEND === "supabase") {
    return mode === "create"
      ? serverWrite<Brand>("POST", "/api/brands", { name: input.name.trim() }, "brand")
      : serverWrite<Brand>("PATCH", `/api/brands/${id}`, { name: input.name.trim() }, "brand");
  }
  const now = new Date().toISOString();
  if (mode === "create") {
    const item: Brand = { id: genId("br"), businessId: mockBrands[0]?.businessId ?? "biz_dermaland", name: input.name.trim(), productCount: 0, createdAt: now, updatedAt: now };
    brandOverlay.extra.push(item); notifyCatalogChanged(); return { ok: true, item };
  }
  brandOverlay.patches[id!] = { ...(brandOverlay.patches[id!] ?? {}), name: input.name.trim(), updatedAt: now };
  const item = viewLocal(mockBrands, brandOverlay).find((b) => b.id === id);
  notifyCatalogChanged();
  return item ? { ok: true, item } : { ok: false, error: "Marca no encontrada." };
}
export async function deleteBrandAnywhere(id: string): Promise<CatalogDeleteResult> {
  if (CATALOG_BACKEND === "supabase") return serverDelete(`/api/brands/${id}`);
  brandOverlay.deleted.add(id); notifyCatalogChanged(); return { ok: true };
}

// Categories
export async function saveCategory(mode: "create" | "edit", input: { name: string; parentId?: string | null; description?: string }, id?: string): Promise<CatalogResult<Category>> {
  if (!input.name?.trim()) return { ok: false, error: "El nombre es obligatorio." };
  const payload = { name: input.name.trim(), parentId: input.parentId ?? null, description: input.description?.trim() || undefined };
  if (CATALOG_BACKEND === "supabase") {
    return mode === "create"
      ? serverWrite<Category>("POST", "/api/categories", payload, "category")
      : serverWrite<Category>("PATCH", `/api/categories/${id}`, payload, "category");
  }
  const now = new Date().toISOString();
  if (mode === "create") {
    const item: Category = { id: genId("cat"), businessId: mockCategories[0]?.businessId ?? "biz_dermaland", name: payload.name, parentId: payload.parentId, description: payload.description, createdAt: now, updatedAt: now };
    categoryOverlay.extra.push(item); notifyCatalogChanged(); return { ok: true, item };
  }
  categoryOverlay.patches[id!] = { ...(categoryOverlay.patches[id!] ?? {}), ...payload, updatedAt: now };
  const item = viewLocal(mockCategories, categoryOverlay).find((c) => c.id === id);
  notifyCatalogChanged();
  return item ? { ok: true, item } : { ok: false, error: "Categoría no encontrada." };
}
export async function deleteCategoryAnywhere(id: string): Promise<CatalogDeleteResult> {
  if (CATALOG_BACKEND === "supabase") return serverDelete(`/api/categories/${id}`);
  categoryOverlay.deleted.add(id); notifyCatalogChanged(); return { ok: true };
}

// Laboratories
export async function saveLaboratory(mode: "create" | "edit", input: { name: string; country?: string }, id?: string): Promise<CatalogResult<Laboratory>> {
  if (!input.name?.trim()) return { ok: false, error: "El nombre es obligatorio." };
  const payload = { name: input.name.trim(), country: input.country?.trim() || undefined };
  if (CATALOG_BACKEND === "supabase") {
    return mode === "create"
      ? serverWrite<Laboratory>("POST", "/api/laboratories", payload, "laboratory")
      : serverWrite<Laboratory>("PATCH", `/api/laboratories/${id}`, payload, "laboratory");
  }
  const now = new Date().toISOString();
  if (mode === "create") {
    const item: Laboratory = { id: genId("lab"), businessId: mockLaboratories[0]?.businessId ?? "biz_dermaland", name: payload.name, country: payload.country, createdAt: now, updatedAt: now };
    labOverlay.extra.push(item); notifyCatalogChanged(); return { ok: true, item };
  }
  labOverlay.patches[id!] = { ...(labOverlay.patches[id!] ?? {}), ...payload, updatedAt: now };
  const item = viewLocal(mockLaboratories, labOverlay).find((l) => l.id === id);
  notifyCatalogChanged();
  return item ? { ok: true, item } : { ok: false, error: "Laboratorio no encontrado." };
}
export async function deleteLaboratoryAnywhere(id: string): Promise<CatalogDeleteResult> {
  if (CATALOG_BACKEND === "supabase") return serverDelete(`/api/laboratories/${id}`);
  labOverlay.deleted.add(id); notifyCatalogChanged(); return { ok: true };
}
