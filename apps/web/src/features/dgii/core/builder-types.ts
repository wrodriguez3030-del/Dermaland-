/**
 * Tipos del builder XML e-CF (Fase 4, alineado al XSD oficial DGII en Fase 5).
 *
 * Estructura/nombres/orden alineados a los XSD oficiales v1.0 en docs/dgii/xsd/.
 * El XML se genera SIN firma (la firma XMLDSig <Signature> es Fase 6; el XSD la
 * exige vía xs:any minOccurs=1, por lo que el XML sin firmar pasa todo el XSD
 * EXCEPTO ese nodo final). Sin DB/fetch/FS/cert/env/DGII.
 */

/**
 * Tipos con BUILDER implementado (capacidad de EMISIÓN del software).
 * v351-v353: 41/43/44/45/46/47 implementados literalmente contra sus XSD
 * oficiales (docs/dgii/xsd/FIELD_MATRIX_41_45.md). Los 10 tipos objetivo.
 */
export const ECF_TIPOS_BUILDER = ["31", "32", "33", "34", "41", "43", "44", "45", "46", "47"] as const;
export type EcfTipoBuilder = (typeof ECF_TIPOS_BUILDER)[number];

/** v353 — ya no quedan tipos reservados (los 10 objetivo tienen builder). */
export const ECF_TIPOS_RESERVADOS = [] as const;

/**
 * v351 — Tipos DECLARABLES en la postulación DGII actual. DESACOPLADO del
 * builder a propósito: tener builder ≠ estar certification-ready. Este set se
 * amplía SOLO por release explícita cuando el readiness completo del tipo esté
 * verde (fixtures + secuencia + flujos + certificación — plan v355). La
 * postulación de un tenant JAMÁS declara más que esto.
 */
// v368 — AMPLIADA a los 10 tipos por autorización explícita del dueño (2026-07-14)
// para la postulación ALL-TYPES de CIBAO. postulationEligible ≠ emittable: declarar
// un tipo inicia su certificación; emitir en producción sigue gated por rango +
// certificación + tenantEnabled. El 42 queda EXCLUIDO y fail-closed.
export const ECF_TIPOS_POSTULACION = ["31", "32", "33", "34", "41", "43", "44", "45", "46", "47"] as const;

/** IndicadorAgenteRetencionoPercepcion (XSD e-CF 41): 1=Agente de retención, 2=percepción. */
export const INDICADORES_AGENTE_RETENCION = ["1", "2"] as const;
export type IndicadorAgenteRetencion = (typeof INDICADORES_AGENTE_RETENCION)[number];

/** Retención por línea (XSD: OBLIGATORIA en 41 y 47; en 47 MontoISRRetenido es requerido). */
export type EcfItemRetencion = {
  indicadorAgente: IndicadorAgenteRetencion;
  /** MontoITBISRetenido (opcional en el XSD). */
  montoItbisRetenido?: number | null;
  /** MontoISRRetenido (opcional en el XSD). */
  montoIsrRetenido?: number | null;
};

export const AMBIENTES = ["testecf", "certecf", "ecf"] as const;
export type Ambiente = (typeof AMBIENTES)[number];

/** TipoIngresos (XSD TipoIngresosValidationType): 01..06. Default 01 (operaciones). */
export const TIPOS_INGRESOS = ["01", "02", "03", "04", "05", "06"] as const;
export type TipoIngresos = (typeof TIPOS_INGRESOS)[number];

/** TipoPago (XSD TipoPagoType): 1=Contado, 2=Crédito, 3=Gratuito. Default 1. */
export const TIPOS_PAGO = ["1", "2", "3"] as const;
export type TipoPago = (typeof TIPOS_PAGO)[number];

/** IndicadorBienoServicio (XSD): 1=Bien, 2=Servicio. Default 1. */
export const INDICADORES_BIEN_SERVICIO = ["1", "2"] as const;
export type IndicadorBienoServicio = (typeof INDICADORES_BIEN_SERVICIO)[number];

/** CodigoModificacion (XSD, notas): 1..5. Requerido para tipo 34. */
export const CODIGOS_MODIFICACION = ["1", "2", "3", "4", "5"] as const;
export type CodigoModificacion = (typeof CODIGOS_MODIFICACION)[number];

export type EcfEmisor = {
  rnc: string;
  razonSocial: string;
  nombreComercial?: string | null;
  /** Requerido por el XSD (DireccionEmisor minOccurs=1). */
  direccion: string;
  provinciaCodigo?: string | null;
  municipioCodigo?: string | null;
  correo?: string | null;
  telefono?: string | null;
  /** v387 — comerciales OPCIONALES del XSD (Emisor), tras CorreoEmisor y antes de FechaEmision.
   *  Fidelidad del set oficial: si el Excel trae valor, DEBE emitirse (no omitir por ser opcional). */
  webSite?: string | null;
  codigoVendedor?: string | null;
  numeroFacturaInterna?: string | null;
  numeroPedidoInterno?: string | null;
  zonaVenta?: string | null;
};

export type EcfComprador = {
  rncOCedula?: string | null;
  razonSocial?: string | null;
  correo?: string | null;
  direccion?: string | null;
  /** v353 — SOLO 44/46/47 (XSD IdentificadorExtranjero, AlfNum20). */
  identificadorExtranjero?: string | null;
  /** v353 — SOLO 46 (XSD PaisComprador, Alfa60). */
  pais?: string | null;
  /** v387 — comerciales OPCIONALES del XSD (Comprador). Fidelidad del set oficial: emitir si
   *  el Excel trae valor. Fechas en ISO date-only (DD-MM-YYYY al XSD). Orden XSD respetado. */
  contacto?: string | null;
  municipioCodigo?: string | null;
  provinciaCodigo?: string | null;
  fechaEntrega?: string | null;
  /** v389 — Comprador (XSD 87-89), entre FechaEntrega y FechaOrdenCompra. */
  contactoEntrega?: string | null;
  direccionEntrega?: string | null;
  telefonoAdicional?: string | null;
  fechaOrdenCompra?: string | null;
  numeroOrdenCompra?: string | null;
  codigoInterno?: string | null;
};

export type EcfItem = {
  nombre: string;
  descripcion?: string | null;
  /** v396 — FechaElaboracion por ítem (ISO date-only YYYY-MM-DD; el builder la emite civil DD-MM-YYYY).
   *  DGII rechazó E440000000011 por omitir esta fecha del ítem aunque el Excel la traía. */
  fechaElaboracion?: string | null;
  /** v396 — FechaVencimientoItem por ítem (ISO date-only YYYY-MM-DD → civil DD-MM-YYYY). */
  fechaVencimientoItem?: string | null;
  cantidad: number;
  /** v387 — representación LEXICAL exacta del Excel (p.ej. "15.00"); si está, gana sobre
   *  `String(cantidad)` para preservar la escala/ceros finales que exige el set oficial. */
  cantidadLexical?: string | null;
  unidadMedida?: string | null;
  precioUnitario: number;
  /** v392 — representación LEXICAL EXACTA del Excel para PrecioUnitarioItem (p.ej. "350.0000").
   *  DGII compara este campo lexicalmente (350.00 ≠ 350.0000 aunque sean el mismo número): si
   *  está, gana sobre `money2str(precioUnitario)` para preservar la escala del set oficial. */
  precioUnitarioLexical?: string | null;
  /** Descuento monetario por línea. */
  descuento?: number | null;
  /** v392 — lexical exacto del Excel para DescuentoMonto por ítem (preserva escala). */
  descuentoLexical?: string | null;
  /** v392 — lexical exacto del Excel para RecargoMonto por ítem (preserva escala). */
  recargoLexical?: string | null;
  /** v392 — lexical exacto del Excel para MontoItem por ítem (preserva escala; si falta, se calcula). */
  montoItemLexical?: string | null;
  /** Tasa ITBIS en %: 0, 16, 18. Se mapea a IndicadorFacturacion (18→1,16→2,0→4). */
  itbisRate: number;
  /**
   * v378 — IndicadorFacturacion explícito ("0"|"1"|"2"|"3"|"4", enum del XSD).
   * Cuando se provee gana sobre la derivación por tasa: distingue "3" (gravado 0%)
   * de "4" (exento) —indistinguibles por itbisRate— y "0" (No Facturable: ni gravado
   * ni exento, su monto va a MontoNoFacturable). Sin él → se deriva de itbisRate.
   */
  indicadorFacturacion?: "0" | "1" | "2" | "3" | "4";
  /** 1=Bien, 2=Servicio. Default 1. */
  indicadorBienoServicio?: IndicadorBienoServicio | null;
  /** Pendiente: requiere TablaCodigosItem en el XSD; no se emite aún. */
  codigoItem?: string | null;
  /** v351 — SOLO tipo 41 (obligatoria por ítem en su XSD); inválida en los demás. */
  retencion?: EcfItemRetencion | null;
  /** v378 — TablaSubDescuento por línea (tras DescuentoMonto). */
  subDescuentos?: EcfSubAjuste[];
  /** v378 — RecargoMonto por línea (tras TablaSubDescuento). */
  recargoMonto?: number;
  /** v378 — TablaSubRecargo por línea (tras RecargoMonto). */
  subRecargos?: EcfSubAjuste[];
  /** v378 — OtraMonedaDetalle por línea (antes de MontoItem). */
  otraMonedaDetalle?: EcfOtraMonedaDetalle;
};

/** v378 — Sub-descuento/sub-recargo por línea (Tabla…{Tipo…, …Porcentaje?, Monto…}). */
export type EcfSubAjuste = { tipo: string; porcentaje?: number; monto: number };

/** v378 — OtraMonedaDetalle por línea. */
export type EcfOtraMonedaDetalle = {
  precioOtraMoneda?: number;
  descuentoOtraMoneda?: number;
  recargoOtraMoneda?: number;
  montoItemOtraMoneda?: number;
};

export type EcfTotalesInput = {
  subtotal?: number;
  totalItbis?: number;
  total?: number;
  montoExento?: number;
  montoGravado?: number;
};

/** Referencia a comprobante modificado (requerida para tipo 34). */
export type EcfReferencia = {
  ncfModificado: string;
  /** Requerida por XSD para tipo 34 (FechaNCFModificado). ISO. */
  fechaNcfModificado?: string | null;
  /** Requerida por XSD para tipo 34 (CodigoModificacion 1..5). */
  codigoModificacion?: CodigoModificacion | null;
  razonModificacion?: string | null;
  rncOtroContribuyente?: string | null;
};

export type BuildEcfXmlInput = {
  tipoEcf: EcfTipoBuilder;
  eNcf: string;
  /** ISO; se formatea a DD-MM-YYYY para el XSD. */
  fechaEmision: string;
  /** ISO; FechaHoraFirma (DD-MM-YYYY HH:MM:SS). Si falta, se deriva de fechaEmision. */
  fechaHoraFirma?: string | null;
  fechaVencimientoSecuencia?: string | null;
  /** v387 — IndicadorMontoGravado (IdDoc, enum "0"|"1"): fidelidad del set oficial (E31 esperaba 0).
   *  minOccurs=0 en el XSD; emitir cuando el Excel trae valor. Va entre FechaVencimientoSecuencia
   *  (IndicadorEnvioDiferido) y TipoIngresos. */
  indicadorMontoGravado?: "0" | "1" | null;
  ambiente: Ambiente;
  moneda?: string | null;
  /** TipoIngresos (default "01"). */
  tipoIngresos?: TipoIngresos;
  /** TipoPago (default "1"). */
  tipoPago?: TipoPago;
  /** IndicadorNotaCredito (XSD, solo notas 33/34): "0" (≤30 días) | "1" (>30). Default "0". */
  indicadorNotaCredito?: "0" | "1";
  /**
   * v395 — modo SET OFICIAL de certificación: DESACTIVA los defaults COMERCIALES de presencia
   * (TipoPago/TipoIngresos/IndicadorNotaCredito). DGII exige OMITIR el nodo cuando la celda oficial
   * está vacía (rechazó E430000000001 por `<TipoPago>1</TipoPago>` inyectado). En este modo esos
   * campos se emiten SOLO si vienen con valor; sin valor → nodo ausente. La emisión comercial normal
   * (sin este flag) conserva sus defaults legítimos. NO afecta cálculos ni fidelidad de valor.
   */
  officialDataset?: boolean;
  emisor: EcfEmisor;
  comprador?: EcfComprador | null;
  items: EcfItem[];
  totales?: EcfTotalesInput;
  referencia?: EcfReferencia | null;
  /** v378 — TablaFormasPago (en IdDoc). Cada entrada por separado; jamás consolidar. */
  formasPago?: EcfFormaPago[];
  /** v378 — Totales/MontoNoFacturable (opcional, minOccurs=0). No es descuento ni exento. */
  montoNoFacturable?: number | null;
  /** v389 — Totales (XSD): MontoPeriodo (164) tras MontoNoFacturable, ValorPagar (167) tras él.
   *  Valores oficiales del set (fidelidad); se emiten solo cuando el Excel los trae. */
  montoPeriodo?: number | null;
  valorPagar?: number | null;
  /** v389 — IdDoc: FechaLimitePago (21) + TerminoPago (22) tras TipoPago, antes de TablaFormasPago. */
  fechaLimitePago?: string | null;
  terminoPago?: string | null;
  /** v389 — Totales de retención OFICIALES del set (fidelidad): si el Excel los trae, ganan sobre
   *  la suma recomputada (evita diferencias de redondeo de 0.01 que DGII rechaza). Solo 41/47. */
  totalItbisRetenido?: number | null;
  totalIsrRetenido?: number | null;
  /** v378 — bloque OtraMoneda (tras Totales). Valores oficiales tal cual; sin inventar conversiones. */
  otraMoneda?: EcfOtraMoneda | null;
  /** v378 — DescuentosORecargos (tras los ítems). Cada entrada por separado, con su orden. */
  descuentosORecargos?: EcfDescuentoRecargo[];
  /** v378 — Transporte (solo E46). Campos presentes en el orden del XSD. */
  transporte?: EcfTransporte | null;
};

/** v378 — Forma de pago del e-CF (TablaFormasPago/FormaDePago). */
export type EcfFormaPago = { forma: string; monto: number };

/** v378 — Bloque OtraMoneda del Encabezado (valores oficiales; nunca recalculados). */
export type EcfOtraMoneda = {
  tipoMoneda: string;
  tipoCambio: number;
  /** v389 — representación lexical del Excel (p.ej. "56.3000"); gana sobre money2str (2 decimales). */
  tipoCambioLexical?: string | null;
  montoGravadoTotal?: number;
  montoGravado1?: number;
  montoGravado2?: number;
  montoGravado3?: number;
  montoExento?: number;
  totalItbis?: number;
  totalItbis1?: number;
  totalItbis2?: number;
  totalItbis3?: number;
  montoTotal?: number;
};

/** v378 — Descuento o recargo (DescuentosORecargos/DescuentoORecargo). */
export type EcfDescuentoRecargo = {
  numeroLinea?: number;
  tipoAjuste: string; // "D" descuento | "R" recargo (TipoAjusteType del XSD)
  indicadorNorma1007?: string;
  descripcion?: string;
  tipoValor?: string;
  valor?: number;
  monto: number;
  montoOtraMoneda?: number;
  indicadorFacturacion?: string;
};

/** v378 — Transporte/exportación (solo E46). Dos grupos del XSD-46:
 * InformacionesAdicionales (embarque/aduana) + Transporte. Campos presentes en orden. */
export type EcfTransporte = {
  // InformacionesAdicionales (embarque/aduana)
  fechaEmbarque?: string; // ISO
  numeroEmbarque?: string;
  numeroContenedor?: string;
  numeroReferencia?: string;
  nombrePuertoEmbarque?: string;
  condicionesEntrega?: string;
  totalFob?: number;
  seguro?: number;
  flete?: number;
  otrosGastos?: number;
  totalCif?: number;
  regimenAduanero?: string;
  nombrePuertoSalida?: string;
  nombrePuertoDesembarque?: string;
  pesoBruto?: number;
  pesoNeto?: number;
  unidadPesoBruto?: string;
  unidadPesoNeto?: string;
  cantidadBulto?: number;
  cantidadBultoLexical?: string | null;
  volumenBultoLexical?: string | null;
  unidadBulto?: string;
  volumenBulto?: number;
  unidadVolumen?: string;
  // Transporte
  viaTransporte?: string;
  paisOrigen?: string;
  direccionDestino?: string;
  paisDestino?: string;
  rncTransportista?: string;
  nombreTransportista?: string;
  numeroViaje?: string;
  conductor?: string;
  documentoTransporte?: string;
  ficha?: string;
  placa?: string;
  rutaTransporte?: string;
  zonaTransporte?: string;
  numeroAlbaran?: string;
};

export type EcfTotalesCalculados = {
  subtotal: number;
  montoGravado: number;
  montoExento: number;
  totalItbis: number;
  total: number;
  /** v378 — desglose gravado por tasa: I1=18%, I2=16%, I3=gravado 0%. */
  montoGravadoI1: number;
  montoGravadoI2: number;
  montoGravadoI3: number;
  /** v378 — ITBIS por tasa. */
  totalItbis1: number;
  totalItbis2: number;
  totalItbis3: number;
};

export type BuildEcfXmlResult = {
  xml: string;
  eNcf: string;
  tipoEcf: EcfTipoBuilder;
  ambiente: Ambiente;
  totals: EcfTotalesCalculados;
  /** true: el XML está SIN firma (XMLDSig). El XSD requiere <Signature> (Fase 6). */
  unsigned: boolean;
  warnings: string[];
};

export class EcfBuilderInvalidInput extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EcfBuilderInvalidInput";
  }
}

export class EcfBuilderUnsupported extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EcfBuilderUnsupported";
  }
}

/**
 * v355 — Nombres oficiales por tipo (movido de postulacion-content.ts al leaf
 * para romper el ciclo postulacion-content ↔ ecf-capabilities al hacer la
 * postulación dinámica; postulacion-content lo re-exporta — cero breaking).
 */
export const ECF_TIPO_LABELS: Record<string, string> = {
  "31": "Factura de Crédito Fiscal Electrónica",
  "32": "Factura de Consumo Electrónica",
  "33": "Nota de Débito Electrónica",
  "34": "Nota de Crédito Electrónica",
  "41": "Compras Electrónico",
  "43": "Gastos Menores Electrónico",
  "44": "Regímenes Especiales Electrónico",
  "45": "Gubernamental Electrónico",
  "46": "Exportaciones Electrónico",
  "47": "Pagos al Exterior Electrónico",
};
