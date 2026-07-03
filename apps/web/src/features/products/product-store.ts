"use client";

import * as React from "react";
import type { Product } from "@/types";
import { mockProducts } from "@/lib/mock-data/catalog";
import { nextSkuFromSkus, nextSkuAfter } from "@/features/products/product-sku";

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

// Cache de lectura: re-parsear y mapear todo el seed en cada evento (y por
// cada hook montado) es costoso. Se reutiliza el resultado mientras las claves
// crudas de localStorage no cambien (cubre también escrituras directas sin
// eventos: tests, otras pestañas).

let productsCache: { raw: (string | null)[]; value: Product[] } | null = null;

function rawItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function listAllProducts(): Product[] {
  const canCache = typeof window !== "undefined";
  const raw = canCache ? [KEY_NEW, KEY_OVERRIDES, KEY_DELETED].map(rawItem) : [];
  if (canCache && productsCache && raw.every((r, i) => r === productsCache!.raw[i])) {
    return productsCache.value;
  }
  const overrides = readOverrides();
  const deleted = readDeleted();
  const seedWithOverrides = mockProducts.map((p) =>
    overrides[p.id] ? { ...p, ...overrides[p.id] } : p,
  );
  const value = [...seedWithOverrides, ...readNew()].filter((p) => !deleted.has(p.id));
  if (canCache) productsCache = { raw, value };
  return value;
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

/**
 * Campos REQUERIDOS para crear un producto (única fuente de verdad, usada por la
 * ruta local y la de servidor). El SKU NO es requerido: lo genera el sistema
 * (secuencial). ITBIS y Unidad tienen valores por defecto en el payload, así que
 * el bloqueo real solo es Nombre y Precio.
 */
export function missingCreateProductFields(
  input: Pick<CreateProductInput, "name" | "price">,
): string[] {
  const missing: string[] = [];
  if (!input.name?.trim()) missing.push("name");
  if (input.price == null || Number.isNaN(input.price)) missing.push("price");
  return missing;
}

export function createProduct(input: CreateProductInput): CreateProductResult {
  const missing = missingCreateProductFields(input);
  if (missing.length > 0) {
    return {
      ok: false,
      error: "Complete los campos requeridos.",
      missingFields: missing,
    };
  }

  const all = listAllProducts();
  // SKU autoritativo del sistema: si no viene o choca, se genera secuencial.
  const existing = new Set(all.map((p) => p.sku));
  let sku = (input.sku ?? "").trim() || nextSkuFromSkus([...existing]);
  while (existing.has(sku)) sku = nextSkuAfter(sku);

  const now = new Date().toISOString();
  const product: Product = {
    id: generateId(),
    businessId: input.businessId ?? "biz_dermaland",
    sku,
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

/** Página máxima por request: PostgREST corta en 1000 filas aunque se pida más. */
const SERVER_PAGE_SIZE = 1000;
/** Tope de seguridad contra loops (30k productos >> catálogo real). */
const SERVER_MAX_PAGES = 30;

/**
 * Trae el catálogo COMPLETO paginando de a 1000. Antes hacía un solo request
 * `?limit=1000`: con >1000 productos, todo lo que ordenara (por nombre) después
 * de la posición 1000 quedaba invisible para la UI — causa del "Producto no
 * encontrado" tras crear un producto cuyo nombre caía fuera de la 1ª página.
 */
export async function fetchProductsFromServer(): Promise<Product[]> {
  const all: Product[] = [];
  for (let page = 0; page < SERVER_MAX_PAGES; page++) {
    const offset = page * SERVER_PAGE_SIZE;
    const res = await fetch(
      `/api/products?limit=${SERVER_PAGE_SIZE}&offset=${offset}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    const { products } = (await res.json()) as { products: Product[] };
    all.push(...products);
    if (products.length < SERVER_PAGE_SIZE) break;
  }
  return all;
}

/**
 * Lee UN producto por id directo del servidor (`GET /api/products/[id]`).
 * `null` = no existe (o no es visible para el negocio actual); otros errores
 * lanzan. El detalle/edición usan esto en vez de buscar en la lista paginada.
 */
export async function fetchProductFromServer(id: string): Promise<Product | null> {
  const res = await fetch(`/api/products/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as { product: Product }).product;
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
  // Mismo validador que la ruta local. El SKU NO es requerido: lo genera el
  // sistema (secuencial, server-side). Antes esta ruta (supabase) exigía SKU y
  // bloqueaba SIEMPRE la creación en producción con "Complete los campos
  // requeridos." porque el form envía SKU vacío en modo crear.
  const missing = missingCreateProductFields(input);
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

/**
 * Activa/inactiva un producto, despachando local vs servidor según el backend.
 * Paralelo a `setBranchActiveAnywhere`. En supabase hace PATCH parcial.
 */
export async function setProductActiveAnywhere(
  id: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (PRODUCT_BACKEND === "supabase") {
    const r = await updateProductOnServer(id, { active });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }
  const r = updateProduct(id, { active });
  return { ok: r.ok };
}

/**
 * Asigna (o limpia) el laboratorio de un producto, despachando local vs
 * servidor según el backend. Útil al agregar stock: el laboratorio pertenece al
 * PRODUCTO, no al lote, así que el modal de stock lo actualiza aquí. Paralelo a
 * `setProductActiveAnywhere`; el PATCH parcial mapea `laboratory_id`.
 */
export async function setProductLaboratoryAnywhere(
  id: string,
  laboratoryId: string | undefined,
): Promise<{ ok: boolean; error?: string }> {
  if (PRODUCT_BACKEND === "supabase") {
    const r = await updateProductOnServer(id, { laboratoryId });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }
  const r = updateProduct(id, { laboratoryId });
  return { ok: r.ok };
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
        // Si el fetch falla se conserva la última lista buena: caer al store
        // local (mock/localStorage) en modo supabase mostraba un catálogo
        // que NO es el de la base compartida.
        fetchProductsFromServer()
          .then((p) => { if (alive) setList(p); })
          .catch(() => { /* mantener lista previa */ });
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

export interface ProductState {
  product: Product | undefined;
  /** true mientras el fetch por id está en vuelo (solo backend supabase). */
  loading: boolean;
}

/**
 * Producto por id CON estado de carga.
 *
 * En supabase lee por id directo (`fetchProductFromServer`) en vez de buscar
 * dentro de la lista paginada: un catálogo >1000 dejaba productos fuera de la
 * 1ª página y el detalle mostraba "Producto no encontrado" para productos que
 * SÍ existen (p. ej. recién creados). `loading` permite a las pantallas
 * distinguir "cargando" de "no existe".
 */
export function useProductState(id: string | null | undefined): ProductState {
  const [state, setState] = React.useState<ProductState>(() =>
    PRODUCT_BACKEND === "supabase"
      ? { product: undefined, loading: !!id }
      : { product: id ? getProductByIdFromStore(id) : undefined, loading: false },
  );
  React.useEffect(() => {
    if (!id) {
      setState({ product: undefined, loading: false });
      return;
    }
    let alive = true;
    const refresh = () => {
      if (PRODUCT_BACKEND === "supabase") {
        fetchProductFromServer(id)
          .then((p) => {
            if (alive) setState({ product: p ?? undefined, loading: false });
          })
          .catch(() => {
            // Error de red/servidor: conservar lo que hubiera y salir de carga.
            if (alive) setState((s) => ({ product: s.product, loading: false }));
          });
      } else {
        setState({ product: getProductByIdFromStore(id), loading: false });
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
  }, [id]);
  return state;
}

export function useProduct(id: string | null | undefined): Product | undefined {
  return useProductState(id).product;
}

/** Próximo SKU (servidor autoritativo en supabase; cálculo local en mock). */
export async function fetchNextSku(): Promise<string> {
  if (PRODUCT_BACKEND === "supabase") {
    try {
      const res = await fetch("/api/products/next-sku", { cache: "no-store" });
      const body = (await res.json()) as { sku?: string };
      if (res.ok && body.sku) return body.sku;
    } catch {
      /* fallback local */
    }
  }
  return nextSkuFromSkus(listAllProducts().map((p) => p.sku));
}

/** Hook para previsualizar el próximo SKU en el formulario de nuevo producto. */
export function useNextSku(enabled: boolean): string {
  const [sku, setSku] = React.useState("");
  React.useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetchNextSku().then((s) => {
      if (alive) setSku(s);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return sku;
}
