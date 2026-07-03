"use client";

import * as React from "react";
import { mockBusiness } from "@/lib/mock-data/tenancy";

/**
 * Numeraciones de comprobantes — MVP (localStorage).
 *
 * Administra las numeraciones que el negocio usa para emitir comprobantes:
 * proforma, consumo (B02), crédito fiscal (B01), e-CF 31/32/33/34, etc.
 *
 * IMPORTANTE: este módulo NO llama a la DGII. Las numeraciones electrónicas en
 * ambientes testecf/certecf/produccion requieren postulación + certificado +
 * rango autorizado; aquí sólo se preparan y se controla el consumo. Los
 * ambientes mock/demo nunca consumen secuencia fiscal real.
 *
 * Producción: mapea a la tabla `invoice_numberings` (migración 0011) con RLS
 * por business_id; la reserva de número usa una función atómica en BD.
 *
 * ⚠️ LIMITACIÓN CONOCIDA (multi-dispositivo): esta reserva vive en
 * localStorage — es POR NAVEGADOR. Dos cajas en máquinas distintas parten
 * del mismo seed y pueden emitir el MISMO número. La reserva atómica en
 * servidor YA EXISTE: función `reserve_ecf_sequence_number` (mig 0003) +
 * `POST /api/dgii/sequences/reserve`. PENDIENTE: cablear el POS
 * (`finalizeCharge`) a ese endpoint cuando DATA_SOURCE=supabase y dejar
 * este store solo como demo/mock.
 */

export type DocType =
  | "proforma"
  | "consumo"
  | "credito_fiscal"
  | "nota_credito"
  | "nota_debito"
  | "gubernamental"
  | "exportacion"
  | "regimen_especial"
  | "ecf_31"
  | "ecf_32"
  | "ecf_33"
  | "ecf_34";

export type Environment = "mock" | "demo" | "testecf" | "certecf" | "produccion";
export type StoredStatus = "active" | "inactive";
export type EffectiveStatus = "active" | "inactive" | "exhausted" | "expired";

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  proforma: "Proforma",
  consumo: "Factura de consumo",
  credito_fiscal: "Crédito fiscal",
  nota_credito: "Nota de crédito",
  nota_debito: "Nota de débito",
  gubernamental: "Gubernamental",
  exportacion: "Exportación",
  regimen_especial: "Régimen especial",
  ecf_31: "e-CF 31 · Crédito fiscal",
  ecf_32: "e-CF 32 · Consumo",
  ecf_33: "e-CF 33 · Nota de débito",
  ecf_34: "e-CF 34 · Nota de crédito",
};

export interface Numbering {
  id: string;
  businessId: string;
  branchId?: string;
  name: string;
  documentType: DocType;
  prefix: string;
  rangeStart: number;
  rangeEnd: number;
  nextNumber: number;
  startDate?: string;
  endDate?: string;
  environment: Environment;
  isElectronic: boolean;
  isPreferred: boolean;
  status: StoredStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

const KEY = "dermaland.numberings";
const CHANGE_EVENT = "dermaland:numberings-changed";
const STAMP = "2026-06-17T12:00:00Z";

const seed: Numbering[] = [
  num("PROF", "Proformas", "proforma", "PROF", 1, 999999, 186, "mock", false, true),
  num("B02", "Factura de consumo (B02)", "consumo", "B02", 1, 50000, 1240, "mock", false, true),
  num("B01", "Crédito fiscal (B01)", "credito_fiscal", "B01", 1, 20000, 320, "mock", false, true),
  num("E32", "e-CF Consumo (32)", "ecf_32", "E32", 1, 100000, 95, "testecf", true, true),
  num("E31", "e-CF Crédito fiscal (31)", "ecf_31", "E31", 1, 50000, 40, "testecf", true, true),
  num("E34", "e-CF Nota de crédito (34)", "ecf_34", "E34", 1, 10000, 5, "testecf", true, false),
];

function num(
  id: string,
  name: string,
  documentType: DocType,
  prefix: string,
  rangeStart: number,
  rangeEnd: number,
  nextNumber: number,
  environment: Environment,
  isElectronic: boolean,
  isPreferred: boolean,
): Numbering {
  return {
    id: `seq_${id}`,
    businessId: mockBusiness.id,
    name,
    documentType,
    prefix,
    rangeStart,
    rangeEnd,
    nextNumber,
    environment,
    isElectronic,
    isPreferred,
    status: "active",
    endDate: "2027-12-31",
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

// ─── Persistencia ─────────────────────────────────────────────────────────────

function read(): Numbering[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Numbering[]) : null;
  } catch {
    return null;
  }
}
function write(list: Numbering[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function listNumberings(): Numbering[] {
  return read() ?? seed;
}
export function getNumbering(id: string): Numbering | undefined {
  return listNumberings().find((n) => n.id === id);
}

// ─── Estado efectivo / métricas ───────────────────────────────────────────────

export function remaining(n: Numbering): number {
  return Math.max(0, n.rangeEnd - n.nextNumber + 1);
}
export function isExpired(n: Numbering, ref: Date = new Date()): boolean {
  return !!n.endDate && new Date(n.endDate).getTime() < ref.getTime();
}
export function effectiveStatus(
  n: Numbering,
  ref: Date = new Date(),
): EffectiveStatus {
  if (n.status === "inactive") return "inactive";
  if (n.nextNumber > n.rangeEnd) return "exhausted";
  if (isExpired(n, ref)) return "expired";
  return "active";
}
/** ≤ 100 números restantes y aún activa. */
export function isLowRange(n: Numbering): boolean {
  return effectiveStatus(n) === "active" && remaining(n) <= 100;
}
export function canEmit(n: Numbering, ref: Date = new Date()): boolean {
  return effectiveStatus(n, ref) === "active";
}

export function formatNumber(n: Numbering, value: number): string {
  if (n.documentType === "proforma") {
    return `${n.prefix}-${new Date(STAMP).getFullYear()}-${String(value).padStart(6, "0")}`;
  }
  return `${n.prefix}${String(value).padStart(8, "0")}`;
}

// ─── Validación ───────────────────────────────────────────────────────────────

export type NumberingInput = Omit<
  Numbering,
  "id" | "businessId" | "createdAt" | "updatedAt"
>;

export function validateNumbering(
  input: Partial<NumberingInput>,
  all: Numbering[],
  selfId?: string,
): string | null {
  if (!input.name?.trim()) return "El nombre es obligatorio.";
  if (!input.documentType) return "El tipo de documento es obligatorio.";
  if (!input.prefix?.trim()) return "El prefijo es obligatorio.";
  if (input.rangeStart == null || input.rangeStart < 0)
    return "El rango inicial es obligatorio.";
  if (input.rangeEnd == null) return "El rango final es obligatorio.";
  if (input.rangeEnd < input.rangeStart)
    return "El rango final debe ser mayor o igual al rango inicial.";
  if (input.nextNumber == null) return "El siguiente número es obligatorio.";
  if (input.nextNumber < input.rangeStart || input.nextNumber > input.rangeEnd + 1)
    return "El siguiente número debe estar dentro del rango.";

  // Prefijo + tipo + ambiente únicos por negocio.
  const dup = all.some(
    (n) =>
      n.id !== selfId &&
      n.prefix.toUpperCase() === input.prefix!.toUpperCase() &&
      n.documentType === input.documentType &&
      n.environment === input.environment,
  );
  if (dup)
    return "Ya existe una numeración con el mismo prefijo, tipo y ambiente.";

  // Una sola preferida activa por tipo + ambiente.
  if (input.isPreferred && input.status === "active") {
    const otherPreferred = all.some(
      (n) =>
        n.id !== selfId &&
        n.documentType === input.documentType &&
        n.environment === input.environment &&
        n.isPreferred &&
        n.status === "active",
    );
    if (otherPreferred)
      return "Ya hay una numeración preferida activa para este tipo y ambiente.";
  }
  return null;
}

// ─── Mutaciones ───────────────────────────────────────────────────────────────

export type Result =
  | { ok: true; numbering: Numbering }
  | { ok: false; error: string };

function genId(): string {
  return `seq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createNumbering(input: NumberingInput): Result {
  const all = listNumberings();
  const err = validateNumbering(input, all);
  if (err) return { ok: false, error: err };
  const now = new Date().toISOString();
  const numbering: Numbering = {
    ...input,
    id: genId(),
    businessId: mockBusiness.id,
    prefix: input.prefix.trim().toUpperCase(),
    name: input.name.trim(),
    createdAt: now,
    updatedAt: now,
  };
  write([numbering, ...all]);
  return { ok: true, numbering };
}

export function updateNumbering(id: string, patch: Partial<NumberingInput>): Result {
  const all = listNumberings();
  const current = all.find((n) => n.id === id);
  if (!current) return { ok: false, error: "Numeración no encontrada." };
  const merged = { ...current, ...patch };
  const err = validateNumbering(merged, all, id);
  if (err) return { ok: false, error: err };
  const next: Numbering = {
    ...merged,
    prefix: merged.prefix.trim().toUpperCase(),
    name: merged.name.trim(),
    updatedAt: new Date().toISOString(),
  };
  write(all.map((n) => (n.id === id ? next : n)));
  return { ok: true, numbering: next };
}

export function setNumberingActive(id: string, active: boolean): Result {
  return updateNumbering(id, { status: active ? "active" : "inactive" });
}

export function setPreferred(id: string): Result {
  const all = listNumberings();
  const target = all.find((n) => n.id === id);
  if (!target) return { ok: false, error: "Numeración no encontrada." };
  // Quitar preferida de las demás del mismo tipo+ambiente y marcar esta.
  const now = new Date().toISOString();
  write(
    all.map((n) => {
      if (n.id === id) return { ...n, isPreferred: true, updatedAt: now };
      if (
        n.documentType === target.documentType &&
        n.environment === target.environment &&
        n.isPreferred
      )
        return { ...n, isPreferred: false, updatedAt: now };
      return n;
    }),
  );
  return { ok: true, numbering: { ...target, isPreferred: true } };
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

/** Elimina sólo si NO ha sido usada (nextNumber sigue en el inicio). */
export function deleteNumbering(id: string): DeleteResult {
  const all = listNumberings();
  const n = all.find((x) => x.id === id);
  if (!n) return { ok: false, error: "Numeración no encontrada." };
  if (n.nextNumber > n.rangeStart) {
    return {
      ok: false,
      error:
        "No se puede eliminar: la numeración ya fue usada. Puedes inactivarla.",
    };
  }
  write(all.filter((x) => x.id !== id));
  return { ok: true };
}

// ─── Reserva de número ────────────────────────────────────────────────────────

export type ReserveResult =
  | { ok: true; numbering: Numbering; value: number; formatted: string }
  | { ok: false; error: string };

/**
 * Reserva el siguiente número de la numeración PREFERIDA y activa para el tipo
 * de documento + ambiente. Incrementa `nextNumber` de forma atómica (una sola
 * escritura) y respeta rango, estado y vencimiento. NO llama a DGII.
 */
export function reserveNext(
  documentType: DocType,
  environment: Environment,
): ReserveResult {
  const all = listNumberings();
  const candidates = all.filter(
    (n) => n.documentType === documentType && n.environment === environment,
  );
  if (candidates.length === 0) {
    return {
      ok: false,
      error: "No hay numeración configurada para este tipo de documento.",
    };
  }
  const usable = candidates
    .filter((n) => canEmit(n))
    .sort((a, b) => Number(b.isPreferred) - Number(a.isPreferred));
  const n = usable[0];
  if (!n) {
    return {
      ok: false,
      error:
        "No hay una numeración activa, vigente y con rango disponible para emitir.",
    };
  }
  const value = n.nextNumber;
  const updated = all.map((x) =>
    x.id === n.id
      ? { ...x, nextNumber: x.nextNumber + 1, updatedAt: new Date().toISOString() }
      : x,
  );
  write(updated);
  return { ok: true, numbering: n, value, formatted: formatNumber(n, value) };
}

/**
 * Reserva el siguiente número para un tipo de comprobante, eligiendo la
 * numeración ACTIVA preferida en un ambiente NO productivo (mock/demo/testecf/
 * certecf), prefiriendo el ambiente indicado. Tolerante a desajustes de
 * ambiente (demo vs mock) para no bloquear la facturación en mock/demo.
 *
 * NUNCA reserva de una numeración en ambiente `produccion` (DGII real apagado).
 * Mensajes claros: "No hay numeración activa…" / "La numeración se agotó.".
 */
export function reserveNextPreferred(
  documentType: DocType,
  preferredEnv: Environment,
): ReserveResult {
  const all = listNumberings();
  const typed = all.filter((n) => n.documentType === documentType);
  if (typed.length === 0) {
    return {
      ok: false,
      error: "No hay numeración activa para este tipo de comprobante.",
    };
  }
  const emittable = typed.filter(
    (n) => n.environment !== "produccion" && canEmit(n),
  );
  if (emittable.length === 0) {
    const exhausted = typed.some(
      (n) => n.status === "active" && effectiveStatus(n) === "exhausted",
    );
    return {
      ok: false,
      error: exhausted
        ? "La numeración se agotó."
        : "No hay numeración activa para este tipo de comprobante.",
    };
  }
  const sorted = emittable.sort((a, b) => {
    const envA = a.environment === preferredEnv ? 0 : 1;
    const envB = b.environment === preferredEnv ? 0 : 1;
    if (envA !== envB) return envA - envB;
    return Number(b.isPreferred) - Number(a.isPreferred);
  });
  const n = sorted[0]!;
  const value = n.nextNumber;
  write(
    all.map((x) =>
      x.id === n.id
        ? { ...x, nextNumber: x.nextNumber + 1, updatedAt: new Date().toISOString() }
        : x,
    ),
  );
  return { ok: true, numbering: n, value, formatted: formatNumber(n, value) };
}

export function clearLocalNumberings() {
  write([...seed]);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNumberings(): Numbering[] {
  const [list, setList] = React.useState<Numbering[]>(() => listNumberings());
  React.useEffect(() => {
    const refresh = () => setList(listNumberings());
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return list;
}
