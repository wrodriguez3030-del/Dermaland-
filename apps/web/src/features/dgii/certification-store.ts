"use client";

import * as React from "react";

/**
 * Store de evidencias de pre-certificación DGII (mock).
 *
 * Persiste localmente en `dermaland.dgii-certification-evidences` los
 * resultados de ejecutar el pipeline `/api/dgii/certificacion/run-test`.
 *
 * NO persiste el XML/PDF completos (serían demasiado pesados para
 * localStorage). Guarda solo metadatos suficientes para que el panel
 * `/dgii/certificacion` muestre estado y permita re-ejecutar la prueba
 * si se necesita el artefacto.
 *
 * Producción (Fase futura): reemplazar por tablas
 * `dgii_certification_runs` + `dgii_certification_artifacts` en Supabase.
 */

export type TipoCertificable = "31" | "32" | "33" | "34";

/** Estados que un test de pre-certificación puede alcanzar localmente. */
export type CertificationStatus =
  | "pendiente"
  | "generado"
  | "validado_xsd"
  | "firmado"
  | "pdf_generado"
  | "evidencia_lista";

export interface CertificationEvidence {
  /** Tipo e-CF probado. Un solo registro por tipo (el último run). */
  tipoEcf: TipoCertificable;
  eNcf: string;
  /** Códigos de seguridad calculados del XML firmado. */
  securityCode: string;
  qrUrl: string;
  runBy: string;
  runAt: string;
  status: CertificationStatus;
  /** Marca explícita: este registro es mock — el XML no se envió a DGII. */
  isMock: true;
  /** Nota: el XML firmado se descarga on-demand, no se persiste aquí. */
  note?: string;
}

const STORAGE_KEY = "dermaland.dgii-certification-evidences";
const CHANGE_EVENT = "dermaland:dgii-certification-changed";

function readLocal(): CertificationEvidence[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CertificationEvidence[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: CertificationEvidence[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/** Sustituye (no acumula) el registro del tipo dado. */
export function upsertEvidence(record: CertificationEvidence): void {
  const list = readLocal().filter((e) => e.tipoEcf !== record.tipoEcf);
  writeLocal([record, ...list]);
}

export function setEvidenceStatus(
  tipo: TipoCertificable,
  status: CertificationStatus,
): void {
  const list = readLocal();
  const idx = list.findIndex((e) => e.tipoEcf === tipo);
  if (idx === -1) return;
  list[idx] = { ...list[idx]!, status };
  writeLocal(list);
}

export function clearEvidence(tipo: TipoCertificable): void {
  writeLocal(readLocal().filter((e) => e.tipoEcf !== tipo));
}

export function listEvidences(): CertificationEvidence[] {
  return readLocal();
}

export function getEvidenceFor(
  tipo: TipoCertificable,
): CertificationEvidence | undefined {
  return readLocal().find((e) => e.tipoEcf === tipo);
}

export function useEvidences(): CertificationEvidence[] {
  const [list, setList] = React.useState<CertificationEvidence[]>([]);
  React.useEffect(() => {
    const refresh = () => setList(listEvidences());
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
