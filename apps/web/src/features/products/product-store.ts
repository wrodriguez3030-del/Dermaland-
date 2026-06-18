"use client";

import * as React from "react";
import type { Product } from "@/types";
import { mockProducts } from "@/lib/mock-data/catalog";

/**
 * Store de productos — MVP.
 *
 * Combina el seed `mockProducts` con productos creados/editados desde la UI,
 * persistidos en `localStorage`:
 *
 *  - `dermaland.products`           → productos creados nuevos (array)
 *  - `dermaland.products.overrides` → patches a productos seed (record por id)
 *  - `dermaland.products.deleted`   → ids soft-deleted (array de strings)
 *
 * Producción: se reemplaza por repositorio Supabase con tabla `products`
 * y bucket de storage `product-images`. El contrato `createProduct` /
 * `updateProduct` / `deleteProduct` mapea 1-a-1 a INSERT/UPDATE/UPDATE soft.
 */

const KEY_NEW = "dermaland.products";
const KEY_OVERRIDES = "dermaland.products.overrides";
const KEY_DELETED = "dermaland.products.deleted";
const CHANGE_EVENT = "dermaland:products-changed";

// ─── Persistencia ───────────────────────────────────────────────────────────

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function readNew(): Product[] {
  const v = safeRead<Product[]>(KEY_NEW, []);
  return Array.isArray(v) ? v : [];
}

function readOverrides(): Record<string, Partial<Product>> {
  const v = safeRead<Record<string, Partial<Product>>>(KEY_OVERRIDES, {});
  return v && typeof v === "object" ? v : {};
}

function readDeleted(): Set<string> {
  const v = safeRead<string[]>(KEY_DELETED, []);
  return new Set(Array.isArray(v) ? v : []);
}

// ─── Lectura ────────────────────────────────────────────────────────────────

export function listAllProducts(): Product[] {
  const overrides = readOverrides();
  const deleted = readDeleted();
  const seedWithOverrides = mockProducts.map((p) =>
    overrides[p.id] ? { ...p, ...overrides[p.id] } : p,
  );
  return [...seedWithOverrides, ...readNew()].filter((p) => !deleted.has(p.id));
}

export function getProductByIdFromStore(id: string): Product | undefined {
  return listAllProducts().find((p) => p.id === id);
}

// ─── Mutaciones ─────────────────────────────────────────────────────────────

export interface CreateProductInput {
  sku: string;
  name: string;
  barcode?: string;
  description?: string;
  brandId?: string;
  laboratoryId?: string;
  categoryId?: string;
  unit?: string;
  pharmaceuticalForm?: Product["pharmaceuticalForm"];
  presentation?: string;
  activeIngredient?: string;
  concentration?: string;
  requiresPrescription?: boolean;
  controlled?: boolean;
  cost?: number;
  price: number;
  itbisRate?: number;
  minStock?: number;
  maxStock?: number;
  imageUrl?: string | null;
  imageAlt?: string | null;
  active?: boolean;
  sellable?: boolean;
  businessId?: string;
}

export type CreateProductResult =
  | { ok: true; product: Product }
  | { ok: false; error: string; missingFields?: string[] };

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `prod_${ts}_${rand}`;
}

export function createProduct(input: CreateProductInput): CreateProductResult {
  const missing: string[] = [];
  if (!input.sku?.trim()) missing.push("sku");
  if (!input.name?.trim()) missing.push("name");
  if (input.price == null || Number.isNaN(input.price)) missing.push("price");
  if (missing.length > 0) {
    return {
      ok: false,
      error: "Complete los campos requeridos.",
      missingFields: missing,
    };
  }

  const all = listAllProducts();
  if (all.some((p) => p.sku === input.sku)) {
    return { ok: false, error: `Ya existe un producto con SKU ${input.sku}.` };
  }

  const now = new Date().toISOString();
  const product: Product = {
    id: generateId(),
    businessId: input.businessId ?? "biz_dermaland",
    sku: input.sku.trim(),
    barcode: input.barcode?.trim() || undefined,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    brandId: input.brandId,
    laboratoryId: input.laboratoryId,
    categoryId: input.categoryId,
    unit: input.unit?.trim() || "unidad",
    pharmaceuticalForm: input.pharmaceuticalForm,
    presentation: input.presentation?.trim() || undefined,
    activeIngredient: input.activeIngredient?.trim() || undefined,
    concentration: input.concentration?.trim() || undefined,
    requiresPrescription: !!input.requiresPrescription,
    controlled: !!input.controlled,
    cost: input.cost ?? 0,
    price: input.price,
    itbisRate: input.itbisRate ?? 18,
    minStock: input.minStock ?? 0,
    maxStock: input.maxStock ?? 0,
    imageUrl: input.imageUrl ?? null,
    imageAlt: input.imageAlt ?? input.name.trim(),
    active: input.active ?? true,
    sellable: input.sellable ?? true,
    createdAt: now,
    updatedAt: now,
  };

  const persisted = readNew();
  safeWrite(KEY_NEW, [...persisted, product]);
  return { ok: true, product };
}

export function updateProduct(
  id: string,
  patch: Partial<Product>,
): { ok: boolean } {
  // Si es nuevo (vive en KEY_NEW) → mutar en KEY_NEW.
  const persisted = readNew();
  const ix = persisted.findIndex((p) => p.id === id);
  if (ix >= 0) {
    const next = [...persisted];
    next[ix] = { ...next[ix]!, ...patch, updatedAt: new Date().toISOString() };
    safeWrite(KEY_NEW, next);
    return { ok: true };
  }
  // Sino, guardar en overrides.
  const overrides = readOverrides();
  overrides[id] = {
    ...(overrides[id] ?? {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  safeWrite(KEY_OVERRIDES, overrides);
  return { ok: true };
}

export function deleteProduct(id: string): { ok: boolean } {
  // Si es nuevo, removerlo del array.
  const persisted = readNew();
  const filtered = persisted.filter((p) => p.id !== id);
  if (filtered.length !== persisted.length) {
    safeWrite(KEY_NEW, filtered);
    return { ok: true };
  }
  // Sino soft-delete.
  const deleted = readDeleted();
  if (!deleted.has(id)) {
    deleted.add(id);
    safeWrite(KEY_DELETED, [...deleted]);
  }
  return { ok: true };
}

export function clearLocalProducts(): void {
  safeWrite(KEY_NEW, []);
  safeWrite(KEY_OVERRIDES, {});
  safeWrite(KEY_DELETED, []);
}

// ─── Backend (local vs Supabase) ─────────────────────────────────────────────
/**
 * Modo del backend de productos:
 *  - "local"    → este store (localStorage), por equipo (modo demo actual).
 *  - "supabase" → fuente ÚNICA compartida vía /api/products (RLS business_id).
 *
 * Se activa con `NEXT_PUBLIC_DATA_SOURCE=supabase` (build) + `DATA_SOURCE=
 * supabase` (servidor) + credenciales Supabase válidas. Por defecto: local.
 */
export const PRODUCT_BACKEND: "local" | "supabase" =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase"
    ? "supabase"
    : "local";

function notifyProductsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

export async function fetchProductsFromServer(): Promise<Product[]> {
  const res = await fetch(`/api/products?limit=1000`, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as { products: Product[] }).products;
}

function createInputToServerPayload(input: CreateProductInput) {
  return {
    businessId: input.businessId ?? "",
    sku: input.sku.trim(),
    barcode: input.barcode?.trim() || undefined,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    brandId: input.brandId,
    laboratoryId: input.laboratoryId,
    categoryId: input.categoryId,
    unit: input.unit?.trim() || "unidad",
    pharmaceuticalForm: input.pharmaceuticalForm,
    presentation: input.presentation?.trim() || undefined,
    activeIngredient: input.activeIngredient?.trim() || undefined,
    concentration: input.concentration?.trim() || undefined,
    requiresPrescription: !!input.requiresPrescription,
    controlled: !!input.controlled,
    cost: input.cost ?? 0,
    price: input.price,
    itbisRate: input.itbisRate ?? 18,
    minStock: input.minStock ?? 0,
    maxStock: input.maxStock ?? 0,
    imageUrl: input.imageUrl ?? null,
    active: input.active ?? true,
    sellable: input.sellable ?? true,
  };
}

async function createProductOnServer(input: CreateProductInput): Promise<CreateProductResult> {
  const missing: string[] = [];
  if (!input.sku?.trim()) missing.push("sku");
  if (!input.name?.trim()) missing.push("name");
  if (input.price == null || Number.isNaN(input.price)) missing.push("price");
  if (missing.length) return { ok: false, error: "Complete los campos requeridos.", missingFields: missing };
  try {
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createInputToServerPayload(input)),
    });
    const body = (await res.json().catch(() => ({}))) as { product?: Product; error?: string };
    if (!res.ok || !body.product) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    notifyProductsChanged();
    return { ok: true, product: body.product };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function updateProductOnServer(id: string, patch: Partial<Product>): Promise<CreateProductResult> {
  try {
    const res = await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = (await res.json().catch(() => ({}))) as { product?: Product; error?: string };
    if (!res.ok || !body.product) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    notifyProductsChanged();
    return { ok: true, product: body.product };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function saveProduct(
  mode: "create" | "edit",
  input: CreateProductInput,
  id?: string,
): Promise<CreateProductResult> {
  if (PRODUCT_BACKEND === "supabase") {
    return mode === "create" ? createProductOnServer(input) : updateProductOnServer(id!, input as Partial<Product>);
  }
  if (mode === "create") return createProduct(input);
  const r = updateProduct(id!, input as Partial<Product>);
  const found = getProductByIdFromStore(id!);
  return r.ok && found ? { ok: true, product: found } : { ok: false, error: "No se pudo actualizar el producto." };
}

export async function deleteProductAnywhere(id: string): Promise<{ ok: boolean; error?: string }> {
  if (PRODUCT_BACKEND === "supabase") {
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: body.error ?? `HTTP ${res.status}` };
      }
      notifyProductsChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  return deleteProduct(id);
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useProducts(): Product[] {
  const [list, setList] = React.useState<Product[]>(() =>
    PRODUCT_BACKEND === "supabase" ? [] : listAllProducts(),
  );
  React.useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (PRODUCT_BACKEND === "supabase") {
        fetchProductsFromServer()
          .then((p) => { if (alive) setList(p); })
          .catch(() => { if (alive) setList(listAllProducts()); });
      } else {
        setList(listAllProducts());
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
  }, []);
  return list;
}

export function useProduct(id: string | null | undefined): Product | undefined {
  const all = useProducts();
  if (!id) return undefined;
  return all.find((p) => p.id === id);
}
