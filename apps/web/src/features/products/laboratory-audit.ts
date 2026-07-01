"use client";

// Bitácora de cambios de laboratorio de un producto. Registra quién cambió el
// laboratorio, de cuál a cuál y por qué. Persistencia cliente (localStorage)
// mientras no exista tabla de auditoría dedicada en Supabase; la API es estable
// para migrarla luego a servidor sin tocar los llamadores.

export interface LabChangeAudit {
  id: string;
  productId: string;
  oldLaboratoryId: string;
  newLaboratoryId: string;
  userName: string;
  reason: string;
  createdAt: string;
}

const KEY = "dermaland.laboratory-audit";

function read(): LabChangeAudit[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LabChangeAudit[]) : [];
  } catch {
    return [];
  }
}

function write(list: LabChangeAudit[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function recordLabChange(input: {
  productId: string;
  oldLaboratoryId: string;
  newLaboratoryId: string;
  userName?: string;
  reason?: string;
}): LabChangeAudit {
  const entry: LabChangeAudit = {
    id: `lca_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    productId: input.productId,
    oldLaboratoryId: input.oldLaboratoryId,
    newLaboratoryId: input.newLaboratoryId,
    userName: input.userName || "Administrador",
    reason: input.reason || "Cambio de laboratorio del producto",
    createdAt: new Date().toISOString(),
  };
  write([entry, ...read()]);
  return entry;
}

export function readLabAudit(productId?: string): LabChangeAudit[] {
  const all = read();
  return productId ? all.filter((a) => a.productId === productId) : all;
}
