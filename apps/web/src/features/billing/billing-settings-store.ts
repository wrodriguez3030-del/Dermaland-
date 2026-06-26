"use client";

import * as React from "react";
import { mockBusiness } from "@/lib/mock-data/tenancy";

/**
 * Configuración de facturación por negocio — MVP (localStorage).
 *
 * Esta es la **fuente única** de las reglas automáticas de facturación y, en
 * particular, del porcentaje de e-CF que el cierre de caja aplica a las ventas
 * en efectivo / transferencia. El cajero NUNCA edita estos valores desde el
 * cierre: sólo ADMIN los edita aquí (ver `features/billing/permissions.ts`).
 *
 * IMPORTANTE — DGII real apagado:
 *  - `ecfEnvironment` arranca en `mock`. Los ambientes `testecf` / `certecf` /
 *    `produccion` requieren postulación DGII, certificado y rango autorizado.
 *  - `realEmissionEnabled` arranca en `false` y NUNCA debe activarse sin
 *    autorización explícita. Ningún flujo de este módulo emite comprobantes
 *    fiscales reales; mock/demo no consume secuencia fiscal real.
 *
 * Producción: mapea a la tabla `billing_settings` (migración 0014) con RLS por
 * `business_id`. El cambio de porcentaje queda auditado y NO altera cierres ya
 * realizados (cada cierre guarda su propia copia en `cash_closings.ecf_percentage`).
 */

export type BillingMode = "ncf" | "ecf" | "both";
export type UsageMode = "manual" | "automatic";
export type EcfEnvironment = "mock" | "demo" | "testecf" | "certecf" | "produccion";
export type CashTransferSelectionStrategy = "last" | "first" | "manual";
export type ConsumerEcfType = "E32";
export type RncEcfType = "E31";

export interface BillingSettings {
  businessId: string;
  /** Forma de facturación principal. */
  defaultBillingMode: BillingMode;
  /** Manual: el usuario elige en cada factura. Automatic: reglas. */
  usageMode: UsageMode;
  /** Ambiente e-CF activo. Arranca en mock. */
  ecfEnvironment: EcfEnvironment;
  /** Killswitch de emisión real. Siempre false hasta autorización explícita. */
  realEmissionEnabled: boolean;
  /** Generar e-CF inmediato al cobrar con tarjeta. Default true. */
  cardEcfImmediateEnabled: boolean;
  /** Generar e-CF al cierre para efectivo/transferencia. Default true. */
  cashTransferEcfClosingEnabled: boolean;
  /** % e-CF para ventas efectivo/transferencia en cierre (0..100). Solo ADMIN. */
  cashTransferEcfPercentage: number;
  /** Estrategia de selección de ventas para el cierre. */
  cashTransferSelectionStrategy: CashTransferSelectionStrategy;
  /** Tipo automático para consumidor final. */
  defaultConsumerEcfType: ConsumerEcfType;
  /** Tipo automático para cliente con RNC / crédito fiscal. */
  defaultRncEcfType: RncEcfType;
  createdAt: string;
  updatedAt: string;
}

const STAMP = "2026-06-26T12:00:00Z";

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  businessId: mockBusiness.id,
  defaultBillingMode: "both",
  usageMode: "automatic",
  ecfEnvironment: "mock",
  realEmissionEnabled: false,
  cardEcfImmediateEnabled: true,
  cashTransferEcfClosingEnabled: true,
  cashTransferEcfPercentage: 15,
  cashTransferSelectionStrategy: "last",
  defaultConsumerEcfType: "E32",
  defaultRncEcfType: "E31",
  createdAt: STAMP,
  updatedAt: STAMP,
};

const KEY = "dermaland.billing-settings";
const CHANGE_EVENT = "dermaland:billing-settings-changed";

function read(): BillingSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BillingSettings>;
    // Merge con defaults para tolerar versiones viejas sin campos nuevos.
    return normalize({ ...DEFAULT_BILLING_SETTINGS, ...parsed });
  } catch {
    return null;
  }
}

function write(settings: BillingSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/** Clampea / sanea valores fuera de rango. */
export function normalize(s: BillingSettings): BillingSettings {
  return {
    ...s,
    cashTransferEcfPercentage: clampPercentage(s.cashTransferEcfPercentage),
    // Seguridad: emisión real sólo puede quedar activa en ambiente produccion.
    realEmissionEnabled: s.realEmissionEnabled && s.ecfEnvironment === "produccion",
  };
}

export function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Devuelve la configuración del negocio (o los defaults si no hay nada guardado). */
export function getBillingSettings(): BillingSettings {
  return read() ?? DEFAULT_BILLING_SETTINGS;
}

export type BillingPatch = Partial<
  Omit<BillingSettings, "businessId" | "createdAt" | "updatedAt">
>;

export type SaveResult =
  | { ok: true; settings: BillingSettings }
  | { ok: false; error: string };

/**
 * Persiste cambios. Valida el porcentaje y respeta la regla de seguridad de
 * emisión real (sólo se permite activar en ambiente produccion). NO valida
 * permisos — eso lo hace la UI con `canEditBillingSettings`.
 */
export function saveBillingSettings(patch: BillingPatch): SaveResult {
  const current = getBillingSettings();

  if (patch.cashTransferEcfPercentage != null) {
    const p = patch.cashTransferEcfPercentage;
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      return { ok: false, error: "El porcentaje debe estar entre 0% y 100%." };
    }
  }

  const merged = normalize({
    ...current,
    ...patch,
    businessId: current.businessId,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  });
  write(merged);
  return { ok: true, settings: merged };
}

/** Sólo para tests / reset de demo. */
export function resetBillingSettings(): void {
  write({ ...DEFAULT_BILLING_SETTINGS, updatedAt: new Date().toISOString() });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBillingSettings(): BillingSettings {
  const [settings, setSettings] = React.useState<BillingSettings>(
    () => getBillingSettings(),
  );
  React.useEffect(() => {
    const refresh = () => setSettings(getBillingSettings());
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return settings;
}
