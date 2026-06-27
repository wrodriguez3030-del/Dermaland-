import { UserFacingRepositoryError } from "./client";

/**
 * Normalizadores de payload antes de insertar en Supabase.
 *
 * Postgres es estricto con los tipos: un UUID mal formado ("usr_cashier_1",
 * "walk-in", ""), un número con formato local ("RD$2,600.00") o una fecha
 * dominicana ("20/06/2027") provocan `invalid input syntax` (22P02) y rompen
 * TODO el guardado de la venta. Estos helpers convierten/validan los valores y,
 * cuando un dato es irrecuperable, lanzan `UserFacingRepositoryError` con un
 * mensaje claro (que la capa de API reenvía tal cual al usuario — nunca el
 * error técnico de Supabase).
 *
 * Nunca loguean secretos: solo transforman valores de negocio.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valores que representan "sin cliente / consumidor final / vacío". */
const EMPTY_UUID_SENTINELS = new Set([
  "",
  "walk-in",
  "walkin",
  "consumidor final",
  "consumidor-final",
  "null",
  "undefined",
]);

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/**
 * UUID opcional: si es vacío / "walk-in" / undefined / no-UUID → `null`.
 * Útil para columnas `uuid` nullable (customer_id, product_id, lot_id) donde un
 * valor de mock o de consumidor final no debe romper el insert.
 */
export function nullableUuid(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (EMPTY_UUID_SENTINELS.has(s.toLowerCase())) return null;
  return isUuid(s) ? s : null;
}

/**
 * UUID obligatorio: devuelve el UUID o lanza un error amigable. Para columnas
 * `uuid not null` (branch_id). `field` aparece en el mensaje al usuario.
 */
export function requireUuid(value: unknown, friendlyField: string): string {
  if (isUuid(value)) return String(value).trim();
  throw new UserFacingRepositoryError(
    `${friendlyField} no es válido. Selecciona una opción válida y vuelve a intentar.`,
  );
}

/**
 * Convierte a número decimal seguro para columnas `numeric`.
 * Acepta number o string con "RD$", comas de miles y espacios.
 * Rechaza NaN / Infinity con un mensaje claro.
 */
export function toDbMoney(value: unknown, friendlyField = "monto"): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new UserFacingRepositoryError(
        `El ${friendlyField} no es un número válido.`,
      );
    }
    return roundTo(value, 2);
  }
  if (typeof value === "string") {
    // Quitar símbolo de moneda, comas de miles y espacios. Mantener punto y signo.
    const cleaned = value
      .replace(/rd\$/gi, "")
      .replace(/\$/g, "")
      .replace(/,/g, "")
      .replace(/\s/g, "")
      .trim();
    const n = Number(cleaned);
    if (cleaned === "" || !Number.isFinite(n)) {
      throw new UserFacingRepositoryError(
        `El ${friendlyField} no es un número válido. Verifica el valor.`,
      );
    }
    return roundTo(n, 2);
  }
  if (value == null) return 0;
  throw new UserFacingRepositoryError(`El ${friendlyField} no es un número válido.`);
}

/** Igual que toDbMoney pero permite null (columnas numeric nullable). */
export function toDbMoneyNullable(
  value: unknown,
  friendlyField = "monto",
): number | null {
  if (value == null || value === "") return null;
  return toDbMoney(value, friendlyField);
}

/** Entero seguro (cantidades, line_no). */
export function toDbInt(value: unknown, friendlyField = "cantidad"): number {
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) {
    throw new UserFacingRepositoryError(`La ${friendlyField} no es válida.`);
  }
  return Math.trunc(n);
}

/**
 * Normaliza a fecha ISO `YYYY-MM-DD` para columnas `date`. Acepta:
 *  - Date
 *  - ISO `YYYY-MM-DD` (passthrough)
 *  - dominicano `DD/MM/YYYY` o `DD-MM-YYYY`
 */
export function toDbDate(value: unknown, friendlyField = "fecha"): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const iso = `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    if (!Number.isNaN(new Date(iso).getTime())) return iso;
  }
  // Último intento: parseo nativo.
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  throw new UserFacingRepositoryError(`La ${friendlyField} no es válida.`);
}

/** Normaliza a timestamp ISO para columnas `timestamptz`. */
export function toDbTimestamp(value: unknown, friendlyField = "fecha"): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const s = String(value ?? "").trim();
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  throw new UserFacingRepositoryError(`La ${friendlyField} no es válida.`);
}

/** Métodos de pago válidos en el schema (proforma_payments.method_code). */
export const DB_PAYMENT_METHODS = [
  "cash",
  "card",
  "transfer",
  "azul",
  "cardnet",
  "visanet",
  "paypal",
  "manual",
  "other",
] as const;
export type DbPaymentMethod = (typeof DB_PAYMENT_METHODS)[number];

const PAYMENT_METHOD_ALIASES: Record<string, DbPaymentMethod> = {
  efectivo: "cash",
  cash: "cash",
  tarjeta: "card",
  card: "card",
  transferencia: "transfer",
  transfer: "transfer",
  azul: "azul",
  cardnet: "cardnet",
  visanet: "visanet",
  paypal: "paypal",
  manual: "manual",
  otro: "other",
  other: "other",
};

/**
 * Mapea un método de pago (español o inglés) al enum del schema. Cualquier
 * valor desconocido cae en "other" para no romper el insert por check.
 */
export function mapPaymentMethod(value: unknown): DbPaymentMethod {
  const s = String(value ?? "").trim().toLowerCase();
  return PAYMENT_METHOD_ALIASES[s] ?? "other";
}

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}
