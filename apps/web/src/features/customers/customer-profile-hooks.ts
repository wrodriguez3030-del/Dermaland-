"use client";

import * as React from "react";
import type { Customer, Proforma } from "@/types";
import {
  CUSTOMER_BACKEND,
  CUSTOMERS_CHANGE_EVENT,
  getCustomerByIdFromStore,
  listAllCustomers,
} from "./customer-store";
import {
  PROFORMAS_CHANGE_EVENT,
  listAllProformas,
} from "@/features/sales/proforma-store";
import {
  purchasesForCustomer,
  computeCustomerPurchaseStats,
  collectConvertedSourceIds,
  type CustomerPurchaseStats,
} from "./customer-purchases";
import {
  computeCustomersReport,
  filterSalesForPeriod,
  type CustomerMetricsRow,
  type SalesPeriodFilter,
} from "./customer-metrics";

/**
 * Hooks de datos del módulo de Clientes — perfil y reporte.
 *
 * Estados EXPLÍCITOS (loading / success / notFound / error): la UI nunca debe
 * tratar "cargando" como "no encontrado" (causa del falso "Cliente no
 * encontrado" al abrir un perfil en modo supabase).
 *
 * Rendimiento: en modo supabase el perfil pide SOLO su cliente
 * (`/api/customers/[id]`) y SOLO sus compras (`/api/customers/[id]/purchases`)
 * en paralelo — nunca descarga todos los clientes ni todas las ventas del
 * negocio. El reporte usa `/api/customers/metrics` (agregado en servidor,
 * cabeceras sin ítems/pagos, misma capa de cálculo del perfil).
 *
 * Invalidación: los hooks se re-sincronizan al emitirse los eventos de
 * cambio de clientes y de ventas (nueva venta, edición, anulación,
 * devolución) y ante `storage` (otras pestañas) — perfil y reporte nunca
 * quedan con cachés divergentes.
 */

const FRIENDLY_LOAD_ERROR =
  "No pudimos cargar la información del cliente. Intenta nuevamente.";

async function fetchJson<T>(url: string): Promise<{ status: number; body: T }> {
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

// ─── Perfil ──────────────────────────────────────────────────────────────────

export interface CustomerProfileState {
  customer: Customer | undefined;
  purchases: Proforma[];
  stats: CustomerPurchaseStats;
  /** true mientras la consulta inicial (o un retry) está en curso. */
  loading: boolean;
  /** Consulta terminada sin error y el cliente NO existe. */
  notFound: boolean;
  /** Error de red/servidor (mensaje amigable, nunca técnico). */
  error: string | null;
  retry: () => void;
}

const EMPTY_STATS: CustomerPurchaseStats = {
  totalSpent: 0,
  purchases: 0,
  avgTicket: 0,
  lastVisitAt: null,
  pendingProformas: 0,
};

export function useCustomerProfile(
  id: string | null | undefined,
): CustomerProfileState {
  const [state, setState] = React.useState<{
    customer: Customer | undefined;
    purchases: Proforma[];
    loading: boolean;
    notFound: boolean;
    error: string | null;
  }>({
    customer: undefined,
    purchases: [],
    loading: Boolean(id),
    notFound: false,
    error: null,
  });
  const [retryTick, setRetryTick] = React.useState(0);

  React.useEffect(() => {
    if (!id) {
      setState({
        customer: undefined,
        purchases: [],
        loading: false,
        notFound: true,
        error: null,
      });
      return;
    }
    let alive = true;

    const loadLocal = () => {
      const customer = getCustomerByIdFromStore(id);
      const purchases = customer
        ? purchasesForCustomer(listAllProformas(), customer)
        : [];
      setState({
        customer,
        purchases,
        loading: false,
        notFound: !customer,
        error: null,
      });
    };

    const loadServer = async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) {
        setState((s) => ({ ...s, loading: true, error: null }));
      }
      try {
        const [cRes, pRes] = await Promise.all([
          fetchJson<{ customer?: Customer; error?: string }>(
            `/api/customers/${id}`,
          ),
          fetchJson<{ purchases?: Proforma[]; error?: string }>(
            `/api/customers/${id}/purchases`,
          ),
        ]);
        if (!alive) return;
        if (cRes.status === 404) {
          setState({
            customer: undefined,
            purchases: [],
            loading: false,
            notFound: true,
            error: null,
          });
          return;
        }
        if (cRes.status !== 200 || !cRes.body.customer) {
          setState((s) => ({
            ...s,
            loading: false,
            notFound: false,
            error: cRes.body.error ?? FRIENDLY_LOAD_ERROR,
          }));
          return;
        }
        setState({
          customer: cRes.body.customer,
          purchases: pRes.status === 200 ? (pRes.body.purchases ?? []) : [],
          loading: false,
          notFound: false,
          error: null,
        });
      } catch {
        if (!alive) return;
        setState((s) => ({
          ...s,
          loading: false,
          notFound: false,
          error: FRIENDLY_LOAD_ERROR,
        }));
      }
    };

    const load = () =>
      CUSTOMER_BACKEND === "supabase" ? void loadServer() : loadLocal();
    // Refresh silencioso tras mutaciones: no vuelve a mostrar skeleton.
    const refresh = () =>
      CUSTOMER_BACKEND === "supabase"
        ? void loadServer({ silent: true })
        : loadLocal();

    load();
    window.addEventListener(CUSTOMERS_CHANGE_EVENT, refresh);
    window.addEventListener(PROFORMAS_CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      alive = false;
      window.removeEventListener(CUSTOMERS_CHANGE_EVENT, refresh);
      window.removeEventListener(PROFORMAS_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [id, retryTick]);

  const stats = React.useMemo(
    () =>
      state.purchases.length > 0
        ? computeCustomerPurchaseStats(
            state.purchases,
            collectConvertedSourceIds(state.purchases),
          )
        : EMPTY_STATS,
    [state.purchases],
  );

  const retry = React.useCallback(() => setRetryTick((t) => t + 1), []);

  return { ...state, stats, retry };
}

// ─── Reporte / listado ───────────────────────────────────────────────────────

export interface CustomersReportState {
  rows: CustomerMetricsRow[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useCustomersReport(
  filter?: SalesPeriodFilter,
): CustomersReportState {
  const [rows, setRows] = React.useState<CustomerMetricsRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retryTick, setRetryTick] = React.useState(0);
  const { from, to, branchId } = filter ?? {};

  React.useEffect(() => {
    let alive = true;

    const loadLocal = () => {
      const computed = computeCustomersReport(
        listAllCustomers(),
        filterSalesForPeriod(listAllProformas(), { from, to, branchId }),
      );
      setRows(computed);
      setLoading(false);
      setError(null);
    };

    const loadServer = async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const params = new URLSearchParams();
        if (branchId) params.set("branchId", branchId);
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const qs = params.toString();
        const { status, body } = await fetchJson<{
          rows?: CustomerMetricsRow[];
          error?: string;
        }>(`/api/customers/metrics${qs ? `?${qs}` : ""}`);
        if (!alive) return;
        if (status !== 200 || !body.rows) {
          setLoading(false);
          setError(
            body.error ??
              "No pudimos cargar el reporte de clientes. Intenta nuevamente.",
          );
          return;
        }
        setRows(body.rows);
        setLoading(false);
        setError(null);
      } catch {
        if (!alive) return;
        setLoading(false);
        setError(
          "No pudimos cargar el reporte de clientes. Intenta nuevamente.",
        );
      }
    };

    const load = () =>
      CUSTOMER_BACKEND === "supabase" ? void loadServer() : loadLocal();
    const refresh = () =>
      CUSTOMER_BACKEND === "supabase"
        ? void loadServer({ silent: true })
        : loadLocal();

    load();
    window.addEventListener(CUSTOMERS_CHANGE_EVENT, refresh);
    window.addEventListener(PROFORMAS_CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      alive = false;
      window.removeEventListener(CUSTOMERS_CHANGE_EVENT, refresh);
      window.removeEventListener(PROFORMAS_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [from, to, branchId, retryTick]);

  const retry = React.useCallback(() => setRetryTick((t) => t + 1), []);

  return { rows, loading, error, retry };
}
