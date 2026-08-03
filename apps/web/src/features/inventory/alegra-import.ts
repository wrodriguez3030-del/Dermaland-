/**
 * Motor PURO del importador de inventario de Alegra (sin React, sin I/O).
 *
 * Reglas de negocio (única fuente de verdad):
 *   stock_principal = columna "Cantidad en Principal"
 *   stock_cutis     = columna "Cantidad total" − "Cantidad en Principal"
 *
 * Alegra desglosa solo el almacén "Principal"; el resto del total vive en el
 * otro almacén, que en DermaLand es Dermaland Cutis (confirmado por el dueño
 * 2026-08-01). La resta se valida: nunca puede dar negativo.
 */

/** Unidades que se pegan al número al normalizar ("30 ML" → "30ML"). */
const UNITS =
  "ML|MG|GR|G|KG|L|CC|OZ|UI|CAPS|CAP|TABLETAS|TABLETA|TABS|TAB|COMP|SOBRES|SOBRE|UND|UD|EN";

/**
 * Normaliza un nombre de producto para comparar entre Alegra y DermaLand:
 * mayúsculas, sin acentos, sin signos, unidad pegada al número, SPF pegado.
 * Misma normalización que `scripts/import-stock-principal-from-alegra.mjs`.
 */
export function normalizeProductName(raw: string): string {
  let s = String(raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  s = s.replace(/[^A-Z0-9+%.\s]/g, " ").replace(/\s+/g, " ").trim();
  s = s
    .replace(new RegExp(`(\\d)\\s+(${UNITS})\\b`, "g"), "$1$2")
    .replace(/SPF\s+(\d)/g, "SPF$1");
  return s.replace(/\s+/g, " ").trim();
}

/** Alias de cabecera aceptados para cada campo del export de Alegra. */
export const ALEGRA_HEADERS = {
  name: ["Producto/servicio", "Nombre"],
  qtyPrincipal: ["Cantidad en Principal"],
  qtyTotal: ["Cantidad total"],
} as const;

function headerKey(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ubica las columnas por el TEXTO de la cabecera, no por posición: así acepta
 * tanto el export completo (nombre en B, cantidad en E) como los recortados.
 * Devuelve índices 0-based.
 */
export function resolveColumns(header: string[]): {
  name: number;
  qtyPrincipal: number;
  qtyTotal: number;
} {
  const keys = header.map(headerKey);
  const find = (aliases: readonly string[], label: string): number => {
    const wanted = aliases.map(headerKey);
    const idx = keys.findIndex((h) => h && wanted.includes(h));
    if (idx === -1) {
      throw new Error(
        `El archivo no trae la columna "${label}". Columnas encontradas: ${header
          .filter(Boolean)
          .join(" · ")}`,
      );
    }
    return idx;
  };
  return {
    name: find(ALEGRA_HEADERS.name, "Producto/servicio"),
    qtyPrincipal: find(ALEGRA_HEADERS.qtyPrincipal, "Cantidad en Principal"),
    qtyTotal: find(ALEGRA_HEADERS.qtyTotal, "Cantidad total"),
  };
}

export interface AlegraRow {
  rowNumber: number;
  name: string;
  qtyPrincipal: number;
  qtyTotal: number;
}

export interface AlegraTargets {
  rowNumber: number;
  name: string;
  principal: number;
  cutis: number;
}

export interface AlegraRowError {
  rowNumber: number;
  name: string;
  error: string;
}

/** Calcula el objetivo por sucursal de UNA fila, o el motivo por el que se omite. */
export function rowTargets(row: AlegraRow): AlegraTargets | AlegraRowError {
  const { rowNumber, name, qtyPrincipal, qtyTotal } = row;
  if (!Number.isFinite(qtyPrincipal) || !Number.isFinite(qtyTotal)) {
    return { rowNumber, name, error: "La cantidad no es un número." };
  }
  if (qtyPrincipal < 0 || qtyTotal < 0) {
    return { rowNumber, name, error: "Cantidad negativa en el archivo." };
  }
  if (qtyTotal < qtyPrincipal) {
    return {
      rowNumber,
      name,
      error: "La cantidad total es menor que la de Principal; la diferencia daría negativo.",
    };
  }
  return { rowNumber, name, principal: qtyPrincipal, cutis: qtyTotal - qtyPrincipal };
}

export interface PlanProduct {
  id: string;
  name: string;
}

export interface PlanLot {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  /** ISO `YYYY-MM-DD`. */
  expiresAt: string;
  /** ISO. Para elegir el lote más reciente al SUBIR stock. */
  receivedAt: string;
  lotNumber: string;
}

export interface LotChange {
  lotId: string;
  lotNumber: string;
  warehouseId: string;
  from: number;
  to: number;
}

export interface BranchAdjustment {
  productId: string;
  productName: string;
  current: number;
  target: number;
  delta: number;
  lotChanges: LotChange[];
  /** Solo cuando hay que CREAR stock donde no existe ningún lote. */
  newLot?: { expiresAt: string; quantity: number; warehouseId: string };
}

export interface ImportPlan {
  principal: BranchAdjustment[];
  cutis: BranchAdjustment[];
  skipped: AlegraRowError[];
  unmatched: Array<{ rowNumber: number; name: string; principal: number; cutis: number }>;
  collisions: Array<{ productName: string; rows: number[] }>;
  totals: {
    principalBefore: number;
    principalAfter: number;
    cutisBefore: number;
    cutisAfter: number;
  };
}

function sumQty(lots: PlanLot[]): number {
  return lots.reduce((acc, l) => acc + l.quantity, 0);
}

/**
 * Calcula cómo repartir un delta dentro de los lotes existentes de un producto.
 *  - delta < 0 → consume por FEFO (primero el que vence antes).
 *  - delta > 0 → suma al lote recibido más recientemente.
 */
function distribute(lots: PlanLot[], delta: number): LotChange[] {
  if (delta === 0 || lots.length === 0) return [];
  if (delta > 0) {
    // `lots.length === 0` ya se descartó arriba: el sort siempre deja un [0].
    const newest = [...lots].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0]!;
    return [
      {
        lotId: newest.id,
        lotNumber: newest.lotNumber,
        warehouseId: newest.warehouseId,
        from: newest.quantity,
        to: newest.quantity + delta,
      },
    ];
  }
  let pending = -delta;
  const changes: LotChange[] = [];
  const fefo = lots
    .filter((l) => l.quantity > 0)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  for (const lot of fefo) {
    if (pending <= 0) break;
    const take = Math.min(pending, lot.quantity);
    changes.push({
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      warehouseId: lot.warehouseId,
      from: lot.quantity,
      to: lot.quantity - take,
    });
    pending -= take;
  }
  return changes;
}

/**
 * Arma el plan completo de ajuste para las dos sucursales.
 *
 * `products`, `principalLots` y `cutisLots` los provee el SERVIDOR leyendo la
 * base; `rows` viene del archivo. Nada del archivo decide a qué negocio o
 * sucursal se escribe.
 *
 * `today` (ISO `YYYY-MM-DD`) lo calcula el LLAMADOR (server), no este módulo:
 * el motor sigue siendo puro y no puede usar `new Date()` internamente, o los
 * tests quedarían atados al reloj del sistema.
 */
export function buildImportPlan(input: {
  rows: AlegraRow[];
  products: PlanProduct[];
  principalLots: PlanLot[];
  cutisLots: PlanLot[];
  cutisWarehouseId: string;
  zeroMissing: boolean;
  today: string;
}): ImportPlan {
  const { rows, products, principalLots, cutisLots, cutisWarehouseId, zeroMissing, today } = input;

  const byName = new Map<string, PlanProduct[]>();
  for (const p of products) {
    const key = normalizeProductName(p.name);
    const list = byName.get(key);
    if (list) list.push(p);
    else byName.set(key, [p]);
  }

  const lotsOf = (lots: PlanLot[]): Map<string, PlanLot[]> => {
    const m = new Map<string, PlanLot[]>();
    for (const l of lots) {
      const list = m.get(l.productId);
      if (list) list.push(l);
      else m.set(l.productId, [l]);
    }
    return m;
  };
  const prinByProduct = lotsOf(principalLots);
  const cutisByProduct = lotsOf(cutisLots);

  const skipped: AlegraRowError[] = [];
  const unmatched: ImportPlan["unmatched"] = [];
  const targets = new Map<
    string,
    { product: PlanProduct; principal: number; cutis: number; rows: number[] }
  >();

  for (const row of rows) {
    const t = rowTargets(row);
    if ("error" in t) {
      skipped.push(t);
      continue;
    }
    const hits = byName.get(normalizeProductName(row.name)) ?? [];
    if (hits.length !== 1) {
      unmatched.push({
        rowNumber: t.rowNumber,
        name: row.name,
        principal: t.principal,
        cutis: t.cutis,
      });
      continue;
    }
    // `hits.length !== 1` ya se descartó arriba: queda exactamente un match.
    const product = hits[0]!;
    const acc = targets.get(product.id);
    if (acc) {
      acc.principal += t.principal;
      acc.cutis += t.cutis;
      acc.rows.push(t.rowNumber);
    } else {
      targets.set(product.id, {
        product,
        principal: t.principal,
        cutis: t.cutis,
        rows: [t.rowNumber],
      });
    }
  }

  const collisions = [...targets.values()]
    .filter((t) => t.rows.length > 1)
    .map((t) => ({ productName: t.product.name, rows: t.rows }));

  if (zeroMissing) {
    for (const p of products) {
      if (!targets.has(p.id)) {
        targets.set(p.id, { product: p, principal: 0, cutis: 0, rows: [] });
      }
    }
  }

  const principal: BranchAdjustment[] = [];
  const cutis: BranchAdjustment[] = [];

  for (const t of targets.values()) {
    const prinLots = prinByProduct.get(t.product.id) ?? [];
    const prinCurrent = sumQty(prinLots);
    const prinDelta = t.principal - prinCurrent;
    if (prinDelta !== 0) {
      if (prinLots.length === 0) {
        skipped.push({
          rowNumber: t.rows[0] ?? 0,
          name: t.product.name,
          error:
            "No tiene lote en Principal, así que no hay vencimiento del cual heredar. Recíbelo manualmente.",
        });
      } else {
        principal.push({
          productId: t.product.id,
          productName: t.product.name,
          current: prinCurrent,
          target: t.principal,
          delta: prinDelta,
          lotChanges: distribute(prinLots, prinDelta),
        });
      }
    }

    const cLots = cutisByProduct.get(t.product.id) ?? [];
    const cCurrent = sumQty(cLots);
    const cDelta = t.cutis - cCurrent;
    if (cDelta !== 0) {
      if (cLots.length > 0) {
        cutis.push({
          productId: t.product.id,
          productName: t.product.name,
          current: cCurrent,
          target: t.cutis,
          delta: cDelta,
          lotChanges: distribute(cLots, cDelta),
        });
      } else {
        // Hay que CREAR el lote en Cutis: hereda el vencimiento de Principal.
        // Prioridad del donante:
        //  1. Entre los lotes CON existencias (quantity > 0), el que vence antes
        //     (mismo criterio FEFO que `distribute`; nunca un lote agotado si hay
        //     uno con stock real del cual heredar).
        //  2. Si todos están agotados, el recibido más recientemente.
        const withStock = prinLots.filter((l) => l.quantity > 0);
        const donor =
          withStock.length > 0
            ? [...withStock].sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))[0]
            : [...prinLots].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
        if (!donor) {
          skipped.push({
            rowNumber: t.rows[0] ?? 0,
            name: t.product.name,
            error:
              "Necesita stock en Cutis pero no tiene lote en Principal del cual heredar el vencimiento.",
          });
        } else if (donor.expiresAt.localeCompare(today) < 0) {
          // No crear inventario que nace vencido (el sistema lo bloquearía
          // para venta de inmediato): se reporta para revisión manual.
          skipped.push({
            rowNumber: t.rows[0] ?? 0,
            name: t.product.name,
            error:
              "Necesita stock en Cutis, pero el único vencimiento disponible en Principal ya está vencido. Revisa el vencimiento a mano antes de recibirlo.",
          });
        } else {
          cutis.push({
            productId: t.product.id,
            productName: t.product.name,
            current: 0,
            target: t.cutis,
            delta: cDelta,
            lotChanges: [],
            newLot: { expiresAt: donor.expiresAt, quantity: t.cutis, warehouseId: cutisWarehouseId },
          });
        }
      }
    }
  }

  const principalBefore = sumQty(principalLots);
  const cutisBefore = sumQty(cutisLots);
  return {
    principal,
    cutis,
    skipped,
    unmatched,
    collisions,
    totals: {
      principalBefore,
      principalAfter: principalBefore + principal.reduce((a, x) => a + x.delta, 0),
      cutisBefore,
      cutisAfter: cutisBefore + cutis.reduce((a, x) => a + x.delta, 0),
    },
  };
}

/**
 * Con `zeroMissing: true`, el barrido pone en 0 (en las dos sucursales) todo
 * producto del catálogo que NO quedó en `targets` — es decir, que el motor
 * interpreta como "ausente del archivo". Pero una fila SÍ presente en el
 * archivo cuyo nombre no empareja con exactamente un producto (`unmatched`)
 * o que se descartó por un dato inválido (`skipped`) TAMPOCO llega a
 * `targets`, así que el barrido la trata igual que si no viniera en el
 * archivo — y le borra el stock a un producto que el archivo declara CON
 * existencias. Con nombres libres (~1355 productos), `unmatched` casi nunca
 * está vacío, así que `zeroMissing` nunca es seguro sin revisar antes estas
 * dos listas.
 *
 * Devuelve el mensaje de riesgo (para rechazar la operación) o `null` si es
 * seguro aplicar el barrido.
 */
export function zeroMissingRiskMessage(plan: ImportPlan): string | null {
  const { unmatched, skipped } = plan;
  if (unmatched.length === 0 && skipped.length === 0) return null;

  const detalles: string[] = [];
  if (unmatched.length > 0) {
    detalles.push(
      `${unmatched.length} fila(s) del archivo no se pudieron emparejar con un único producto del catálogo ("No emparejados")`,
    );
  }
  if (skipped.length > 0) {
    detalles.push(
      `${skipped.length} fila(s) se omitieron por un dato inválido ("Omitidos")`,
    );
  }

  return (
    `No se puede usar "Poner en 0 lo que falta" todavía: ${detalles.join(" y ")}. ` +
    `Esos productos SÍ tienen existencias declaradas en el archivo de Alegra; si continúas, el sistema los ` +
    `interpretaría como ausentes y les pondría el stock en 0 por error, en las dos sucursales. ` +
    `Revisa esas filas, corrige el nombre del producto en DermaLand o en el archivo (o desactívalo si ya no ` +
    `se vende), y vuelve a intentar.`
  );
}
