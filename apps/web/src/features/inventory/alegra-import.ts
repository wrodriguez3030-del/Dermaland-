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
