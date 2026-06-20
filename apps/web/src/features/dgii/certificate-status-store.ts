"use client";

import * as React from "react";

/**
 * Store mock del estado del certificado digital DGII.
 *
 * Persiste localmente en `dermaland.dgii-certificate-status`. En modo
 * MOCK / DEMO el usuario simula que el certificado se cargó (o no) y
 * el wizard de habilitación lo refleja en el paso 1. NUNCA toca un
 * archivo .p12 real ni una contraseña real.
 *
 * Producción (Fase F): reemplazar por consulta a `dgii_certificates`
 * en Supabase con RLS por business_id. La contraseña real vive en
 * KMS / Vault y nunca se loguea.
 */

export type CertificateStatus =
  | "not_uploaded"
  | "uploaded"
  | "valid"
  | "expired"
  | "invalid";

export interface CertificateMockState {
  status: CertificateStatus;
  /** Alias mostrado al usuario (sin sensitive). */
  alias?: string;
  /** Fecha ISO en que vence el certificado (mock). */
  validTo?: string;
  /** ISO timestamp del último cambio. */
  updatedAt: string;
}

const STORAGE_KEY = "dermaland.dgii-certificate-status";
const CHANGE_EVENT = "dermaland:dgii-certificate-changed";

const DEFAULT_STATE: CertificateMockState = {
  status: "not_uploaded",
  updatedAt: new Date(0).toISOString(),
};

function readLocal(): CertificateMockState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.status === "string") {
      return parsed as CertificateMockState;
    }
    return DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

function writeLocal(state: CertificateMockState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function getCertificateStatus(): CertificateMockState {
  return readLocal();
}

export function setCertificateStatus(
  status: CertificateStatus,
  opts: { alias?: string; validTo?: string } = {},
): void {
  writeLocal({
    status,
    alias: opts.alias,
    validTo: opts.validTo,
    updatedAt: new Date().toISOString(),
  });
}

export function resetCertificateStatus(): void {
  writeLocal({ ...DEFAULT_STATE, updatedAt: new Date().toISOString() });
}

export function useCertificateStatus(): CertificateMockState {
  const [state, setState] =
    React.useState<CertificateMockState>(DEFAULT_STATE);
  React.useEffect(() => {
    const refresh = () => setState(readLocal());
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return state;
}

export const CERTIFICATE_STATUS_LABEL: Record<CertificateStatus, string> = {
  not_uploaded: "Sin cargar",
  uploaded: "Cargado",
  valid: "Válido",
  expired: "Vencido",
  invalid: "Inválido",
};

export const CERTIFICATE_STATUS_TONE: Record<
  CertificateStatus,
  "neutral" | "info" | "success" | "danger" | "warning"
> = {
  not_uploaded: "neutral",
  uploaded: "info",
  valid: "success",
  expired: "danger",
  invalid: "danger",
};
