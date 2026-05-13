"use client";

import * as React from "react";
import type {
  Customer,
  CustomerSkinType,
  DefaultBillingType,
} from "@/types";
import { mockCustomers } from "@/lib/mock-data/customers";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import {
  findPotentialDuplicateClients,
  type DuplicateDetectionResult,
  normalizeDocument,
  normalizeEmail,
  normalizeFullName,
  normalizePhone,
} from "./utils/duplicate-detection";

/**
 * Customer store — MVP.
 *
 * Combina los clientes seed (`mockCustomers`) con los creados desde la UI
 * (persistidos en `localStorage` bajo la key `dermaland.clients`).
 *
 * En producción se reemplaza por un repositorio Supabase con índices únicos
 * por `business_id` (ver `riesgos.md` → R-CRM-02).
 *
 * - Reactivo: emite un CustomEvent al mutar — los hooks se re-renderizan.
 * - Idempotente entre tabs: escucha también `storage` events del navegador.
 * - SSR-safe: si `window` no existe, devuelve solo mock data.
 */

export const STORAGE_KEY = "dermaland.clients";
const CHANGE_EVENT = "dermaland:clients-changed";

// ─── Persistencia ───────────────────────────────────────────────────────────

function readLocal(): Customer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Customer[];
  } catch {
    return [];
  }
}

function writeLocal(list: Customer[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

// ─── Lectura ────────────────────────────────────────────────────────────────

/**
 * Devuelve la lista combinada `mock + local` con dedup por `id`. Si un cliente
 * existe tanto en seed como en local, **gana el local** (representa una
 * edición de seed). El soft-delete oculta seeds que el usuario haya
 * eliminado desde la UI.
 */
export function listAllCustomers(): Customer[] {
  const soft = new Set(readSoftDeleted());
  const local = readLocal();
  const localIds = new Set(local.map((c) => c.id));
  const seedSurvivors = mockCustomers.filter((c) => !localIds.has(c.id));
  return [...seedSurvivors, ...local].filter((c) => !soft.has(c.id));
}

export function getCustomerByIdFromStore(id: string): Customer | undefined {
  return listAllCustomers().find((c) => c.id === id);
}

// ─── Creación ───────────────────────────────────────────────────────────────

export interface CreateCustomerInput {
  firstName: string;
  lastName: string;
  documentType?: "cedula" | "rnc" | "passport";
  documentNumber?: string;
  defaultBillingType: DefaultBillingType;
  birthDate?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  city?: string;
  province?: string;
  source?: Customer["source"];
  skinType: CustomerSkinType;
  notes?: string;
  tags?: string[];
  consents?: { templateId: string; grantedAt: string }[];
  businessId?: string;
  branchId?: string;
}

export type CreateCustomerResult =
  | { ok: true; customer: Customer }
  | { ok: false; error: string; duplicate?: DuplicateDetectionResult; missingFields?: string[] };

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `cust_${ts}_${rand}`;
}

function generateCustomerNumber(): string {
  const all = listAllCustomers();
  const existingNums = all
    .map((c) => c.customerNumber)
    .filter((n) => /^CLI-\d+$/.test(n))
    .map((n) => Number.parseInt(n.slice(4), 10));
  const next = (existingNums.length > 0 ? Math.max(...existingNums) : 0) + 1;
  return `CLI-${String(next).padStart(6, "0")}`;
}

/**
 * Valida + chequea duplicados + persiste un cliente nuevo.
 *
 * Validación obligatoria:
 *  - firstName + lastName
 *  - phone OR whatsapp (al menos uno)
 *  - defaultBillingType + skinType (vienen siempre con default)
 *
 * Si hay duplicado high/medium → no guarda; devuelve `duplicate` para que la UI
 * muestre el modal y el usuario decida si forzar override.
 */
export function createCustomer(
  input: CreateCustomerInput,
  options: { force?: boolean } = {},
): CreateCustomerResult {
  const missing: string[] = [];
  if (!input.firstName?.trim()) missing.push("firstName");
  if (!input.lastName?.trim()) missing.push("lastName");
  if (!input.phone?.trim() && !input.whatsapp?.trim()) missing.push("phoneOrWhatsapp");
  if (missing.length > 0) {
    return {
      ok: false,
      error: "Complete los campos requeridos.",
      missingFields: missing,
    };
  }

  const businessId = input.businessId ?? mockBusiness.id;

  if (!options.force) {
    const dup = findPotentialDuplicateClients(
      {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        whatsapp: input.whatsapp,
        email: input.email,
        documentNumber: input.documentNumber,
        birthDate: input.birthDate,
        businessId,
      },
      listAllCustomers(),
    );
    if (dup.isDuplicate) {
      return {
        ok: false,
        error: "Este cliente ya fue registrado.",
        duplicate: dup,
      };
    }
  }

  const now = new Date().toISOString();
  const newCustomer: Customer = {
    id: generateId(),
    businessId,
    customerNumber: generateCustomerNumber(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    documentType: input.documentType,
    documentNumber: input.documentNumber?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    whatsapp: input.whatsapp?.trim() || undefined,
    email: input.email?.trim() || undefined,
    birthDate: input.birthDate || undefined,
    address: input.address?.trim() || undefined,
    city: input.city?.trim() || undefined,
    province: input.province?.trim() || undefined,
    source: input.source ?? "manual",
    tags: input.tags ?? [],
    defaultBillingType: input.defaultBillingType,
    skinType: input.skinType,
    totalSpent: 0,
    totalOrders: 0,
    notes: input.notes?.trim() || undefined,
    consents: input.consents ?? [],
    createdAt: now,
    updatedAt: now,
  };

  // Persistencia
  const persisted = readLocal();
  writeLocal([...persisted, newCustomer]);

  return { ok: true, customer: newCustomer };
}

// ─── Edición ────────────────────────────────────────────────────────────────

export interface UpdateCustomerInput {
  firstName?: string;
  lastName?: string;
  documentType?: "cedula" | "rnc" | "passport";
  documentNumber?: string;
  defaultBillingType?: DefaultBillingType;
  birthDate?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  city?: string;
  province?: string;
  source?: Customer["source"];
  skinType?: CustomerSkinType;
  notes?: string;
  tags?: string[];
  consents?: { templateId: string; grantedAt: string }[];
}

export type UpdateCustomerResult =
  | { ok: true; customer: Customer }
  | {
      ok: false;
      error: string;
      duplicate?: DuplicateDetectionResult;
      missingFields?: string[];
    };

/**
 * Actualiza un cliente existente — sea seed (mock) o local.
 *
 * - Si el cliente vive sólo en seed, su versión editada se guarda en
 *   `localStorage` con el mismo `id`. `listAllCustomers` deduplica
 *   prefiriendo la versión local.
 * - Si vive en local, se sobreescribe.
 * - Validación obligatoria: `firstName`, `lastName`, y al menos uno de
 *   `phone`/`whatsapp`.
 * - Detección de duplicados con `excludeClientId: id` para no chocar
 *   contra sí mismo.
 *
 * En producción esto se reemplaza por un UPDATE Supabase con RLS por
 * `business_id`.
 */
export function updateCustomer(
  id: string,
  patch: UpdateCustomerInput,
  options: { force?: boolean } = {},
): UpdateCustomerResult {
  // Resolver base actual (local prevalece sobre seed).
  const local = readLocal();
  const localBase = local.find((c) => c.id === id);
  const seedBase = mockCustomers.find((c) => c.id === id);
  const base = localBase ?? seedBase;
  if (!base) {
    return { ok: false, error: "Cliente no encontrado." };
  }

  // Trim helpers idempotentes.
  const t = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);

  // Construir el "would-be" updated antes de validar.
  const merged: Customer = {
    ...base,
    ...(patch.firstName !== undefined ? { firstName: patch.firstName.trim() } : {}),
    ...(patch.lastName !== undefined ? { lastName: patch.lastName.trim() } : {}),
    ...(patch.documentType !== undefined ? { documentType: patch.documentType } : {}),
    ...(patch.documentNumber !== undefined ? { documentNumber: t(patch.documentNumber) } : {}),
    ...(patch.defaultBillingType !== undefined ? { defaultBillingType: patch.defaultBillingType } : {}),
    ...(patch.birthDate !== undefined ? { birthDate: patch.birthDate || undefined } : {}),
    ...(patch.phone !== undefined ? { phone: t(patch.phone) } : {}),
    ...(patch.whatsapp !== undefined ? { whatsapp: t(patch.whatsapp) } : {}),
    ...(patch.email !== undefined ? { email: t(patch.email) } : {}),
    ...(patch.address !== undefined ? { address: t(patch.address) } : {}),
    ...(patch.city !== undefined ? { city: t(patch.city) } : {}),
    ...(patch.province !== undefined ? { province: t(patch.province) } : {}),
    ...(patch.source !== undefined ? { source: patch.source } : {}),
    ...(patch.skinType !== undefined ? { skinType: patch.skinType } : {}),
    ...(patch.notes !== undefined ? { notes: t(patch.notes) } : {}),
    ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
    ...(patch.consents !== undefined ? { consents: patch.consents } : {}),
    updatedAt: new Date().toISOString(),
  };

  // Validación de campos requeridos sobre el resultado merged.
  const missing: string[] = [];
  if (!merged.firstName?.trim()) missing.push("firstName");
  if (!merged.lastName?.trim()) missing.push("lastName");
  if (!merged.phone?.trim() && !merged.whatsapp?.trim()) missing.push("phoneOrWhatsapp");
  if (missing.length > 0) {
    return {
      ok: false,
      error: "Complete los campos requeridos.",
      missingFields: missing,
    };
  }

  // Validación de duplicados — excluyendo el propio cliente.
  if (!options.force) {
    const dup = findPotentialDuplicateClients(
      {
        firstName: merged.firstName,
        lastName: merged.lastName,
        phone: merged.phone,
        whatsapp: merged.whatsapp,
        email: merged.email,
        documentNumber: merged.documentNumber,
        birthDate: merged.birthDate,
        businessId: merged.businessId,
      },
      listAllCustomers(),
      { excludeClientId: id },
    );
    if (dup.isDuplicate) {
      return {
        ok: false,
        error:
          "Hay otro cliente con los mismos datos. Verifique antes de continuar.",
        duplicate: dup,
      };
    }
  }

  // Persistir: si era seed sin override, agregamos la versión local con
  // el mismo id; si ya había local, la reemplazamos.
  const next = local.filter((c) => c.id !== id);
  next.push(merged);
  writeLocal(next);
  return { ok: true, customer: merged };
}

// Útil para tests / "limpiar mis pruebas locales"
export function clearLocalCustomers(): void {
  writeLocal([]);
}

/**
 * Elimina un cliente.
 *
 * Si es un cliente persistido localmente (creado por la UI), se borra de
 * `localStorage`. Si es uno del seed mock, se marca como "soft-deleted"
 * en una lista paralela para que la UI lo oculte. Los seeds nunca se mutan
 * en memoria (no se editan desde TS) — el flag se persiste igual.
 *
 * Producción: backend hace soft delete con `deleted_at` en la tabla.
 */
const SOFT_DELETED_KEY = "dermaland.clients.deleted";

function readSoftDeleted(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SOFT_DELETED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function writeSoftDeleted(ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SOFT_DELETED_KEY, JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function deleteCustomer(id: string): { ok: boolean } {
  // ¿Es un cliente local persistido?
  const persisted = readLocal();
  const filtered = persisted.filter((c) => c.id !== id);
  if (filtered.length !== persisted.length) {
    writeLocal(filtered);
    return { ok: true };
  }
  // Soft delete del seed
  const soft = readSoftDeleted();
  if (!soft.includes(id)) {
    writeSoftDeleted([...soft, id]);
  }
  return { ok: true };
}

export function isSoftDeleted(id: string): boolean {
  return readSoftDeleted().includes(id);
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Hook reactivo: devuelve la lista combinada (mock + local) y se re-renderiza
 * cuando se crea/edita/elimina un cliente en cualquier tab.
 *
 * **Hidratación segura:** el estado inicial es sólo `mockCustomers` (lo que
 * el servidor también ve, sin `window`). El merge con `localStorage` y la
 * aplicación de soft-deletes ocurren dentro de `useEffect`, garantizando
 * que SSR y primer render cliente devuelvan exactamente el mismo HTML
 * antes de la hidratación. Sin esto, editar un seed (que persiste en
 * localStorage como override) provocaría "Hydration failed" porque el
 * server seguiría mostrando el seed original.
 */
export function useCustomers(): Customer[] {
  const [list, setList] = React.useState<Customer[]>(mockCustomers);

  React.useEffect(() => {
    const refresh = () => setList(listAllCustomers());
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    // Refrescar al montar para incluir locales y soft-deletes.
    refresh();
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return list;
}

/** Hook puntual para el detalle. */
export function useCustomer(id: string | null | undefined): Customer | undefined {
  const all = useCustomers();
  if (!id) return undefined;
  return all.find((c) => c.id === id);
}

// ─── Aliases (terminología "client" pedida en la guía del proyecto) ────────
// Mantener `Customer*` como nombres canónicos; `Client*` son aliases para
// facilitar lectura desde código que use la jerga "cliente".

export const listClients = listAllCustomers;
export const getClientById = getCustomerByIdFromStore;
export const createClient = createCustomer;
export const updateClient = updateCustomer;
export const deleteClient = deleteCustomer;

// ─── Helpers de exposición de normalizadores (útiles fuera de tests) ────────

export const normalizers = {
  document: normalizeDocument,
  email: normalizeEmail,
  fullName: normalizeFullName,
  phone: normalizePhone,
};
