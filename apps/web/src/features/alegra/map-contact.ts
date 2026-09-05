/**
 * Contacto de Alegra → borrador de cliente/proveedor de DermaLand. PURO.
 * Reglas (spec §5.2): nombre partido como en la tienda; teléfono con guiones
 * como lo escribe el mostrador; documento: 9 dígitos = RNC, 11 = cédula, otro
 * = pasaporte; inactivo en Alegra NO borra, solo `active=false`.
 */
import { splitFullName } from "@/features/storefront/account/full-name";
import { formatDominicanPhone } from "@/lib/utils/formatters";
import { normalizeDocument } from "@/features/customers/customer-normalization";
import type { AlegraContact } from "./types";

export type DocumentType = "cedula" | "rnc" | "passport";

export interface ClientDraft {
  firstName: string;
  lastName: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  documentType: DocumentType | null;
  documentNumber: string | null;
  active: boolean;
  alegraId: string;
  alegraUpdatedAt: string | null;
}

export interface SupplierDraft {
  name: string;
  rnc: string | null;
  phone: string | null;
  email: string | null;
  alegraId: string;
}

/**
 * Cliente = tiene el tipo `client` o NO tiene tipo ninguno. En Alegra hay
 * contactos con `type: []` que sí facturan (2026-09-05: 40 de ellos, con 177
 * facturas); tratarlos como no-clientes los dejaba sin ficha en DermaLand.
 */
export function isClient(c: AlegraContact): boolean {
  const tipos = c.type ?? [];
  return tipos.length === 0 || tipos.includes("client");
}

export function isProvider(c: AlegraContact): boolean {
  return (c.type ?? []).includes("provider");
}

/** Documento normalizado (solo letras y dígitos) y su tipo por longitud. */
export function documentOf(c: Pick<AlegraContact, "identification" | "identificationObject">): {
  type: DocumentType | null;
  number: string | null;
} {
  const raw = c.identificationObject?.number?.trim() || c.identification?.trim() || "";
  const number = normalizeDocument(raw);
  if (!number) return { type: null, number: null };
  if (/^\d{9}$/.test(number)) return { type: "rnc", number };
  if (/^\d{11}$/.test(number)) return { type: "cedula", number };
  return { type: "passport", number };
}

function phoneOf(c: AlegraContact): string | null {
  const raw = (c.phonePrimary ?? "").trim() || (c.mobile ?? "").trim() || (c.phoneSecondary ?? "").trim();
  if (!raw) return null;
  const formatted = formatDominicanPhone(raw);
  return formatted || null;
}

function emailOf(c: AlegraContact): string | null {
  const e = (c.email ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

export function contactToClientDraft(c: AlegraContact): ClientDraft {
  const { firstName, lastName } = splitFullName(c.name);
  const phone = phoneOf(c);
  const doc = documentOf(c);
  return {
    firstName,
    lastName,
    phone,
    whatsapp: phone,
    email: emailOf(c),
    documentType: doc.type,
    documentNumber: doc.number,
    active: c.status !== "inactive",
    alegraId: String(c.id),
    alegraUpdatedAt: c.updated_at ?? null,
  };
}

export function contactToSupplierDraft(c: AlegraContact): SupplierDraft {
  const doc = documentOf(c);
  return {
    name: c.name.trim(),
    rnc: doc.type === "rnc" ? doc.number : null,
    phone: phoneOf(c),
    email: emailOf(c),
    alegraId: String(c.id),
  };
}
