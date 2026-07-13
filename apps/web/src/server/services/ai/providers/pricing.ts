import "server-only";
import type { AIUsage } from "./types";

/**
 * Precios de referencia por 1K tokens (USD). Aproximados y configurables; sirven
 * para ESTIMAR costo, no para facturar. Si un modelo no está aquí, el costo
 * estimado es `null` (desconocido) y la UI lo muestra como "—".
 */
export const OPENAI_PRICING: Record<string, { in: number; out: number }> = {
  // Línea actual (developers.openai.com/api/docs/pricing, jul-2026)
  "gpt-5.6-sol": { in: 0.005, out: 0.03 },
  "gpt-5.6-terra": { in: 0.0025, out: 0.015 },
  "gpt-5.6-luna": { in: 0.001, out: 0.006 },
  "gpt-5.5": { in: 0.005, out: 0.03 },
  "gpt-5.4": { in: 0.0025, out: 0.015 },
  "gpt-5.4-mini": { in: 0.00075, out: 0.0045 },
  "gpt-5.4-nano": { in: 0.0002, out: 0.00125 },
  // Legacy (para estimar logs históricos)
  "gpt-4o": { in: 0.0025, out: 0.01 },
  "gpt-4o-mini": { in: 0.00015, out: 0.0006 },
  "gpt-4.1": { in: 0.002, out: 0.008 },
  "gpt-4.1-mini": { in: 0.0004, out: 0.0016 },
  "gpt-4.1-nano": { in: 0.0001, out: 0.0004 },
  "o3-mini": { in: 0.0011, out: 0.0044 },
  "o4-mini": { in: 0.0011, out: 0.0044 },
};

/** Estima el costo USD de un uso; `null` si el modelo no tiene precio conocido. */
export function estimateCost(usage: AIUsage, model: string): number | null {
  const p = OPENAI_PRICING[model];
  if (!p) return null;
  const cost = (usage.inputTokens / 1000) * p.in + (usage.outputTokens / 1000) * p.out;
  return Math.round(cost * 1e6) / 1e6;
}
