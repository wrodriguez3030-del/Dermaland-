// Núcleo PURO del buscador global (sin React, sin servidor). Normalización de
// teléfono/documento, construcción de patrones ILIKE tolerantes a separadores,
// clasificación de la consulta, rutas de resultados y agrupación/orden/límite.

import type {
  GlobalSearchResults,
  SearchGroupKind,
  SearchResultItem,
} from "./search-types";
import {
  SEARCH_GROUP_LABEL,
  SEARCH_GROUP_ORDER,
  SEARCH_MIN_CHARS,
} from "./search-types";

/** Solo los dígitos: "829-714-1975" → "8297141975". */
export function normalizeDigits(input: string): string {
  return (input ?? "").replace(/\D+/g, "");
}

/**
 * Patrón ILIKE que matchea una secuencia de dígitos IGNORANDO separadores.
 * "8297141975" → "%8%2%9%7%1%4%1%9%7%5%" — casa tanto "829-714-1975" como
 * "8297141975" en la columna cruda, sin necesitar columnas normalizadas ni DDL.
 * Devuelve null si no hay dígitos (para no agregar un filtro inútil).
 */
export function digitsIlikePattern(input: string): string | null {
  const digits = normalizeDigits(input);
  if (digits.length === 0) return null;
  return `%${digits.split("").join("%")}%`;
}

/** Quita `%` y `,` (rompen el CSV de `.or()` de PostgREST) y colapsa espacios. */
export function sanitizeTerm(term: string): string {
  return (term ?? "").replace(/[%,]/g, " ").replace(/\s+/g, " ").trim();
}

/** ¿La consulta tiene el mínimo de caracteres para buscar? */
export function hasEnoughChars(q: string): boolean {
  return sanitizeTerm(q).length >= SEARCH_MIN_CHARS;
}

export interface QueryClassification {
  raw: string;
  term: string;
  digits: string;
  isNumeric: boolean;
  looksLikeSku: boolean;
  /** NCF (B01/B02), e-NCF (E31/E32/E34) o proforma (PROF-…). */
  looksLikeDocument: boolean;
}

/** Pistas para decidir qué entidades priorizar/consultar. */
export function classifyQuery(raw: string): QueryClassification {
  const term = sanitizeTerm(raw);
  const upper = term.toUpperCase();
  const digits = normalizeDigits(term);
  const compact = upper.replace(/[\s-]/g, "");
  const looksLikeSku = /^DERM-?\d{0,6}$/i.test(compact) || /^DERM/i.test(upper);
  const looksLikeDocument =
    /^B0?[12]/.test(compact) || // B01 / B02
    /^E3[124]/.test(compact) || // E31 / E32 / E34
    /^PROF/i.test(compact);
  const isNumeric = digits.length >= 3 && /^[\d\s()+-]+$/.test(term);
  return { raw, term, digits, isNumeric, looksLikeSku, looksLikeDocument };
}

// ─── Rutas (nunca 404, nunca UUID visible en UI) ─────────────────────────────

export function productHref(id: string): string {
  return `/productos/${id}`;
}
export function customerHref(id: string): string {
  return `/clientes/${id}`;
}
/** invoice → detalle de venta; proforma → detalle de proforma. */
export function documentHref(id: string, kind: "invoice" | "proforma"): string {
  return kind === "invoice" ? `/ventas/${id}` : `/proformas/${id}`;
}
/** El lote se abre en el detalle de su producto (lista sus lotes). */
export function lotHref(productId: string): string {
  return `/productos/${productId}`;
}

// ─── Presentación ────────────────────────────────────────────────────────────

export function customerDisplayName(first: string, last: string): string {
  return `${(first ?? "").trim()} ${(last ?? "").trim()}`.trim();
}

/**
 * Agrupa por categoría (en el orden canónico), pone etiquetas y limita cada
 * grupo a `perGroup`. `total` refleja lo ENCONTRADO (no lo mostrado) para el
 * texto "ver todos". Grupos vacíos se omiten.
 */
export function buildGroups(
  query: string,
  items: SearchResultItem[],
  perGroup: number,
): GlobalSearchResults {
  const byKind = new Map<SearchGroupKind, SearchResultItem[]>();
  for (const it of items) {
    const arr = byKind.get(it.kind) ?? [];
    arr.push(it);
    byKind.set(it.kind, arr);
  }
  const groups = SEARCH_GROUP_ORDER.flatMap((kind) => {
    const arr = byKind.get(kind);
    if (!arr || arr.length === 0) return [];
    return [
      {
        kind,
        label: SEARCH_GROUP_LABEL[kind],
        items: arr.slice(0, perGroup),
      },
    ];
  });
  return { query, groups, total: items.length };
}
