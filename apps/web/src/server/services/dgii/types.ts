/**
 * Tipos de entrada para los servicios DGII (XML builder, validator, signer).
 *
 * Estos tipos son la **frontera contractual** entre la capa de negocio
 * (proforma + dgii_settings + ecf_sequences) y el builder XML. Mantienen el
 * builder puro y testeable sin depender de la base de datos.
 *
 * Decisiones de tipado:
 *  - RNCs como string (DGII acepta 9 o 11 dígitos sin guiones).
 *  - Fechas como `Date` JS — el builder las formatea según la convención
 *    DGII (constante `DGII_DATE_FORMAT` en `builder.ts`, sujeta a validación
 *    contra documentación oficial — duda D-03 en la matriz).
 *  - Decimales como `number` JS — el builder los serializa con `toFixed(2)`
 *    excepto `precioUnitarioItem` que usa `toFixed(4)` (XSD acepta 1or4).
 *  - Indicadores como literales unión — refuerza la validación contra el XSD.
 *
 * IMPORTANTE: este tipo describe los datos para construir el XML, no la
 * regla fiscal. Quién emite un 31 vs un 32, cuándo se aplica retención, etc.
 * son decisiones del contador/servicio que llama al builder, no del builder.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Codificaciones DGII (extraídas del XSD e-CF 31 v1.0)
// ─────────────────────────────────────────────────────────────────────────────

/** TipoeCFType del XSD. Los tipos vigentes para Fase D son 31..34. */
export type TipoEcf =
  | "31" // Factura de Crédito Fiscal Electrónica
  | "32" // Factura de Consumo Electrónica
  | "33" // Nota de Débito Electrónica
  | "34" // Nota de Crédito Electrónica
  | "41"
  | "43"
  | "44"
  | "45"
  | "46"
  | "47";

/** TipoIngresosValidationType del XSD. */
export type TipoIngresos = "01" | "02" | "03" | "04" | "05" | "06";

/** TipoPagoType del XSD: 1=Contado, 2=Crédito, 3=Gratuito. */
export type TipoPago = 1 | 2 | 3;

/**
 * FormaPagoType del XSD:
 *  1 = Efectivo
 *  2 = Cheque / Transferencia / Depósito
 *  3 = Tarjeta de Débito / Crédito
 *  4 = Venta a Crédito
 *  5 = Bonos o Certificados de regalo
 *  6 = Permuta
 *  7 = Nota de Crédito
 *  8 = Otras formas de pago
 */
export type FormaPago = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * IndicadorFacturacionType del XSD:
 *  0 = No Facturable
 *  1 = ITBIS 1 (18%)
 *  2 = ITBIS 2 (16%)
 *  3 = ITBIS 3 (0%)
 *  4 = Exento
 */
export type IndicadorFacturacion = 0 | 1 | 2 | 3 | 4;

/** IndicadorBienoServicioType del XSD: 1=Bien, 2=Servicio. */
export type IndicadorBienoServicio = 1 | 2;

/**
 * IndicadorMontoGravadoType del XSD:
 *  0 = los montos en líneas no tienen ITBIS incluido
 *  1 = los montos en líneas se encuentran con ITBIS incluido
 */
export type IndicadorMontoGravado = 0 | 1;

/**
 * IndicadorNotaCreditoType del XSD e-CF 34 (Nota de Crédito):
 *  0 = fecha de emisión <= 30 días calendario desde el e-CF original
 *  1 = fecha de emisión > 30 días calendario desde el e-CF original
 *
 * Obligatorio en e-CF 34 según el XSD oficial. El builder enforza.
 */
export type IndicadorNotaCredito = 0 | 1;

/** Forma de pago en la `TablaFormasPago` (1..7 items por XSD). */
export interface FormaPagoLinea {
  formaPago: FormaPago;
  /** Monto de esa forma de pago, con `>= 0` (validado por XSD). */
  montoPago: number;
}

/**
 * CodigoModificacionType del XSD (usado en `<InformacionReferencia>` de
 * Notas de Crédito y Débito):
 *  1 = Anulación
 *  2 = Cambios al original (modificaciones que no son anulación)
 *  3 = Devolución de mercancías
 *  4 = Descuento por pronto pago
 *  5 = Corrección de errores en el comprobante original
 *
 * Códigos exactos sujetos a validación contra documentación oficial DGII
 * (matriz D-13).
 */
export type CodigoModificacion = 1 | 2 | 3 | 4 | 5;

/**
 * Bloque `<InformacionReferencia>` del XSD.
 *
 * - OPCIONAL en e-CF 31 (puede no aparecer).
 * - OBLIGATORIO en e-CF 33 (Nota de Débito) y 34 (Nota de Crédito) — referencia
 *   al e-CF original que se está modificando.
 *
 * Todos los campos se declaran como obligatorios aquí porque, cuando el
 * bloque se incluye, DGII espera la información completa para identificar
 * el comprobante de referencia. El builder lo serializa en el orden exacto
 * del XSD.
 */
export interface InformacionReferencia {
  /** e-NCF original que se está modificando (11..19 chars alfanum). */
  ncfModificado: string;
  /** RNC del otro contribuyente (9 o 11 dígitos, sin guiones). */
  rncOtroContribuyente: string;
  fechaNCFModificado: Date;
  codigoModificacion: CodigoModificacion;
}

// ─────────────────────────────────────────────────────────────────────────────
// Secciones del e-CF
// ─────────────────────────────────────────────────────────────────────────────

export interface EcfEmisor {
  /** RNC del emisor sin guiones — DGII acepta `[0-9]{9}` o `[0-9]{11}`. */
  rncEmisor: string;
  razonSocialEmisor: string;
  nombreComercial?: string;
  sucursal?: string;
  direccionEmisor: string;
  municipio?: string;
  provincia?: string;
  /** Teléfonos en formato `ddd-ddd-dddd` (XSD lo exige así). */
  telefonosEmisor?: string[];
  correoEmisor?: string;
  website?: string;
  actividadEconomica?: string;
  fechaEmision: Date;
}

export interface EcfComprador {
  /**
   * RNC o cédula del comprador sin guiones (9 u 11 dígitos).
   *  - e-CF 31: OBLIGATORIO según XSD.
   *  - e-CF 32: OPCIONAL (consumidor final puede no tener RNC).
   *  - e-CF 33/34: OBLIGATORIO (NC/ND requieren identificar al comprador
   *    del comprobante original).
   *
   * El builder enforza la regla por tipo.
   */
  rncComprador?: string;
  /**
   * Razón social del comprador.
   *  - e-CF 31, 33, 34: OBLIGATORIO según XSD.
   *  - e-CF 32: OPCIONAL — para consumidor final, pasar "Consumidor Final"
   *    o un nombre cuando se conozca.
   */
  razonSocialComprador?: string;
  contactoComprador?: string;
  correoComprador?: string;
  direccionComprador?: string;
  municipioComprador?: string;
  provinciaComprador?: string;
}

export interface EcfTotales {
  /** Suma de todos los montos gravados (XSD Decimal18D1or2). */
  montoGravadoTotal?: number;
  montoGravadoI1?: number;
  montoGravadoI2?: number;
  montoGravadoI3?: number;
  montoExento?: number;
  /** Tasas (enteros) de ITBIS aplicadas. */
  itbis1?: number;
  itbis2?: number;
  itbis3?: number;
  totalItbis?: number;
  totalItbis1?: number;
  totalItbis2?: number;
  totalItbis3?: number;
  /** Único campo obligatorio en `<Totales>` según XSD. */
  montoTotal: number;
}

export interface EcfItem {
  /** 1..1000 según XSD. */
  numeroLinea: number;
  indicadorFacturacion: IndicadorFacturacion;
  nombreItem: string;
  indicadorBienoServicio: IndicadorBienoServicio;
  descripcionItem?: string;
  cantidadItem: number;
  unidadMedida?: number;
  precioUnitarioItem: number;
  descuentoMonto?: number;
  /** Monto total de la línea (cant × precio − descuento). */
  montoItem: number;
}

/**
 * Input completo para construir un e-CF 31.
 *
 * Las versiones futuras de los tipos 32/33/34 reutilizarán este shape con
 * pequeñas variantes (e.g. NC requiere `informacionReferencia`). El builder
 * para esos tipos se construye encima del de 31.
 */
export interface EcfBuilderInput {
  tipoEcf: TipoEcf;
  /** e-NCF de 13 caracteres alfanuméricos (XSD pattern `[a-z0-9A-Z]{13}`). */
  eNcf: string;
  /**
   * Fecha de vencimiento de la secuencia e-NCF.
   *  - e-CF 31/33: OBLIGATORIO (XSD `minOccurs="1"`).
   *  - e-CF 32: NO se emite (el XSD oficial lo OMITE de IdDoc).
   *  - e-CF 34: NO se emite (el XSD oficial lo OMITE; usa `indicadorNotaCredito` en su lugar).
   *
   * El builder ignora este valor para 32 y 34. Lo mantenemos en el shape
   * para evitar romper callers existentes; opcional sería más limpio pero
   * requeriría cambio breaking.
   */
  fechaVencimientoSecuencia: Date;
  /**
   * Indicador específico de e-CF 34 (Nota de Crédito):
   *  - 0 = fecha de emisión <= 30 días calendario del e-CF original.
   *  - 1 = fecha de emisión > 30 días.
   *
   * OBLIGATORIO para e-CF 34. Ignorado en 31/32/33.
   */
  indicadorNotaCredito?: IndicadorNotaCredito;
  /** Tipo de ingreso del emisor (XSD obligatorio). */
  tipoIngresos: TipoIngresos;
  tipoPago: TipoPago;
  /**
   * Indicador opcional. 0 = montos SIN ITBIS incluido (el builder lo asume
   * por defecto), 1 = montos CON ITBIS incluido. Confirma con contador
   * antes de cambiar a 1.
   */
  indicadorMontoGravado?: IndicadorMontoGravado;
  /** Tabla de formas de pago — XSD permite 1..7 entradas. */
  formasPago?: FormaPagoLinea[];

  emisor: EcfEmisor;
  comprador: EcfComprador;
  totales: EcfTotales;
  items: EcfItem[];

  /**
   * Bloque `<InformacionReferencia>`.
   *  - e-CF 31/32: opcional.
   *  - e-CF 33/34: OBLIGATORIO. El builder lanza `EcfBuilderInvalidInput`
   *    si se omite.
   */
  informacionReferencia?: InformacionReferencia;

  /** Sello temporal antes de firmar (XSD obligatorio, va al final del XML). */
  fechaHoraFirma: Date;
}
