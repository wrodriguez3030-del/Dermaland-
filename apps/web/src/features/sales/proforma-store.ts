"use client";

import * as React from "react";
import type { Proforma } from "@/types";
import { mockProformas } from "@/lib/mock-data/sales";

/**
 * Store de proformas — MVP.
 *
 * Combina las proformas seed (`mockProformas`) con las emitidas desde el POS,
 * persistidas en `localStorage` bajo la key `dermaland.proformas`.
 *
 * Al emitir desde el POS se llama `addProforma(...)` con los datos completos
 * para que la ruta imprimible `/proformas/[id]/print` pueda renderizar el
 * ticket sin volver a consultar otras fuentes.
 *
 * Producción: reemplazar por repositorio Supabase con tabla `proformas` +
 * trigger que actualiza `business_usage_counters` y `cash_register_sessions`.
 */

const STORAGE_KEY = "dermaland.proformas";
const CHANGE_EVENT = "dermaland:proformas-changed";

function readLocal(): Proforma[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Proforma[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: Proforma[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function listAllProformas(): Proforma[] {
  // Las locales arriba (más recientes), después los seeds.
  const local = readLocal().sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  );
  return [...local, ...mockProformas];
}

export function getProformaByIdFromStore(id: string): Proforma | undefined {
  return listAllProformas().find((p) => p.id === id);
}

export function addProforma(proforma: Proforma): void {
  const list = readLocal();
  writeLocal([proforma, ...list]);
}

export function clearLocalProformas(): void {
  writeLocal([]);
}

export function generateProformaNumber(): string {
  // Convención: PROF-{año}-{secuencia 5 dígitos basada en timestamp}
  const year = new Date().getFullYear();
  const seq = String(Math.floor(Date.now() / 1000) % 100000).padStart(5, "0");
  return `PROF-${year}-${seq}`;
}

export function generateProformaId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `prof_${ts}_${rand}`;
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useProformas(): Proforma[] {
  // Hidratación segura: inicial = sólo `mockProformas` (lo que el servidor
  // también ve sin `window`). El merge con localStorage ocurre dentro de
  // useEffect; así SSR y primer render cliente coinciden y no hay
  // "Hydration failed" cuando hay proformas emitidas localmente.
  const [list, setList] = React.useState<Proforma[]>(mockProformas);
  React.useEffect(() => {
    const refresh = () => setList(listAllProformas());
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

export function useProforma(id: string | null | undefined): Proforma | undefined {
  const list = useProformas();
  if (!id) return undefined;
  return list.find((p) => p.id === id);
}
