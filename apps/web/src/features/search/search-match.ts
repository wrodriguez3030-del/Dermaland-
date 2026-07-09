// Coincidencia en memoria + construcción de items del buscador (PURO, sin
// servidor). Lo usa el repositorio mock (y los tests) para filtrar sobre datos
// en memoria, y comparte con el repo Supabase los CONSTRUCTORES de item para que
// lo que se muestra en producción sea idéntico a lo que prueban los tests.

import type { SearchResultItem } from "./search-types";
import {
  customerDisplayName,
  customerHref,
  documentHref,
  lotHref,
  MIN_DIGITS_FOR_NUMERIC_MATCH,
  normalizeDigits,
  productHref,
} from "./search-core";

// ─── Formato de presentación ─────────────────────────────────────────────────

export function money(n: number): string {
  return `RD$${Number(n ?? 0).toLocaleString("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function stockLabel(qty: number): string {
  return `Stock: ${Number(qty ?? 0).toLocaleString("es-DO")}`;
}

export function expiryLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `Vence ${dd}/${mm}/${d.getUTCFullYear()}`;
}

const LOT_STATUS_LABEL: Record<string, string> = {
  available: "Disponible",
  quarantine: "Cuarentena",
  expired: "Vencido",
  recalled: "Retirado",
  depleted: "Agotado",
};
export function lotStatusLabel(status: string): string {
  return LOT_STATUS_LABEL[status] ?? status;
}

// ─── Registros normalizados (lo mínimo para pintar y navegar) ────────────────

export interface ProductRecord {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  brandName?: string;
  categoryName?: string;
  labName?: string;
  stock: number;
}
export interface CustomerRecord {
  id: string;
  customerNumber?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  whatsapp?: string;
  documentNumber?: string;
  email?: string;
}
export interface DocumentRecord {
  id: string;
  number?: string;
  ecfNumber?: string;
  customerName?: string;
  total: number;
  documentKind?: "invoice" | "proforma" | string;
}
export interface LotRecord {
  id: string;
  productId: string;
  lotNumber: string;
  productName?: string;
  branchName?: string;
  currentQuantity: number;
  expiresAt?: string;
  status: string;
}

// ─── Constructores de item (fuente única del display) ────────────────────────

export function productItem(p: ProductRecord): SearchResultItem {
  return {
    kind: "product",
    id: p.id,
    title: p.name || "Producto",
    subtitle: p.sku ? `SKU ${p.sku}` : undefined,
    meta: stockLabel(p.stock),
    href: productHref(p.id),
  };
}

export function customerItem(c: CustomerRecord): SearchResultItem {
  const phone = c.phone || c.whatsapp || "";
  const parts = [phone, c.customerNumber].filter(Boolean);
  return {
    kind: "customer",
    id: c.id,
    title: customerDisplayName(c.firstName, c.lastName) || "Cliente",
    subtitle: parts.join(" · ") || undefined,
    meta: c.documentNumber || undefined,
    href: customerHref(c.id),
  };
}

export function documentItem(d: DocumentRecord): SearchResultItem {
  const isInvoice = d.documentKind === "invoice";
  const docNumber =
    (isInvoice ? d.ecfNumber : "") || d.number || d.ecfNumber || "Documento";
  return {
    kind: isInvoice ? "invoice" : "proforma",
    id: d.id,
    title: docNumber,
    subtitle: d.customerName || undefined,
    meta: money(d.total),
    href: documentHref(d.id, isInvoice ? "invoice" : "proforma"),
  };
}

export function lotItem(l: LotRecord): SearchResultItem {
  const meta = [
    l.branchName ?? "",
    stockLabel(l.currentQuantity),
    expiryLabel(l.expiresAt),
    lotStatusLabel(l.status),
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    kind: "lot",
    id: l.id,
    title: `Lote ${l.lotNumber ?? ""}`.trim(),
    subtitle: l.productName || undefined,
    meta,
    href: lotHref(l.productId),
  };
}

// ─── Coincidencia en memoria (mock / tests) ──────────────────────────────────

function includesCI(haystack: string | undefined, needleLower: string): boolean {
  return !!haystack && haystack.toLowerCase().includes(needleLower);
}
/** Compara por dígitos: "8297141975" casa con "829-714-1975". Mín. 3 dígitos. */
function digitsMatch(value: string | undefined, digits: string): boolean {
  if (digits.length < MIN_DIGITS_FOR_NUMERIC_MATCH) return false;
  return normalizeDigits(value ?? "").includes(digits);
}

export function matchProducts(term: string, rows: ProductRecord[]): SearchResultItem[] {
  const q = term.toLowerCase();
  return rows
    .filter(
      (p) =>
        includesCI(p.name, q) ||
        includesCI(p.sku, q) ||
        includesCI(p.barcode, q) ||
        includesCI(p.brandName, q) ||
        includesCI(p.categoryName, q) ||
        includesCI(p.labName, q),
    )
    .map(productItem);
}

export function matchCustomers(term: string, rows: CustomerRecord[]): SearchResultItem[] {
  const q = term.toLowerCase();
  const digits = normalizeDigits(term);
  return rows
    .filter(
      (c) =>
        includesCI(c.firstName, q) ||
        includesCI(c.lastName, q) ||
        includesCI(customerDisplayName(c.firstName, c.lastName), q) ||
        includesCI(c.email, q) ||
        includesCI(c.customerNumber, q) ||
        digitsMatch(c.phone, digits) ||
        digitsMatch(c.whatsapp, digits) ||
        digitsMatch(c.documentNumber, digits),
    )
    .map(customerItem);
}

export function matchDocuments(term: string, rows: DocumentRecord[]): SearchResultItem[] {
  const q = term.toLowerCase();
  return rows
    .filter(
      (d) =>
        includesCI(d.number, q) ||
        includesCI(d.ecfNumber, q) ||
        includesCI(d.customerName, q),
    )
    .map(documentItem);
}

export function matchLots(term: string, rows: LotRecord[]): SearchResultItem[] {
  const q = term.toLowerCase();
  return rows
    .filter((l) => includesCI(l.lotNumber, q) || includesCI(l.productName, q))
    .map(lotItem);
}
