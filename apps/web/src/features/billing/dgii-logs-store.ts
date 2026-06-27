"use client";

import * as React from "react";
import { mockBusiness } from "@/lib/mock-data/tenancy";

/**
 * Logs / historial DGII — MVP (localStorage).
 *
 * Bitácora de acciones del flujo e-CF (generar XML, firmar, enviar, consultar,
 * etc.). En mock/demo todas las entradas son sintéticas: ninguna acción
 * contactó a DGII ni consumió secuencia fiscal real.
 *
 * Producción: mapea a la tabla `dgii_logs` (migración 0014) con RLS por
 * `business_id`.
 */

export type DgiiLogAction =
  | "generar_xml"
  | "firmar"
  | "enviar_dgii"
  | "consultar_estado"
  | "generar_qr"
  | "generar_ri"
  | "enviar_receptor"
  | "guardar_acuse"
  | "anular";

export type DgiiLogStatus = "ok" | "pendiente" | "rechazado" | "error" | "info";

export interface DgiiLogEntry {
  id: string;
  businessId: string;
  invoiceId?: string;
  ecfNumber?: string;
  action: DgiiLogAction;
  environment: string;
  status: DgiiLogStatus;
  message: string;
  /** true: la entrada es demo (no tocó DGII real). */
  isMock: boolean;
  createdAt: string;
}

export const DGII_LOG_ACTION_LABEL: Record<DgiiLogAction, string> = {
  generar_xml: "Generar XML",
  firmar: "Firmar",
  enviar_dgii: "Enviar a DGII",
  consultar_estado: "Consultar estado",
  generar_qr: "Generar QR",
  generar_ri: "Generar representación impresa",
  enviar_receptor: "Enviar al receptor",
  guardar_acuse: "Guardar acuse",
  anular: "Anular",
};

const KEY = "dermaland.dgii-logs";
const CHANGE_EVENT = "dermaland:dgii-logs-changed";
const STAMP = "2026-06-26T14:00:00Z";

function seedEntry(
  id: string,
  action: DgiiLogAction,
  status: DgiiLogStatus,
  message: string,
  ecfNumber: string,
  minutesAgo: number,
): DgiiLogEntry {
  return {
    id: `log_seed_${id}`,
    businessId: mockBusiness.id,
    ecfNumber,
    action,
    environment: "mock",
    status,
    message,
    isMock: true,
    createdAt: new Date(new Date(STAMP).getTime() - minutesAgo * 60000).toISOString(),
  };
}

const seed: DgiiLogEntry[] = [
  seedEntry("1", "generar_xml", "ok", "XML generado (demo) para e-CF 32.", "E320000000095", 30),
  seedEntry("2", "firmar", "ok", "Firma DEMO con certificado dummy.", "E320000000095", 29),
  seedEntry("3", "enviar_dgii", "info", "Envío SIMULADO — no se contactó DGII.", "E320000000095", 28),
  seedEntry("4", "consultar_estado", "ok", "DGII (mock) aceptó el comprobante. TrackID DEMO-E320000000095.", "E320000000095", 27),
  seedEntry("5", "generar_ri", "ok", "Representación impresa generada (demo).", "E320000000095", 26),
];

function read(): DgiiLogEntry[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DgiiLogEntry[]) : null;
  } catch {
    return null;
  }
}

function write(list: DgiiLogEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function listDgiiLogs(): DgiiLogEntry[] {
  return (read() ?? seed)
    .slice()
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export type AppendLogInput = Omit<
  DgiiLogEntry,
  "id" | "businessId" | "createdAt" | "isMock"
> & { isMock?: boolean };

export function appendDgiiLog(input: AppendLogInput): DgiiLogEntry {
  const current = read() ?? seed;
  const entry: DgiiLogEntry = {
    ...input,
    id: `log_${Date.now().toString(36)}_${current.length}`,
    businessId: mockBusiness.id,
    isMock: input.isMock ?? true,
    createdAt: new Date().toISOString(),
  };
  write([entry, ...current]);
  return entry;
}

/** Registra de un solo golpe la traza de un flujo simulado. */
export function appendSimulatedFlowLogs(
  ecfNumber: string,
  environment: string,
  steps: ReadonlyArray<{ action: DgiiLogAction; status: DgiiLogStatus; message: string }>,
): void {
  const current = read() ?? seed;
  const base = Date.now();
  const entries: DgiiLogEntry[] = steps.map((s, i) => ({
    id: `log_${base.toString(36)}_${i}`,
    businessId: mockBusiness.id,
    ecfNumber,
    action: s.action,
    environment,
    status: s.status,
    message: s.message,
    isMock: true,
    createdAt: new Date(base + i).toISOString(),
  }));
  write([...entries.reverse(), ...current]);
}

export function clearDgiiLogs(): void {
  write([...seed]);
}

export function useDgiiLogs(): DgiiLogEntry[] {
  const [list, setList] = React.useState<DgiiLogEntry[]>([]);
  React.useEffect(() => {
    const refresh = () => setList(listDgiiLogs());
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
