/**
 * Diferencia catálogo Alegra vs DermaLand. PURO.
 * Emparejado (spec §5.2): alegra_id → nombre normalizado ÚNICO → código de
 * barras (sameBarcode) → crear. Actualiza siempre costo/precio/activo/alegra_id;
 * nombre solo si Alegra lo cambió; código solo si falta (conflicto → reporte).
 * Desactiva (nunca borra) los enlazados que Alegra ya no trae, salvo que salte
 * la guardia anti-vacío (< 50 % de la corrida anterior).
 */
import { normalizeProductName } from "@/features/inventory/alegra-import";
import { sameBarcode } from "@/features/products/barcode-match";
import { itemToDraft, displayNameFor, type ItemDraft } from "./map-item";
import type { AlegraItem } from "./types";

export interface ExistingProduct {
  id: string;
  name: string;
  alegraId: string | null;
  barcode: string | null;
  cost: number;
  price: number;
  itbisRate: number;
  active: boolean;
}

export interface UpdatePatch {
  alegra_id: string;
  cost?: number;
  price?: number;
  itbis_rate?: number;
  active?: boolean;
  name?: string;
  barcode?: string;
}

export type ProductAction =
  | { kind: "create"; draft: ItemDraft }
  | {
      kind: "update";
      productId: string;
      draft: ItemDraft;
      patch: UpdatePatch;
      barcodeConflict?: { stored: string; alegra: string };
    }
  | { kind: "deactivate"; productId: string; name: string };

export interface ProductPlan {
  actions: ProductAction[];
  matchedByName: number;
  priceChanged: number;
  guardTripped: boolean;
}

export const EMPTY_GUARD_RATIO = 0.5;

export function planProducts(
  items: AlegraItem[],
  existing: ExistingProduct[],
  previousCount: number | null,
): ProductPlan {
  const byAlegraId = new Map(existing.filter((e) => e.alegraId).map((e) => [e.alegraId!, e]));
  const libres = existing.filter((e) => !e.alegraId);
  const byName = new Map<string, ExistingProduct[]>();
  for (const e of libres) {
    const k = normalizeProductName(e.name);
    byName.set(k, [...(byName.get(k) ?? []), e]);
  }
  const tomados = new Set<string>();
  const actions: ProductAction[] = [];
  let matchedByName = 0;
  let priceChanged = 0;

  for (const item of items) {
    const draft = itemToDraft(item);
    let e = byAlegraId.get(draft.alegraId);
    if (!e) {
      const hits = (byName.get(normalizeProductName(draft.alegraName)) ?? []).filter((x) => !tomados.has(x.id));
      if (hits.length === 1) {
        e = hits[0];
        matchedByName++;
      }
    }
    if (!e && draft.barcode) {
      const hits = libres.filter((x) => !tomados.has(x.id) && sameBarcode(x.barcode, draft.barcode));
      if (hits.length === 1) e = hits[0];
    }
    if (!e) {
      actions.push({ kind: "create", draft });
      continue;
    }
    tomados.add(e.id);

    const patch: UpdatePatch = { alegra_id: draft.alegraId };
    if (e.cost !== draft.cost) patch.cost = draft.cost;
    if (e.price !== draft.price) {
      patch.price = draft.price;
      priceChanged++;
    }
    if (e.itbisRate !== draft.itbisRate) patch.itbis_rate = draft.itbisRate;
    if (e.active !== draft.active) patch.active = draft.active;
    if (normalizeProductName(e.name) !== normalizeProductName(draft.alegraName)) {
      patch.name = displayNameFor(draft.alegraName);
    }
    let barcodeConflict: { stored: string; alegra: string } | undefined;
    if (draft.barcode) {
      if (!e.barcode) patch.barcode = draft.barcode;
      else if (!sameBarcode(e.barcode, draft.barcode)) barcodeConflict = { stored: e.barcode, alegra: draft.barcode };
    }
    actions.push({
      kind: "update",
      productId: e.id,
      draft,
      patch,
      ...(barcodeConflict ? { barcodeConflict } : {}),
    });
  }

  const guardTripped =
    previousCount !== null && previousCount > 0 && items.length < previousCount * EMPTY_GUARD_RATIO;
  if (!guardTripped) {
    const vistos = new Set(items.map((i) => String(i.id)));
    for (const e of existing) {
      if (e.alegraId && e.active && !vistos.has(e.alegraId)) {
        actions.push({ kind: "deactivate", productId: e.id, name: e.name });
      }
    }
  }
  return { actions, matchedByName, priceChanged, guardTripped };
}
