"use client";

// Bitácora de precios MANUALES (override) de un producto. Registra quién fijó un
// precio distinto del sugerido, el precio sugerido vs el manual, el margen real
// resultante y el motivo. Persistencia cliente (localStorage) mientras no exista
// tabla de auditoría dedicada en Supabase; la API es estable para migrarla luego
// a servidor (tabla `product_price_overrides`) sin tocar los llamadores.
//
// Mismo patrón que `laboratory-audit.ts`.

export interface PriceOverrideAudit {
  id: string;
  productId: string;
  /** SKU legible para leer la bitácora sin cruzar ids. */
  sku?: string;
  /** Precio sugerido por costo+ITBIS+margen en el momento del override. */
  suggestedPrice: number;
  /** Precio manual que fijó el usuario. */
  manualPrice: number;
  /** Margen real (%) que implica el precio manual (null si base 0). */
  realMarginPercent: number | null;
  userName: string;
  reason: string;
  createdAt: string;
}

const KEY = "dermaland.price-override-audit";

function read(): PriceOverrideAudit[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PriceOverrideAudit[]) : [];
  } catch {
    return [];
  }
}

function write(list: PriceOverrideAudit[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function recordPriceOverride(input: {
  productId: string;
  sku?: string;
  suggestedPrice: number;
  manualPrice: number;
  realMarginPercent: number | null;
  userName?: string;
  reason?: string;
}): PriceOverrideAudit {
  const entry: PriceOverrideAudit = {
    id: `pov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    productId: input.productId,
    sku: input.sku,
    suggestedPrice: input.suggestedPrice,
    manualPrice: input.manualPrice,
    realMarginPercent: input.realMarginPercent,
    userName: input.userName || "Administrador",
    reason: input.reason || "Precio manual (override)",
    createdAt: new Date().toISOString(),
  };
  write([entry, ...read()]);
  return entry;
}

export function readPriceOverrideAudit(productId?: string): PriceOverrideAudit[] {
  const all = read();
  return productId ? all.filter((a) => a.productId === productId) : all;
}
