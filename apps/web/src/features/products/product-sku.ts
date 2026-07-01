// Generación de SKU secuencial de producto (puro, sin React ni DOM).
//
// Formato: DERM-000001, DERM-000002, … (prefijo + número con ceros a 6 dígitos).
// El SKU lo asigna el sistema; el usuario NO lo edita. Ignora SKU mal formados
// para el cálculo del máximo, pero nunca los borra.

export const SKU_PREFIX = "DERM";
export const SKU_PADDING = 6;

/** Número de un SKU con formato `DERM-000591` → 591; null si no aplica. */
export function parseSkuNumber(sku: string | null | undefined, prefix = SKU_PREFIX): number | null {
  if (!sku) return null;
  const m = new RegExp(`^${prefix}-(\\d+)$`, "i").exec(sku.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

/** Formatea un número como SKU: 591 → "DERM-000591". */
export function formatSku(n: number, prefix = SKU_PREFIX, padding = SKU_PADDING): string {
  return `${prefix}-${String(Math.max(1, Math.floor(n))).padStart(padding, "0")}`;
}

/** Siguiente SKU a partir del SKU máximo conocido (o vacío → DERM-000001). */
export function nextSkuAfter(maxSku: string | null | undefined, prefix = SKU_PREFIX, padding = SKU_PADDING): string {
  const n = parseSkuNumber(maxSku, prefix) ?? 0;
  return formatSku(n + 1, prefix, padding);
}

/** Siguiente SKU a partir de una lista de SKU existentes. */
export function nextSkuFromSkus(skus: Array<string | null | undefined>, prefix = SKU_PREFIX, padding = SKU_PADDING): string {
  let max = 0;
  for (const s of skus) {
    const n = parseSkuNumber(s, prefix);
    if (n != null && n > max) max = n;
  }
  return formatSku(max + 1, prefix, padding);
}
