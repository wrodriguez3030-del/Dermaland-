"use client";

import * as React from "react";
import type {
  IncentiveRule,
  IncentiveRuleType,
} from "./incentive-engine";

/**
 * Capa de datos de incentivos.
 *  - supabase → /api/incentives/* (RLS por business).
 *  - mock     → localStorage (demo).
 */

export const INCENTIVE_BACKEND: "local" | "supabase" =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase"
    ? "supabase"
    : "local";

export const RULE_TYPE_LABEL: Record<IncentiveRuleType, string> = {
  fixed_per_product: "Monto fijo por producto",
  percent_on_sale: "% sobre la venta",
  percent_on_margin: "% sobre el margen",
  per_laboratory: "Por laboratorio",
  per_category: "Por categoría",
  per_goal: "Por meta alcanzada",
};

export interface IncentiveRuleRecord extends IncentiveRule {
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// Estados canónicos únicos (mig 0024). Se conserva 'void' legacy = 'voided'.
export type IncentiveStatus =
  | "pending"
  | "approved"
  | "paid"
  | "adjusted"
  | "voided"
  | "void";

export const STATUS_LABEL: Record<IncentiveStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  paid: "Pagado",
  adjusted: "Ajustado",
  voided: "Anulado",
  void: "Anulado",
};

export interface IncentiveRecord {
  id: string;
  saleId: string;
  saleNumber?: string;
  saleCashier?: string;
  saleCustomer?: string;
  saleBranchId?: string;
  sellerId: string | null;
  sellerName: string | null;
  ruleId: string | null;
  ruleName: string | null;
  ruleType: string | null;
  productId: string | null;
  baseAmount: number;
  incentiveAmount: number;
  /** Ajuste (negativo) por devolución/anulación de una comisión ya pagada. */
  adjustmentAmount?: number;
  status: IncentiveStatus;
  earnedAt: string;
  paidAt: string | null;
  paymentBatchId: string | null;
}

const RULES_KEY = "dermaland.incentive_rules";
const CHANGE_EVENT = "dermaland:incentives-changed";

function notify() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

// ─── localStorage (mock) ─────────────────────────────────────────────────────

function readLocalRules(): IncentiveRuleRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RULES_KEY);
    return raw ? (JSON.parse(raw) as IncentiveRuleRecord[]) : [];
  } catch {
    return [];
  }
}
function writeLocalRules(list: IncentiveRuleRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RULES_KEY, JSON.stringify(list));
  notify();
}

// ─── API helpers ─────────────────────────────────────────────────────────────

export type RuleResult =
  | { ok: true; rule?: IncentiveRuleRecord }
  | { ok: false; error: string };

async function api(
  path: string,
  method: string,
  body?: unknown,
): Promise<RuleResult> {
  try {
    const res = await fetch(path, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as {
      rule?: IncentiveRuleRecord;
      error?: string;
    };
    if (!res.ok)
      return { ok: false, error: data.error ?? "No se pudo completar la operación." };
    notify();
    return { ok: true, rule: data.rule };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." };
  }
}

// ─── Reglas ──────────────────────────────────────────────────────────────────

export function useIncentiveRules(): {
  rules: IncentiveRuleRecord[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [rules, setRules] = React.useState<IncentiveRuleRecord[]>(() =>
    INCENTIVE_BACKEND === "supabase" ? [] : readLocalRules(),
  );
  const [loading, setLoading] = React.useState(INCENTIVE_BACKEND === "supabase");
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    if (INCENTIVE_BACKEND === "supabase") {
      fetch("/api/incentives/rules")
        .then(async (res) => {
          const data = (await res.json().catch(() => ({}))) as {
            rules?: IncentiveRuleRecord[];
            error?: string;
          };
          if (!res.ok) throw new Error(data.error);
          setRules(data.rules ?? []);
          setError(null);
        })
        .catch(() => setError("No se pudieron cargar las reglas de incentivos."))
        .finally(() => setLoading(false));
    } else {
      setRules(readLocalRules());
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return { rules, loading, error, refresh };
}

export async function saveIncentiveRule(
  input: Partial<IncentiveRuleRecord>,
  id?: string,
): Promise<RuleResult> {
  if (INCENTIVE_BACKEND === "supabase") {
    return id
      ? api(`/api/incentives/rules/${id}`, "PATCH", input)
      : api("/api/incentives/rules", "POST", input);
  }
  const list = readLocalRules();
  if (id) {
    const next = list.map((r) => (r.id === id ? { ...r, ...input, id } : r));
    writeLocalRules(next as IncentiveRuleRecord[]);
    return { ok: true };
  }
  const rule: IncentiveRuleRecord = {
    id: `rule_${Date.now().toString(36)}`,
    name: input.name ?? "Regla",
    ruleType: (input.ruleType as IncentiveRuleType) ?? "percent_on_sale",
    productId: input.productId ?? null,
    laboratoryId: input.laboratoryId ?? null,
    categoryId: input.categoryId ?? null,
    percentage: input.percentage ?? null,
    fixedAmount: input.fixedAmount ?? null,
    minSalesAmount: input.minSalesAmount ?? null,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    active: input.active ?? true,
    note: input.note ?? null,
  };
  writeLocalRules([...list, rule]);
  return { ok: true, rule };
}

export async function deleteIncentiveRule(id: string): Promise<RuleResult> {
  if (INCENTIVE_BACKEND === "supabase") {
    return api(`/api/incentives/rules/${id}`, "DELETE");
  }
  writeLocalRules(readLocalRules().filter((r) => r.id !== id));
  return { ok: true };
}

// ─── Incentivos generados ────────────────────────────────────────────────────

export interface IncentiveFilters {
  sellerId?: string;
  status?: IncentiveStatus | "all";
  from?: string;
  to?: string;
}

export function useIncentives(filters: IncentiveFilters = {}): {
  incentives: IncentiveRecord[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [incentives, setIncentives] = React.useState<IncentiveRecord[]>([]);
  const [loading, setLoading] = React.useState(INCENTIVE_BACKEND === "supabase");
  const [error, setError] = React.useState<string | null>(null);
  const key = JSON.stringify(filters);

  const refresh = React.useCallback(() => {
    if (INCENTIVE_BACKEND !== "supabase") {
      setIncentives([]);
      setLoading(false);
      return;
    }
    const qs = new URLSearchParams();
    if (filters.sellerId) qs.set("sellerId", filters.sellerId);
    if (filters.status && filters.status !== "all") qs.set("status", filters.status);
    if (filters.from) qs.set("from", filters.from);
    if (filters.to) qs.set("to", filters.to);
    fetch(`/api/incentives?${qs.toString()}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          incentives?: IncentiveRecord[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error);
        setIncentives(data.incentives ?? []);
        setError(null);
      })
      .catch(() => setError("No se pudieron cargar los incentivos."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  React.useEffect(() => {
    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => window.removeEventListener(CHANGE_EVENT, refresh);
  }, [refresh]);

  return { incentives, loading, error, refresh };
}

/** Dispara la generación de incentivos de una venta (fire-and-forget). */
export async function generateIncentivesForSale(saleId: string): Promise<void> {
  if (INCENTIVE_BACKEND !== "supabase") return;
  try {
    await fetch("/api/incentives/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saleId }),
    });
    notify();
  } catch {
    /* best-effort: no bloquea la venta */
  }
}

/** Marca incentivos como pagados en un lote. */
export async function payIncentives(
  ids: string[],
): Promise<{ ok: boolean; error?: string; batchId?: string }> {
  if (INCENTIVE_BACKEND !== "supabase") return { ok: true };
  try {
    const res = await fetch("/api/incentives/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      batchId?: string;
    };
    if (!res.ok) return { ok: false, error: data.error ?? "No se pudo pagar." };
    notify();
    return { ok: true, batchId: data.batchId };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." };
  }
}
