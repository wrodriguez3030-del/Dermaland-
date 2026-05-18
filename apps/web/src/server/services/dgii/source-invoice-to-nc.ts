import "server-only";
import type { ElectronicInvoice } from "@/types";
import type {
  CodigoModificacion,
  EcfBuilderInput,
  EcfItem,
  IndicadorNotaCredito,
  InformacionReferencia,
} from "./types";

/**
 * DEMO ÚNICAMENTE — Construye un `EcfBuilderInput` para Nota de Crédito
 * (e-CF 34) a partir de una factura mock origen.
 *
 * Reglas DGII reflejadas en el output:
 *  - `informacionReferencia.ncfModificado` = eNcf de la factura origen.
 *  - `informacionReferencia.codigoModificacion` = código pasado por el
 *    caller (1=Anulación, 2=Cambios, 3=Devolución, 4=Descuento por pronto
 *    pago, 5=Corrección).
 *  - `indicadorNotaCredito` se calcula automáticamente:
 *      0 si la NC se emite <= 30 días calendario después de la factura
 *      1 si > 30 días.
 *  - `tipoEcf = "34"`, `tipoPago = 1` (Contado), `tipoIngresos = "01"`.
 *  - El XSD 34 NO emite `<FechaVencimientoSecuencia>` (lo reemplaza
 *    `<IndicadorNotaCredito>`); el builder lo respeta automáticamente.
 *
 * El eNcf de la NC se sintetiza (no se consume secuencia real) — al
 * activar Fase C, el caller debe reservar el siguiente eNcf real con
 * `DgiiSequenceService.reserve('34')`.
 *
 * El RNC del comprador (`rncComprador`) es obligatorio en e-CF 34. El
 * mock `ElectronicInvoice` no lo persiste; el caller debe pasarlo
 * explícitamente o se cae a un placeholder demo (`131234567`) — esto
 * SOLO está bien en modo mock.
 */

const FALLBACK_RNC_COMPRADOR = "131234567";

/** Códigos válidos del XSD (`CodigoModificacionType`: 1..5). */
export const VALID_CODIGOS_MODIFICACION: ReadonlyArray<CodigoModificacion> = [
  1, 2, 3, 4, 5,
];

export interface BuildNcFromInvoiceInput {
  /** Factura origen (mock). */
  sourceInvoice: ElectronicInvoice;
  /** Motivo libre (se incluye como `descripcionItem` del único item). */
  motivo: string;
  /** Código DGII del tipo de modificación. */
  codigoModificacion: CodigoModificacion;
  /** RNC del comprador (si la factura origen lo tuviera persistido). */
  rncComprador?: string;
  /** Fecha en que se firma/emite la NC (default: now). */
  now?: Date;
}

/**
 * Días calendario entre dos fechas, redondeado hacia abajo.
 */
function diffDaysCalendar(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / 86_400_000);
}

/**
 * Construye el eNcf de la NC. Toma los últimos dígitos del eNcf origen
 * y los prefija con `E34`. Si la factura origen no es alfanumérica
 * estándar, se fabrica desde timestamp.
 */
function synthesizeNcEncf(sourceEcfNumber: string, now: Date): string {
  const digits = sourceEcfNumber.replace(/\D/g, "").slice(-7);
  const stamp = String(now.getTime() % 1_000).padStart(3, "0");
  const tail = (digits + stamp).padStart(10, "0").slice(-10);
  return `E34${tail}`;
}

/**
 * Indicador automático: 0 si la NC se emite dentro de 30 días del
 * comprobante original; 1 si pasaron más de 30 días.
 */
export function computeIndicadorNotaCredito(
  sourceDate: Date,
  ncDate: Date,
): IndicadorNotaCredito {
  return diffDaysCalendar(sourceDate, ncDate) > 30 ? 1 : 0;
}

export function mapSourceInvoiceToNcInput(
  input: BuildNcFromInvoiceInput,
): EcfBuilderInput {
  if (!input.sourceInvoice) {
    throw new Error("sourceInvoice requerido");
  }
  if (!input.motivo || input.motivo.trim().length === 0) {
    throw new Error("motivo requerido");
  }
  if (!VALID_CODIGOS_MODIFICACION.includes(input.codigoModificacion)) {
    throw new Error(
      `codigoModificacion inválido: ${input.codigoModificacion} (válidos: ${VALID_CODIGOS_MODIFICACION.join(", ")})`,
    );
  }

  const inv = input.sourceInvoice;
  const now = input.now ?? new Date();
  const sourceDate = new Date(inv.createdAt);
  const indicadorNotaCredito = computeIndicadorNotaCredito(sourceDate, now);

  const ncEncf = synthesizeNcEncf(inv.ecfNumber, now);

  const rncComprador = input.rncComprador ?? FALLBACK_RNC_COMPRADOR;
  const razonSocial = inv.customerName || "Consumidor Final";

  const informacionReferencia: InformacionReferencia = {
    ncfModificado: inv.ecfNumber,
    rncOtroContribuyente: rncComprador,
    fechaNCFModificado: sourceDate,
    codigoModificacion: input.codigoModificacion,
  };

  // NC por el monto total del origen (caso típico de anulación/devolución
  // completa). Si fuera una NC parcial, el caller debería pasar items
  // específicos — este helper hace el caso simple.
  const subtotalPreItbis = inv.amount; // ya es pre-ITBIS en el mock
  const item: EcfItem = {
    numeroLinea: 1,
    indicadorFacturacion: 1,
    nombreItem: `Nota de Crédito — ${inv.ecfNumber}`,
    indicadorBienoServicio: 1,
    cantidadItem: 1,
    precioUnitarioItem: subtotalPreItbis,
    descripcionItem: input.motivo.trim(),
    montoItem: subtotalPreItbis,
  };

  return {
    tipoEcf: "34",
    eNcf: ncEncf,
    fechaVencimientoSecuencia: new Date(2027, 11, 31), // ignorado por XSD 34
    tipoIngresos: "01",
    tipoPago: 1,
    indicadorMontoGravado: 0,
    indicadorNotaCredito,
    emisor: {
      rncEmisor: "13259077503",
      razonSocialEmisor: "DermaLand SRL",
      nombreComercial: "DermaLand",
      direccionEmisor:
        "Calle E. León Jiménez No. 47, Esq. Mayagüez, Reparto del Este, Santiago",
      correoEmisor: "fiscal@dermaland.do",
      fechaEmision: now,
    },
    comprador: {
      rncComprador,
      razonSocialComprador: razonSocial,
    },
    totales: {
      montoGravadoTotal: subtotalPreItbis,
      itbis1: 18,
      totalItbis: inv.itbis,
      totalItbis1: inv.itbis,
      montoTotal: inv.total,
    },
    items: [item],
    informacionReferencia,
    fechaHoraFirma: now,
  };
}
