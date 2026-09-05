/**
 * Ítem de Alegra → borrador de producto. PURO.
 *
 * `products.price` es CON ITBIS y Alegra da la lista «General» SIN ITBIS, así
 * que hay que sumarlo — pero SOLO el impuesto que ese ítem tenga. En Alegra
 * cada ítem trae su propio `tax`: hay gravados al 18 %, con 0 % y sin impuesto
 * ninguno (`tax: []`), y estos últimos ya vienen con su precio final.
 * Verificado el 2026-09-05: Elta MD UV Sport (ITBIS 18 %) 1779.661 × 1.18 =
 * 2100 = su precio en DermaLand; Aquaphor (`tax: []`) 800 = 800. Aplicar 18 %
 * a todos inflaba el precio de 273 productos.
 *
 * El código de barras vive en el campo personalizado «Código de barras»
 * (`key: "barcode"`), no en `reference`.
 */
import { normalizeProductName } from "@/features/inventory/alegra-import";
import { parseProductName } from "@/lib/import/product-parser";
import type { AlegraItem } from "./types";

export interface ItemDraft {
  alegraId: string;
  alegraName: string;
  displayName: string;
  cost: number;
  /** CON ITBIS, listo para `products.price`. */
  price: number;
  /** Porcentaje entero (18, 16, 0) tal como lo guarda `products.itbis_rate`. */
  itbisRate: number;
  active: boolean;
  barcode: string | null;
  unit: "unidad";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Impuesto del ítem en Alegra, en porcentaje entero. Sin impuesto → 0. */
export function itbisRateOf(item: Pick<AlegraItem, "tax">): number {
  const total = (item.tax ?? []).reduce((a, t) => a + (Number(t.percentage) || 0), 0);
  return Number.isFinite(total) ? total : 0;
}

export function barcodeOf(item: AlegraItem): string | null {
  const field = (item.customFields ?? []).find(
    (c) => c.key === "barcode" || /c[oó]digo de barras/i.test(c.name ?? ""),
  );
  const value = (field?.value ?? "").trim();
  return value ? value : null;
}

/**
 * Nombre «bonito» (Title Case del parser del catálogo) SOLO si sigue
 * emparejando con el de Alegra por nombre normalizado; si no, el crudo.
 */
export function displayNameFor(alegraName: string): string {
  const limpio = parseProductName(alegraName).name;
  return normalizeProductName(limpio) === normalizeProductName(alegraName) ? limpio : alegraName;
}

export function itemToDraft(item: AlegraItem, itbisRateOverride?: number): ItemDraft {
  const itbisRate = itbisRateOverride ?? itbisRateOf(item);
  const listas = item.price ?? [];
  const lista = listas.find((p) => p.main) ?? listas[0];
  const sinItbis = Number(lista?.price ?? 0);
  const cost = round2(Number(item.inventory?.unitCost ?? 0));
  const alegraName = item.name.trim();
  return {
    alegraId: String(item.id),
    alegraName,
    displayName: displayNameFor(alegraName),
    cost: Number.isFinite(cost) ? cost : 0,
    price: Number.isFinite(sinItbis) && sinItbis > 0 ? round2(sinItbis * (1 + itbisRate / 100)) : 0,
    itbisRate,
    active: item.status !== "inactive",
    barcode: barcodeOf(item),
    unit: "unidad",
  };
}
