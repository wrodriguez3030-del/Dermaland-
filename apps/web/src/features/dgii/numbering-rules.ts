// Reglas PURAS de validación de numeraciones — compartidas entre las rutas
// API (servidor) y los tests. Sin "use client", sin React, sin localStorage.

export interface NumberingLike {
  id: string;
  documentType: string;
  prefix: string;
  environment: string;
  isPreferred: boolean;
  status: string;
  rangeStart: number;
  rangeEnd: number;
  nextNumber: number;
}

export interface NumberingWriteInput {
  name?: string;
  documentType?: string;
  prefix?: string;
  rangeStart?: number;
  rangeEnd?: number;
  nextNumber?: number;
  environment?: string;
  isPreferred?: boolean;
  status?: string;
  endDate?: string | null;
  startDate?: string | null;
  isElectronic?: boolean;
  note?: string | null;
  branchId?: string | null;
}

export const VALID_DOC_TYPES = new Set([
  "proforma",
  "consumo",
  "credito_fiscal",
  "nota_credito",
  "nota_debito",
  "gubernamental",
  "exportacion",
  "regimen_especial",
  "ecf_31",
  "ecf_32",
  "ecf_33",
  "ecf_34",
]);

export const VALID_ENVIRONMENTS = new Set([
  "mock",
  "demo",
  "testecf",
  "certecf",
  "produccion",
]);

/**
 * Valida un create/update de numeración. `existing` = numeraciones actuales
 * del negocio (para unicidad/preferida); `current` = fila que se edita
 * (undefined en create). Devuelve un mensaje de error amigable o null.
 *
 * Reglas fiscales clave:
 *  - `produccion` SIEMPRE bloqueada mientras DGII real esté apagado.
 *  - No bajar `nextNumber` (reutilizaría números ya emitidos).
 *  - Con números emitidos, el inicio del rango no se puede mover y el fin
 *    no puede quedar por debajo del último emitido.
 */
export function validateNumberingWrite(
  input: NumberingWriteInput,
  existing: NumberingLike[],
  current?: NumberingLike,
): string | null {
  const merged = {
    name: input.name ?? "",
    documentType: input.documentType ?? current?.documentType ?? "",
    prefix: input.prefix ?? current?.prefix ?? "",
    rangeStart: input.rangeStart ?? current?.rangeStart,
    rangeEnd: input.rangeEnd ?? current?.rangeEnd,
    nextNumber: input.nextNumber ?? current?.nextNumber,
    environment: input.environment ?? current?.environment ?? "mock",
    isPreferred: input.isPreferred ?? current?.isPreferred ?? false,
    status: input.status ?? current?.status ?? "active",
  };

  if (!current && !merged.name.trim()) return "El nombre es obligatorio.";
  if (!VALID_DOC_TYPES.has(merged.documentType))
    return "El tipo de documento no es válido.";
  if (!merged.prefix.trim()) return "El prefijo es obligatorio.";
  if (!VALID_ENVIRONMENTS.has(merged.environment))
    return "El ambiente no es válido.";

  if (merged.environment === "produccion") {
    return "El ambiente Producción está bloqueado: la emisión fiscal real (DGII) está apagada.";
  }

  if (merged.rangeStart == null || merged.rangeStart < 0)
    return "El rango inicial es obligatorio.";
  if (merged.rangeEnd == null) return "El rango final es obligatorio.";
  if (merged.rangeEnd < merged.rangeStart)
    return "El rango final debe ser mayor o igual al rango inicial.";
  if (merged.nextNumber == null) return "El siguiente número es obligatorio.";

  // Reglas de edición ANTES del chequeo genérico de rango: dan el mensaje
  // específico correcto (bajar next / encoger rango con emisiones).
  if (current) {
    const used = current.nextNumber > current.rangeStart;
    if (merged.nextNumber < current.nextNumber) {
      return "No se puede bajar el siguiente número: reutilizaría comprobantes ya emitidos.";
    }
    if (used && merged.rangeStart !== current.rangeStart) {
      return "Esta numeración ya emitió comprobantes: el inicio del rango no se puede modificar.";
    }
    if (used && merged.rangeEnd < current.nextNumber - 1) {
      return "El fin del rango no puede quedar por debajo del último número emitido.";
    }
  }

  if (
    merged.nextNumber < merged.rangeStart ||
    merged.nextNumber > merged.rangeEnd + 1
  )
    return "El siguiente número debe estar dentro del rango.";

  // Unicidad prefijo + tipo + ambiente.
  const dup = existing.some(
    (n) =>
      n.id !== current?.id &&
      n.prefix.toUpperCase() === merged.prefix.toUpperCase() &&
      n.documentType === merged.documentType &&
      n.environment === merged.environment,
  );
  if (dup)
    return "Ya existe una numeración con el mismo prefijo, tipo y ambiente.";

  // Una sola preferida activa por tipo + ambiente.
  if (merged.isPreferred && merged.status === "active") {
    const otherPreferred = existing.some(
      (n) =>
        n.id !== current?.id &&
        n.documentType === merged.documentType &&
        n.environment === merged.environment &&
        n.isPreferred &&
        n.status === "active",
    );
    if (otherPreferred)
      return "Ya hay una numeración preferida activa para este tipo y ambiente.";
  }

  return null;
}
