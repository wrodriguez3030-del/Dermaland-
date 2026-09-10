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
import {
  normalizeDocument,
  normalizeEmail,
  normalizePhone,
} from "../customer-normalization";

// ─── Normalización ──────────────────────────────────────────────────────────
// Documento / teléfono / email viven en `customer-normalization` (canónico,
// compartido con el emparejamiento de ventas). Aquí solo lo específico de
// nombres/fechas para detección de duplicados.

// Re-export para compat con los imports existentes de este módulo.
export { normalizeDocument, normalizeEmail, normalizePhone };

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

/**
 * Los únicos campos que el matcher LEE de cada "existing". Genérico sobre
 * esto (no sobre `Customer` completo) para que un caller que solo trajo
 * columnas livianas de la base (p.ej. el escaneo masivo de "Unificar
 * clientes", que NO puede pagar traer las ~25 columnas de `clients` para
 * 6 500+ filas) pueda usar el mismo criterio sin fingir tener un `Customer`
 * entero. Ver [[dermaland-panel-lentitud-medida]]: `select("*")` sobre esta
 * tabla ya causó un problema de rendimiento real una vez (`customer.list`);
 * este genérico existe para que no se repita.
 */
export type MatchableCustomerFields = Pick<
  Customer,
  | "id"
  | "businessId"
  | "firstName"
  | "lastName"
  | "phone"
  | "whatsapp"
  | "email"
  | "documentNumber"
  | "birthDate"
>;

export interface DuplicateMatch<T extends MatchableCustomerFields = Customer> {
  customer: T;
  reasons: string[];
  confidence: DuplicateConfidence;
}

export interface DuplicateDetectionResult<T extends MatchableCustomerFields = Customer> {
  isDuplicate: boolean;
  matches: DuplicateMatch<T>[];
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
export function findPotentialDuplicateClients<T extends MatchableCustomerFields = Customer>(
  candidate: CustomerFormCandidate,
  existing: T[],
  options: FindDuplicatesOptions = {},
): DuplicateDetectionResult<T> {
  const cFirst = normalizeName(candidate.firstName);
  const cLast = normalizeName(candidate.lastName);
  const cFull = normalizeFullName(candidate.firstName, candidate.lastName);
  const cPhone = normalizePhone(candidate.phone);
  const cWa = normalizePhone(candidate.whatsapp);
  const cEmail = normalizeEmail(candidate.email);
  const cDoc = normalizeDocument(candidate.documentNumber);
  const cDob = normalizeDate(candidate.birthDate);

  const matches: DuplicateMatch<T>[] = [];

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
    // El MISMO número puede estar en `teléfono` en un registro y en `whatsapp`
    // en otro (la persona lo escribe en cualquier campo). Comparación CRUZADA,
    // solo si no lo capturó ya un match de mismo campo.
    if (
      !reasons.includes("teléfono") &&
      !reasons.includes("WhatsApp") &&
      ((cPhone && eWa && cPhone === eWa) || (cWa && ePhone && cWa === ePhone))
    ) {
      reasons.push("teléfono/WhatsApp");
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

    // ── Nombre completo exacto → aviso (media): el usuario pidió filtrar por
    // nombre. Es override-able; dos personas con el mismo nombre son posibles,
    // por eso NO es "alta". Solo si no hubo ya un match más fuerte por nombre.
    if (
      cFull && eFull && cFull === eFull &&
      !reasons.some((r) => r.startsWith("nombre"))
    ) {
      reasons.push("nombre y apellido");
      confidence = pickHigher(confidence, MEDIUM);
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
 * Mensaje principal según confianza máxima. Si se pasan `reasons` (los campos
 * que coincidieron del match más fuerte), el mensaje los lista — así el modal
 * dice exactamente por qué (documento, teléfono, WhatsApp, correo, nombre…),
 * no un texto genérico.
 */
export function duplicateMessage(
  confidence: DuplicateConfidence | null,
  reasons?: string[],
): string {
  const by =
    reasons && reasons.length > 0
      ? reasons.join(", ")
      : "documento, teléfono, WhatsApp, correo, nombre o fecha de nacimiento";
  switch (confidence) {
    case "high":
      return `Este cliente ya fue registrado. Coincide por: ${by}.`;
    case "medium":
      return `Existe un cliente similar registrado (coincide por: ${by}). Verifique antes de crear un nuevo perfil.`;
    case "low":
      return `Existe un cliente similar (coincide por: ${by}). Verifique antes de guardar.`;
    default:
      return "";
  }
}

// ─── Escaneo masivo (Unificar clientes) ─────────────────────────────────────

/**
 * Lo mínimo que el escaneo masivo necesita por cliente: los campos que
 * `findPotentialDuplicateClients` compara + `totalOrders` (que usa la
 * pantalla para preseleccionar quién recibe). A propósito NO es `Customer`
 * completo — con 6 500+ clientes, traer las ~25 columnas de la tabla
 * (`select("*")`) ya causó una vez un problema real de rendimiento
 * (`customer.list`, ver `dermaland-panel-lentitud-medida`); este tipo es lo
 * que el caller (la ruta `/api/customers/duplicates`) debe seleccionar de la
 * base, ni una columna más.
 */
export type DuplicateScanCandidate = MatchableCustomerFields &
  Pick<Customer, "totalOrders">;

export interface DuplicatePair {
  a: DuplicateScanCandidate;
  b: DuplicateScanCandidate;
  confidence: DuplicateConfidence;
  reasons: string[];
}

/**
 * Escanea TODA la base entre sí sin O(n²): agrupa en "cubos" por documento
 * normalizado y teléfono/WhatsApp normalizado (mismo cubo para ambos campos,
 * así se detecta el cruce teléfono↔WhatsApp), y dentro de cada cubo (2-5
 * fichas en la práctica) corre `findPotentialDuplicateClients` — mismas
 * reglas de confianza, sin reinventar el criterio.
 *
 * 🔴 A propósito NO hay cubo por nombre ni por email (el diseño aprobado solo
 * pide documento/teléfono/WhatsApp): un duplicado que solo comparta nombre o
 * solo email no aparece aquí, aunque `findPotentialDuplicateClients` sí lo
 * detectaría comparando UN candidato a la vez (como al crear un cliente).
 */
export function scanAllDuplicates(clients: DuplicateScanCandidate[]): DuplicatePair[] {
  const buckets = new Map<string, DuplicateScanCandidate[]>();
  const addToBucket = (key: string, c: DuplicateScanCandidate) => {
    if (!key) return;
    const list = buckets.get(key);
    if (list) list.push(c);
    else buckets.set(key, [c]);
  };

  for (const c of clients) {
    const doc = normalizeDocument(c.documentNumber);
    const phone = normalizePhone(c.phone);
    const wa = normalizePhone(c.whatsapp);
    if (doc) addToBucket(`doc:${doc}`, c);
    if (phone) addToBucket(`phone:${phone}`, c);
    if (wa) addToBucket(`phone:${wa}`, c);
  }

  const seen = new Set<string>();
  const pairs: DuplicatePair[] = [];

  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    for (const candidate of bucket) {
      const input: CustomerFormCandidate = {
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        phone: candidate.phone,
        whatsapp: candidate.whatsapp,
        email: candidate.email,
        documentNumber: candidate.documentNumber,
        birthDate: candidate.birthDate,
        businessId: candidate.businessId,
      };
      const { matches } = findPotentialDuplicateClients<DuplicateScanCandidate>(input, bucket, {
        excludeClientId: candidate.id,
      });
      for (const match of matches) {
        const [idA, idB] = [candidate.id, match.customer.id].sort();
        const key = `${idA}|${idB}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const a = idA === candidate.id ? candidate : match.customer;
        const b = idA === candidate.id ? match.customer : candidate;
        pairs.push({ a, b, confidence: match.confidence, reasons: match.reasons });
      }
    }
  }

  const rank: Record<DuplicateConfidence, number> = { high: 3, medium: 2, low: 1 };
  pairs.sort((x, y) => rank[y.confidence] - rank[x.confidence]);
  return pairs;
}
