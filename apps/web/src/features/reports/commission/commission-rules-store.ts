"use client";

// Store de reglas de comisión EDITABLES.
//
// Fase 2: fuente ÚNICA en Supabase (`sales_commission_rules`) vía
// `/api/commission/rules` cuando `NEXT_PUBLIC_DATA_SOURCE=supabase`; localStorage
// como fallback (modo demo). Se siembra con `DEFAULT_COMMISSION_RULES` la primera
// vez (server-side en supabase, en `read()` en local).
//
// Las funciones PURAS (validate/upsert/remove/toggle) son testeables sin DOM y
// NO cambian — el motor y sus tests dependen de ellas.

import * as React from "react";
import { DEFAULT_COMMISSION_RULES, type CommissionRule } from "./commission-rules";
import { COMMISSION_BACKEND, apiGetList, apiSend } from "./commission-backend";

const KEY = "dermaland.commission-rules";
const CHANGE_EVENT = "dermaland:commission-rules-changed";

export type RuleFormInput = {
  name: string;
  percentage: number;
  paymentGroups?: CommissionRule["paymentGroups"];
  branchId?: string;
  sellerId?: string;
  startsAt?: string;
  endsAt?: string;
  priority: number;
  active: boolean;
};

export type RuleResult =
  | { ok: true; rules: CommissionRule[]; rule: CommissionRule }
  | { ok: false; error: string };

// ─── Lógica PURA (testeable) ─────────────────────────────────────────────────

/** Valida una regla; devuelve el mensaje de error o null si es válida. */
export function validateRule(input: RuleFormInput): string | null {
  if (!input.name?.trim()) return "El nombre de la regla es obligatorio.";
  if (!Number.isFinite(input.percentage) || input.percentage < 0 || input.percentage > 100)
    return "El porcentaje debe estar entre 0 y 100.";
  if (!Number.isFinite(input.priority)) return "La prioridad debe ser un número.";
  if (input.startsAt && input.endsAt && input.startsAt > input.endsAt)
    return "La fecha 'Desde' no puede ser posterior a 'Hasta'.";
  return null;
}

function normalize(input: RuleFormInput, id: string): CommissionRule {
  const groups = input.paymentGroups && input.paymentGroups.length ? input.paymentGroups : undefined;
  return {
    id,
    name: input.name.trim(),
    percentage: input.percentage,
    paymentGroups: groups,
    branchId: input.branchId?.trim() || undefined,
    sellerId: input.sellerId?.trim() || undefined,
    startsAt: input.startsAt?.trim() || undefined,
    endsAt: input.endsAt?.trim() || undefined,
    priority: input.priority,
    active: input.active,
  };
}

export function genRuleId(now = 0, rand = "x"): string {
  return `rule_${now.toString(36)}_${rand}`;
}

/** Inserta o actualiza una regla en un arreglo (puro). */
export function upsertRule(
  rules: CommissionRule[],
  mode: "create" | "edit",
  input: RuleFormInput,
  id: string,
): RuleResult {
  const err = validateRule(input);
  if (err) return { ok: false, error: err };
  if (mode === "create") {
    const rule = normalize(input, id);
    return { ok: true, rules: [...rules, rule], rule };
  }
  const ix = rules.findIndex((r) => r.id === id);
  if (ix < 0) return { ok: false, error: "Regla no encontrada." };
  const rule = normalize(input, id);
  const next = [...rules];
  next[ix] = rule;
  return { ok: true, rules: next, rule };
}

export function removeRule(rules: CommissionRule[], id: string): CommissionRule[] {
  return rules.filter((r) => r.id !== id);
}

export function toggleRuleIn(rules: CommissionRule[], id: string): CommissionRule[] {
  return rules.map((r) => (r.id === id ? { ...r, active: !r.active } : r));
}

// ─── Persistencia (localStorage) ─────────────────────────────────────────────

function read(): CommissionRule[] {
  if (typeof window === "undefined") return DEFAULT_COMMISSION_RULES;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_COMMISSION_RULES;
    const parsed = JSON.parse(raw) as CommissionRule[];
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_COMMISSION_RULES;
  } catch {
    return DEFAULT_COMMISSION_RULES;
  }
}

function write(rules: CommissionRule[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(rules));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function listCommissionRules(): CommissionRule[] {
  return read();
}

function newId(): string {
  return genRuleId(Date.now(), Math.random().toString(36).slice(2, 6));
}

/** Convierte el input del formulario al payload camelCase del API. */
function toRulePayload(input: RuleFormInput) {
  const groups = input.paymentGroups && input.paymentGroups.length ? input.paymentGroups : undefined;
  return {
    name: input.name.trim(),
    percentage: input.percentage,
    paymentGroups: groups,
    branchId: input.branchId?.trim() || undefined,
    sellerId: input.sellerId?.trim() || undefined,
    startsAt: input.startsAt?.trim() || undefined,
    endsAt: input.endsAt?.trim() || undefined,
    priority: input.priority,
    active: input.active,
  };
}

/** Notifica a los hooks que las reglas cambiaron (refetch supabase / relee local). */
function notify(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export async function saveCommissionRule(
  mode: "create" | "edit",
  input: RuleFormInput,
  id?: string,
): Promise<RuleResult> {
  const err = validateRule(input);
  if (err) return { ok: false, error: err };
  if (COMMISSION_BACKEND === "supabase") {
    const res =
      mode === "create"
        ? await apiSend<CommissionRule>("POST", "rules", toRulePayload(input), "rule")
        : await apiSend<CommissionRule>("PATCH", `rules/${id}`, toRulePayload(input), "rule");
    if (!res.ok) return { ok: false, error: res.error };
    notify();
    // `rules` no lo consumen los callers; el hook refetch-ea la lista completa.
    return { ok: true, rules: [], rule: res.item! };
  }
  const res = upsertRule(read(), mode, input, mode === "create" ? newId() : id ?? "");
  if (res.ok) write(res.rules);
  return res;
}

export async function deleteCommissionRule(id: string): Promise<{ ok: boolean; error?: string }> {
  if (COMMISSION_BACKEND === "supabase") {
    const res = await apiSend("DELETE", `rules/${id}`);
    if (res.ok) notify();
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }
  write(removeRule(read(), id));
  return { ok: true };
}

export async function toggleCommissionRule(id: string): Promise<{ ok: boolean; error?: string }> {
  if (COMMISSION_BACKEND === "supabase") {
    const res = await apiSend("PATCH", `rules/${id}`, { toggle: true });
    if (res.ok) notify();
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }
  write(toggleRuleIn(read(), id));
  return { ok: true };
}

/** Restablece las reglas al catálogo por defecto (Excel de referencia). */
export async function resetCommissionRules(): Promise<{ ok: boolean; error?: string }> {
  if (COMMISSION_BACKEND === "supabase") {
    const res = await apiSend("PUT", "rules");
    if (res.ok) notify();
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }
  write(DEFAULT_COMMISSION_RULES);
  return { ok: true };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Reglas de comisión vigentes. Primer render (y SSR) devuelven las por defecto
 * (hidratación estable). Tras montar: en supabase se traen del API; en local se
 * lee localStorage.
 */
export function useCommissionRules(): CommissionRule[] {
  const [rules, setRules] = React.useState<CommissionRule[]>(DEFAULT_COMMISSION_RULES);
  React.useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (COMMISSION_BACKEND === "supabase") {
        apiGetList<CommissionRule>("rules", "rules")
          .then((r) => { if (alive) setRules(r); })
          .catch(() => { if (alive) setRules(read()); });
      } else {
        setRules(read());
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
  return rules;
}
