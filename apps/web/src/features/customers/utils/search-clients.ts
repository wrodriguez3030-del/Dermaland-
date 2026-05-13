import type { Customer } from "@/types";
import {
  normalizeDocument,
  normalizeEmail,
  normalizeFullName,
  normalizeName,
  normalizePhone,
} from "./duplicate-detection";

/**
 * Búsqueda de clientes contra varios campos normalizados.
 *
 * Campos consultados:
 *  - fullName / firstName / lastName  (sin acentos, lowercase)
 *  - phone / whatsapp                 (solo dígitos, +1 prefix removido)
 *  - documentNumber                   (sin guiones, uppercase)
 *  - email                            (lowercase, trim)
 *  - customerNumber                   (literal)
 *
 * Reglas:
 *  - query vacío → devuelve primeros `limit` ordenados por última visita.
 *  - query < 2 chars → []  (evita ruido al teclear primer carácter).
 *  - resultado limitado a `limit` (default 10).
 *  - filtrado opcional por `businessId` para multi-tenancy.
 */

export interface SearchOptions {
  limit?: number;
  businessId?: string;
}

export function searchClients(
  query: string,
  clients: Customer[],
  opts: SearchOptions = {},
): Customer[] {
  const limit = opts.limit ?? 10;
  const scoped = opts.businessId
    ? clients.filter((c) => c.businessId === opts.businessId)
    : clients;

  const raw = (query ?? "").trim();

  if (raw.length === 0) {
    return [...scoped]
      .sort(
        (a, b) =>
          +new Date(b.lastVisitAt ?? b.createdAt) -
          +new Date(a.lastVisitAt ?? a.createdAt),
      )
      .slice(0, limit);
  }

  if (raw.length < 2) return [];

  const qName = normalizeName(raw);
  const qDigits = normalizePhone(raw);
  const qDoc = normalizeDocument(raw);
  const qEmail = normalizeEmail(raw);
  const qLower = raw.toLowerCase();

  const matched = scoped.filter((c) => {
    // Nombre completo
    const fullName = normalizeFullName(c.firstName, c.lastName);
    if (qName.length >= 2 && fullName.includes(qName)) return true;

    // Teléfono / WhatsApp (solo si la query tiene ≥ 3 dígitos)
    if (qDigits.length >= 3) {
      if (c.phone && normalizePhone(c.phone).includes(qDigits)) return true;
      if (c.whatsapp && normalizePhone(c.whatsapp).includes(qDigits)) return true;
    }

    // Documento (cédula / RNC / pasaporte)
    if (qDoc.length >= 3 && c.documentNumber) {
      if (normalizeDocument(c.documentNumber).includes(qDoc)) return true;
    }

    // Email
    if (c.email && qEmail.length >= 3) {
      if (normalizeEmail(c.email).includes(qEmail)) return true;
    }

    // Customer number (CLI-000001)
    if (c.customerNumber.toLowerCase().includes(qLower)) return true;

    return false;
  });

  return matched.slice(0, limit);
}
