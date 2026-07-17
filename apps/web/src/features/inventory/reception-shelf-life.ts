/**
 * Chequeo de vida útil al RECIBIR un lote contra la regla del laboratorio.
 *
 * `minShelfLifeDays` = días mínimos exigidos por el laboratorio del producto
 * (NULL/undefined = sin regla). Devuelve los días restantes y si el lote llega
 * por debajo del mínimo. NO decide qué hacer (advertir/bloquear); solo calcula.
 */
export interface ReceptionShelfLifeInput {
  /** Fecha de vencimiento del lote (ISO). Vacío/ inválido = no evaluable. */
  expiresAt: string;
  /** Regla del laboratorio (días mínimos). NULL/undefined = sin regla. */
  minShelfLifeDays?: number | null;
  /** Fecha de referencia (por defecto ahora). */
  ref?: Date;
}

export interface ReceptionShelfLifeResult {
  /** Días de vida útil restantes al recibir (null si no evaluable). */
  remainingDays: number | null;
  /** Umbral del laboratorio aplicado (null si no hay regla). */
  minDays: number | null;
  /** ¿El lote llega por debajo del mínimo del laboratorio? */
  belowMinimum: boolean;
}

export function receptionShelfLifeCheck(
  input: ReceptionShelfLifeInput,
): ReceptionShelfLifeResult {
  const { expiresAt, minShelfLifeDays, ref = new Date() } = input;
  const minDays =
    minShelfLifeDays == null ? null : minShelfLifeDays;

  if (!expiresAt) {
    return { remainingDays: null, minDays, belowMinimum: false };
  }
  const ms = new Date(expiresAt).getTime();
  if (Number.isNaN(ms)) {
    return { remainingDays: null, minDays, belowMinimum: false };
  }
  const remainingDays = Math.ceil((ms - ref.getTime()) / 86_400_000);
  const belowMinimum = minDays != null && remainingDays < minDays;
  return { remainingDays, minDays, belowMinimum };
}
