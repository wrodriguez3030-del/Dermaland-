/**
 * Detección de clientes duplicados — MVP en frontend con mock data.
 *
 * Producción: reforzar con índices únicos parciales por `business_id` en
 * `clients` (documento normalizado, teléfono normalizado, email normalizado)
 * y un índice compuesto en `(business_id, normalized_full_name, birth_date)`.
 *
 * Documentado en `decisiones.md` y `riesgos.md` (R-CRM-01 / R-CRM-02).
 */

import type { Customer } from "@/types";
import { onlyDigits } from "@/lib/utils/formatters";

// ─── Normalización ──────────────────────────────────────────────────────────

// Combining Diacritical Marks block: U+0300..U+036F.
const removeAccents = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "");

export function normalizeName(value: string | undefined): string {
  if (!value) return "";
  return removeAccents(value.toLowerCase().trim()).replace(/\s+/g, " ");
}

export function normalizeFullName(
  firstName: string | undefined,
  lastName: string | undefined,
): string {
  return `${normalizeName(firstName)} ${normalizeName(lastName)}`.trim();
}

/** Conserva solo dígitos. Si arranca con "1" y total 11, quita el +1 prefix. */
export function normalizePhone(value: string | undefined): string {
  if (!value) return "";
  const d = onlyDigits(value);
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  return d;
}

export function normalizeEmail(value: string | undefined): string {
  if (!value) return "";
  return value.toLowerCase().trim();
}

export function normalizeDocument(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function normalizeDate(value: string | undefined): string {
  if (!value) return "";
  // Acepta YYYY-MM-DD o ISO; devuelve YYYY-MM-DD.
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.trim();
  return d.toISOString().slice(0, 10);
}

// ─── Tipos ─────────────────────────────────────────────────────────────────

export interface CustomerFormCandidate {
  firstName?: string;
  lastName?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  documentNumber?: string;
  birthDate?: string;
  businessId: string;
}

export type DuplicateConfidence = "high" | "medium" | "low";

export interface DuplicateMatch {
  customer: Customer;
  reasons: string[];
  confidence: DuplicateConfidence;
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  matches: DuplicateMatch[];
  /** Confianza máxima encontrada — útil para decidir UI (block vs warn). */
  topConfidence: DuplicateConfidence | null;
}

// ─── Detección ──────────────────────────────────────────────────────────────

const HIGH = "high" as const;
const MEDIUM = "medium" as const;
const LOW = "low" as const;

const rank: Record<DuplicateConfidence, number> = { high: 3, medium: 2, low: 1 };

function pickHigher(
  a: DuplicateConfidence | null,
  b: DuplicateConfidence,
): DuplicateConfidence {
  if (!a) return b;
  return rank[b] > rank[a] ? b : a;
}

/**
 * Compara dos teléfonos normalizados — considera "parecidos" si comparten los
 * últimos 7 dígitos (evita falsos positivos por +1 / código de área).
 */
function phonesSimilar(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.slice(-7) === b.slice(-7) && a.slice(-7).length === 7;
}

export interface FindDuplicatesOptions {
  /**
   * Id del cliente que se está editando — se excluye de la comparación
   * para que no se detecte como duplicado de sí mismo. Crítico al editar
   * un cliente sin cambiar teléfono/documento/email.
   */
  excludeClientId?: string;
}

/**
 * Devuelve coincidencias del candidato contra la lista existente,
 * filtrando ya por business_id (multitenancy). Si `excludeClientId`
 * está presente, ese cliente se omite (caso edición).
 */
export function findPotentialDuplicateClients(
  candidate: CustomerFormCandidate,
  existing: Customer[],
  options: FindDuplicatesOptions = {},
): DuplicateDetectionResult {
  const cFirst = normalizeName(candidate.firstName);
  const cLast = normalizeName(candidate.lastName);
  const cFull = normalizeFullName(candidate.firstName, candidate.lastName);
  const cPhone = normalizePhone(candidate.phone);
  const cWa = normalizePhone(candidate.whatsapp);
  const cEmail = normalizeEmail(candidate.email);
  const cDoc = normalizeDocument(candidate.documentNumber);
  const cDob = normalizeDate(candidate.birthDate);

  const matches: DuplicateMatch[] = [];

  for (const e of existing) {
    if (e.businessId !== candidate.businessId) continue; // aislamiento multi-tenant
    if (options.excludeClientId && e.id === options.excludeClientId) continue; // edición: no compararse contra sí mismo

    const eFirst = normalizeName(e.firstName);
    const eLast = normalizeName(e.lastName);
    const eFull = normalizeFullName(e.firstName, e.lastName);
    const ePhone = normalizePhone(e.phone);
    const eWa = normalizePhone(e.whatsapp);
    const eEmail = normalizeEmail(e.email);
    const eDoc = normalizeDocument(e.documentNumber);
    const eDob = normalizeDate(e.birthDate);

    const reasons: string[] = [];
    let confidence: DuplicateConfidence | null = null;

    // ── Alta confianza ──
    if (cDoc && eDoc && cDoc === eDoc) {
      reasons.push("documento");
      confidence = pickHigher(confidence, HIGH);
    }
    if (cPhone && ePhone && cPhone === ePhone) {
      reasons.push("teléfono");
      confidence = pickHigher(confidence, HIGH);
    }
    if (cWa && eWa && cWa === eWa) {
      reasons.push("WhatsApp");
      confidence = pickHigher(confidence, HIGH);
    }
    if (cEmail && eEmail && cEmail === eEmail) {
      reasons.push("email");
      confidence = pickHigher(confidence, HIGH);
    }
    if (cFull && eFull && cFull === eFull && cDob && eDob && cDob === eDob) {
      reasons.push("nombre, apellido y fecha de nacimiento");
      confidence = pickHigher(confidence, HIGH);
    }

    // ── Media confianza ──
    if (
      cFull && eFull && cFull === eFull &&
      cPhone && ePhone && phonesSimilar(cPhone, ePhone) &&
      cPhone !== ePhone
    ) {
      reasons.push("nombre, apellido y teléfono parecido");
      confidence = pickHigher(confidence, MEDIUM);
    }
    if (
      cFull && eFull && cFull === eFull &&
      cWa && eWa && phonesSimilar(cWa, eWa) && cWa !== eWa
    ) {
      reasons.push("nombre, apellido y WhatsApp parecido");
      confidence = pickHigher(confidence, MEDIUM);
    }
    if (
      cFirst && eFirst && cFirst === eFirst &&
      cDob && eDob && cDob === eDob &&
      !(cFull === eFull) // si full ya coincidió va como high arriba
    ) {
      reasons.push("nombre y fecha de nacimiento");
      confidence = pickHigher(confidence, MEDIUM);
    }
    if (
      cLast && eLast && cLast === eLast &&
      cPhone && ePhone && phonesSimilar(cPhone, ePhone) &&
      !cFull // si ya hubo full match no contar 2 veces
    ) {
      reasons.push("apellido y teléfono");
      confidence = pickHigher(confidence, MEDIUM);
    }
    if (
      cEmail && eEmail && cEmail === eEmail &&
      cPhone && ePhone && phonesSimilar(cPhone, ePhone)
    ) {
      // Ya capturado por high si exact email; aquí caso de email distinto pero similares
    }

    // ── Baja confianza ──
    if (
      cFirst && eFirst && cFirst === eFirst &&
      cLast && eLast && cLast === eLast &&
      reasons.length === 0
    ) {
      reasons.push("nombre y apellido parecidos");
      confidence = pickHigher(confidence, LOW);
    }
    if (
      cPhone && ePhone &&
      phonesSimilar(cPhone, ePhone) && cPhone !== ePhone &&
      reasons.length === 0
    ) {
      reasons.push("teléfono parcialmente parecido");
      confidence = pickHigher(confidence, LOW);
    }

    if (confidence) {
      matches.push({ customer: e, reasons, confidence });
    }
  }

  // Ordenar por confianza descendente
  matches.sort((a, b) => rank[b.confidence] - rank[a.confidence]);

  const topConfidence = matches[0]?.confidence ?? null;
  const isDuplicate = matches.some(
    (m) => m.confidence === HIGH || m.confidence === MEDIUM,
  );

  return { isDuplicate, matches, topConfidence };
}

/**
 * Helper: descripción legible de un match.
 */
export function describeMatch(m: DuplicateMatch): string {
  return `Coincidencia por: ${m.reasons.join(", ")}`;
}

/**
 * Mensaje principal según confianza máxima.
 */
export function duplicateMessage(
  confidence: DuplicateConfidence | null,
): string {
  switch (confidence) {
    case "high":
      return "Este cliente ya fue registrado. Encontramos una coincidencia con el mismo documento, teléfono, correo o fecha de nacimiento.";
    case "medium":
      return "Existe un cliente similar registrado. Verifique los datos antes de crear un nuevo perfil.";
    case "low":
      return "Existe un cliente similar. Verifique antes de guardar.";
    default:
      return "";
  }
}
