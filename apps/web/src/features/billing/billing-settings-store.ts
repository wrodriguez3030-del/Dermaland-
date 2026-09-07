"use client";

import * as React from "react";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import type { DefaultBillingType } from "@/types";

/**
 * Configuración de facturación por negocio.
 *
 * 🔴 LA FUENTE DE VERDAD ES LA BASE (`billing_settings`), no el navegador.
 * Hasta el 08/09/2026 esto era «MVP (localStorage)» y era literal: lo que el
 * dueño elegía vivía en un solo Chrome, el servidor no se enteraba, y desde
 * otra computadora volvía a los valores por defecto sin avisar — mientras la
 * pantalla decía «Configuración guardada».
 *
 * `localStorage` se queda como CACHÉ, no como almacén: el punto de venta lee
 * esta configuración de forma síncrona al montar y no puede esperar a la red.
 * Se hidrata desde el servidor en cuanto llega la respuesta.
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
  /** Forma de facturación principal (sistema de numeración). */
  defaultBillingMode: BillingMode;
  /**
   * Tipo de facturación por defecto para CLIENTES nuevos (consumo /
   * crédito fiscal). El formulario de cliente lo usa como valor inicial.
   */
  defaultCustomerBillingType: DefaultBillingType;
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
  defaultCustomerBillingType: "consumo",
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

/**
 * Guarda en el SERVIDOR, que es donde manda.
 *
 * 🔴 Con vuelta atrás: si el servidor rechaza —sin permiso, ambiente inválido,
 * emisión real fuera de producción—, la caché local se restaura al valor
 * anterior. Dejar la pantalla con el valor nuevo sin haberse guardado es peor
 * que no dejar cambiarlo: quien lo hizo se va creyendo que quedó puesto, y esto
 * decide qué comprobante fiscal se emite.
 */
export async function guardarEnServidor(patch: BillingPatch): Promise<SaveResult> {
  const anterior = getBillingSettings();
  const local = saveBillingSettings(patch);
  if (!local.ok) return local;

  try {
    const res = await fetch("/api/billing-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const cuerpo: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      write(anterior);
      const msg =
        cuerpo && typeof cuerpo === "object" && "error" in cuerpo && typeof cuerpo.error === "string"
          ? cuerpo.error
          : "No se pudo guardar la configuración de facturación.";
      return { ok: false, error: msg };
    }
    // Manda lo que devolvió el servidor: si saneó algo, la pantalla lo refleja
    // en vez de enseñar lo que se pidió.
    const devuelto =
      cuerpo && typeof cuerpo === "object" && "settings" in cuerpo ? cuerpo.settings : null;
    if (devuelto && typeof devuelto === "object") {
      const fusion = normalize({ ...anterior, ...(devuelto as Partial<BillingSettings>) });
      write(fusion);
      return { ok: true, settings: fusion };
    }
    return local;
  } catch {
    write(anterior);
    return {
      ok: false,
      error: "No se pudo guardar la configuración: sin conexión con el servidor.",
    };
  }
}

/**
 * Trae la configuración del servidor y actualiza la caché.
 *
 * Se llama al montar la pantalla: hasta que responde, se ve la caché (o los
 * valores por defecto), que es lo que permite al punto de venta arrancar sin
 * esperar. `null` = el negocio aún no tiene fila guardada.
 */
export async function hidratarDesdeServidor(): Promise<BillingSettings | null> {
  try {
    const res = await fetch("/api/billing-settings", { cache: "no-store" });
    if (!res.ok) return null;
    const cuerpo: unknown = await res.json().catch(() => null);
    const devuelto =
      cuerpo && typeof cuerpo === "object" && "settings" in cuerpo ? cuerpo.settings : null;
    if (!devuelto || typeof devuelto !== "object") return null;
    const fusion = normalize({
      ...DEFAULT_BILLING_SETTINGS,
      ...(devuelto as Partial<BillingSettings>),
    });
    write(fusion);
    return fusion;
  } catch {
    // Sin red se sigue con la caché: mejor la última configuración conocida que
    // volver a unos valores por defecto que nadie eligió.
    return null;
  }
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
