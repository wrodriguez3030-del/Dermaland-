// Matching de laboratorios por nombre/marca del producto (puro, testeable).
//
// Se usa para el backfill: asigna `laboratory_id` a productos que aún no lo
// tienen, según el nombre del producto o su marca. NUNCA sobreescribe un
// laboratorio ya asignado. Sin datos: no rompe.

import type { Laboratory, Product } from "@/types";

export interface LabAlias {
  canonical: string;
  aliases: string[];
}

/** Alias por laboratorio para mejorar el matching (case/acento-insensitive). */
export const LAB_ALIASES: LabAlias[] = [
  { canonical: "ISDIN", aliases: ["isdin"] },
  { canonical: "La Roche-Posay", aliases: ["la roche-posay", "la roche", "roche posay", "roche-posay", "lrp"] },
  { canonical: "Eucerin", aliases: ["eucerin"] },
  { canonical: "Avène", aliases: ["avene", "avène"] },
  { canonical: "Bioderma", aliases: ["bioderma"] },
  { canonical: "CeraVe", aliases: ["cerave", "cera ve"] },
  { canonical: "A-Derma", aliases: ["a-derma", "aderma", "a derma"] },
  { canonical: "Sesderma", aliases: ["sesderma"] },
  { canonical: "Uriage", aliases: ["uriage"] },
  { canonical: "Heliocare", aliases: ["heliocare"] },
  { canonical: "ACM", aliases: ["acm"] },
  { canonical: "Isispharma", aliases: ["isispharma", "isis pharma"] },
  { canonical: "Ducray", aliases: ["ducray"] },
  { canonical: "Vichy", aliases: ["vichy"] },
  { canonical: "Mustela", aliases: ["mustela"] },
  { canonical: "Cetaphil", aliases: ["cetaphil"] },
  { canonical: "Galderma", aliases: ["galderma"] },
  { canonical: "SVR", aliases: ["svr"] },
  { canonical: "Filorga", aliases: ["filorga"] },
  { canonical: "MartiDerm", aliases: ["martiderm", "marti derm"] },
  { canonical: "Neostrata", aliases: ["neostrata", "neo strata"] },
  { canonical: "SkinCeuticals", aliases: ["skinceuticals", "skin ceuticals"] },
];

export function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** ¿`text` contiene `alias` como token (con límite de palabra)? */
function containsAlias(text: string, alias: string): boolean {
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(alias)}([^a-z0-9]|$)`, "i");
  return re.test(text);
}

export interface LabMatch {
  labId: string;
  labName: string;
  reason: string;
}

/**
 * Encuentra el laboratorio de un producto por su marca (prioridad) o nombre.
 * Devuelve el match MÁS específico (alias más largo) para evitar que, p. ej.,
 * "La Roche-Posay" caiga en "Roche". `null` si no hay match confiable.
 */
export function matchProductLaboratory(
  product: Pick<Product, "name" | "brandId">,
  laboratories: Laboratory[],
  brandName?: string,
): LabMatch | null {
  const nameN = normalize(product.name || "");
  const brandN = brandName ? normalize(brandName) : "";

  const state: { best: (LabMatch & { score: number }) | null } = { best: null };
  const consider = (lab: Laboratory, alias: string, viaBrand: boolean) => {
    const score = alias.length + (viaBrand ? 1000 : 0);
    if (!state.best || score > state.best.score) {
      state.best = {
        labId: lab.id,
        labName: lab.name,
        reason: viaBrand ? `marca coincide con «${lab.name}»` : `nombre contiene «${alias}»`,
        score,
      };
    }
  };

  for (const lab of laboratories) {
    const labN = normalize(lab.name);
    const entry = LAB_ALIASES.find((a) => normalize(a.canonical) === labN);
    const aliases = new Set<string>([labN, ...(entry?.aliases.map(normalize) ?? [])]);
    for (const alias of aliases) {
      if (alias.length < 2) continue;
      if (brandN && (brandN === alias || containsAlias(brandN, alias))) consider(lab, alias, true);
      else if (containsAlias(nameN, alias)) consider(lab, alias, false);
    }
  }
  return state.best
    ? { labId: state.best.labId, labName: state.best.labName, reason: state.best.reason }
    : null;
}

// ─── Plan de backfill (para script y tests) ──────────────────────────────────

export interface BackfillAssignment {
  productId: string;
  sku: string;
  name: string;
  labId: string;
  labName: string;
  reason: string;
}
export interface BackfillPending {
  productId: string;
  sku: string;
  name: string;
  brand: string;
}
export interface BackfillPlan {
  assignments: BackfillAssignment[];
  pending: BackfillPending[];
  reviewed: number;
  alreadyAssigned: number;
  assigned: number;
  pendingCount: number;
}

/**
 * Calcula qué productos recibirían laboratorio. Los que YA tienen `laboratoryId`
 * se cuentan como `alreadyAssigned` y NO se tocan. Puro (no escribe nada).
 */
export function planBackfill(
  products: Product[],
  laboratories: Laboratory[],
  brandNameById: Map<string, string> = new Map(),
): BackfillPlan {
  const assignments: BackfillAssignment[] = [];
  const pending: BackfillPending[] = [];
  let alreadyAssigned = 0;

  for (const p of products) {
    if (p.laboratoryId) {
      alreadyAssigned += 1;
      continue; // NO sobreescribir
    }
    const brand = p.brandId ? brandNameById.get(p.brandId) : undefined;
    const m = matchProductLaboratory(p, laboratories, brand);
    if (m) {
      assignments.push({ productId: p.id, sku: p.sku, name: p.name, labId: m.labId, labName: m.labName, reason: m.reason });
    } else {
      pending.push({ productId: p.id, sku: p.sku, name: p.name, brand: brand ?? "" });
    }
  }

  return {
    assignments,
    pending,
    reviewed: products.length,
    alreadyAssigned,
    assigned: assignments.length,
    pendingCount: pending.length,
  };
}
