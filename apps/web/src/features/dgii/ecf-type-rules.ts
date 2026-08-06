// Qué lleva cada tipo de comprobante, y qué NO puede llevar.
//
// POR QUÉ ESTO ES UNA TABLA
//
// Los diez tipos e-CF comparten la misma forma general y se diferencian en
// detalles que no siguen ningún patrón: el 43 no tiene comprador; el 44 no
// admite ITBIS; el 46 lleva país del comprador y no admite monto exento; el 47
// permite comprador extranjero sin RNC. Escribir eso como condicionales
// repartidos por un archivo de 646 líneas —que es hacia donde iba— produce el
// fallo silencioso más caro de este módulo: un campo de más que el esquema
// rechaza, o uno de menos que la DGII echa en falta.
//
// DE DÓNDE SALEN ESTAS REGLAS
//
// **De los XSD oficiales**, leídos uno por uno, no del módulo de referencia ni
// de la intuición. Y hay una prueba que vuelve a leer los esquemas y compara:
// si esta tabla se separa de lo que dice la DGII, falla. Es la única forma de
// que una tabla escrita a mano siga siendo verdad dentro de un año.

/** Presencia de una sección: obligatoria, opcional o prohibida. */
export type Presence = "required" | "optional" | "forbidden";

export interface EcfTypeRules {
  code: string;
  /** Nombre oficial, para pantallas y auditoría. */
  label: string;
  /** ¿Lleva `<Comprador>`? */
  comprador: Presence;
  /** ¿Es obligatorio su RNC? */
  rncComprador: Presence;
  /** ¿Es obligatoria su razón social? */
  razonSocialComprador: Presence;
  /** Comprador de fuera: solo donde el esquema lo admite. */
  identificadorExtranjero: Presence;
  /** Solo exportaciones. */
  paisComprador: Presence;
  /** ¿Admite montos gravados e ITBIS? */
  itbis: Presence;
  /** ¿Admite monto exento? */
  montoExento: Presence;
  /** Retenciones e ISR. */
  retenciones: Presence;
  /** Impuestos adicionales (selectivo al consumo, etc.). */
  impuestosAdicionales: Presence;
  /** `<InformacionesAdicionales>` del encabezado. */
  informacionesAdicionales: Presence;
  transporte: Presence;
  descuentosORecargos: Presence;
  /** ¿Exige `<InformacionReferencia>`? Notas de débito y crédito. */
  informacionReferencia: Presence;
  /**
   * `<FechaVencimientoSecuencia>` en IdDoc.
   *
   * La lleva TODO menos el 32 y el 34, y esos dos no la tienen ni como opcional:
   * el esquema simplemente no la declara. Emitirla ahí hace que la DGII rechace
   * el comprobante entero.
   */
  fechaVencimientoSecuencia: Presence;
  /** `<TipoIngresos>`. El 41, 43 y 47 no lo declaran. */
  tipoIngresos: Presence;
  /** `<IndicadorNotaCredito>`. Solo la nota de crédito, y ahí obligatorio. */
  indicadorNotaCredito: Presence;
  /** `<TablaFormasPago>`. El 34 y el 43 no la declaran. */
  formasPago: Presence;
  /**
   * `<Retencion>` DENTRO de cada línea, y **obligatoria** en el 41 y el 47.
   *
   * Son los dos comprobantes que emite quien paga: al comprar a alguien que no
   * factura, y al pagar al exterior. En los dos el emisor retiene, y el esquema
   * lo exige línea por línea.
   */
  retencionEnItem: Presence;
  /** Tasas de ITBIS que admite. El 46 solo la 3 (tasa cero). */
  tasasItbis: readonly (1 | 2 | 3)[];
  /**
   * ¿El ISR retenido es obligatorio dentro de `<Retencion>`?
   *
   * En el 47 sí: un pago al exterior sin decir cuánto se retuvo de ISR no
   * informa de lo único que la DGII quiere saber de él. En el 41 es opcional
   * porque ahí puede retenerse ITBIS, ISR o los dos.
   */
  isrRetenidoObligatorio: boolean;
}

/**
 * Los diez tipos.
 *
 * Los 33 y 34 —notas de débito y crédito— comparten reglas con el 31 salvo por
 * `informacionReferencia`, que en ellos es obligatoria: una nota que no dice a
 * qué comprobante modifica no sirve de nada.
 */
export const ECF_TYPE_RULES: Record<string, EcfTypeRules> = {
  "31": {
    code: "31",
    label: "Factura de Crédito Fiscal Electrónica",
    comprador: "required",
    rncComprador: "required",
    razonSocialComprador: "required",
    identificadorExtranjero: "forbidden",
    paisComprador: "forbidden",
    itbis: "optional",
    montoExento: "optional",
    retenciones: "optional",
    impuestosAdicionales: "optional",
    informacionesAdicionales: "optional",
    transporte: "optional",
    descuentosORecargos: "optional",
    informacionReferencia: "optional",
    fechaVencimientoSecuencia: "required",
    tipoIngresos: "required",
    indicadorNotaCredito: "forbidden",
    formasPago: "optional",
    retencionEnItem: "optional",
    tasasItbis: [1, 2, 3],
    isrRetenidoObligatorio: false,
  },
  "32": {
    code: "32",
    label: "Factura de Consumo Electrónica",
    comprador: "required",
    // Al consumidor final no se le pide el RNC: es la venta de mostrador.
    rncComprador: "optional",
    razonSocialComprador: "optional",
    identificadorExtranjero: "optional",
    paisComprador: "forbidden",
    itbis: "optional",
    montoExento: "optional",
    // Sin retenciones: no hay agente de retención en una venta de consumo.
    retenciones: "forbidden",
    impuestosAdicionales: "optional",
    informacionesAdicionales: "optional",
    transporte: "optional",
    descuentosORecargos: "optional",
    informacionReferencia: "optional",
    fechaVencimientoSecuencia: "forbidden",
    tipoIngresos: "required",
    indicadorNotaCredito: "forbidden",
    formasPago: "optional",
    retencionEnItem: "forbidden",
    tasasItbis: [1, 2, 3],
    isrRetenidoObligatorio: false,
  },
  "33": {
    code: "33",
    label: "Nota de Débito Electrónica",
    // El ESQUEMA los deja opcionales. Que DermaLand los exija es una regla de
    // negocio y vive abajo, en `REGLAS_DE_NEGOCIO`, no aquí.
    comprador: "optional",
    rncComprador: "optional",
    razonSocialComprador: "optional",
    identificadorExtranjero: "optional",
    paisComprador: "forbidden",
    itbis: "optional",
    montoExento: "optional",
    retenciones: "optional",
    impuestosAdicionales: "optional",
    informacionesAdicionales: "optional",
    transporte: "optional",
    descuentosORecargos: "optional",
    // Una nota que no dice qué modifica no sirve de nada.
    informacionReferencia: "required",
    fechaVencimientoSecuencia: "required",
    tipoIngresos: "optional",
    indicadorNotaCredito: "forbidden",
    formasPago: "optional",
    retencionEnItem: "optional",
    tasasItbis: [1, 2, 3],
    isrRetenidoObligatorio: false,
  },
  "34": {
    code: "34",
    label: "Nota de Crédito Electrónica",
    // El ESQUEMA los deja opcionales. Que DermaLand los exija es una regla de
    // negocio y vive abajo, en `REGLAS_DE_NEGOCIO`, no aquí.
    comprador: "optional",
    rncComprador: "optional",
    razonSocialComprador: "optional",
    identificadorExtranjero: "optional",
    paisComprador: "forbidden",
    itbis: "optional",
    montoExento: "optional",
    retenciones: "optional",
    impuestosAdicionales: "optional",
    informacionesAdicionales: "optional",
    transporte: "optional",
    descuentosORecargos: "optional",
    informacionReferencia: "required",
    fechaVencimientoSecuencia: "forbidden",
    tipoIngresos: "optional",
    indicadorNotaCredito: "required",
    formasPago: "forbidden",
    retencionEnItem: "optional",
    tasasItbis: [1, 2, 3],
    isrRetenidoObligatorio: false,
  },
  "41": {
    code: "41",
    label: "Compras Electrónico",
    // Lo emite el COMPRADOR sobre una compra a quien no da comprobante. Por eso
    // su RNC es obligatorio: es quien lo está emitiendo.
    comprador: "required",
    rncComprador: "required",
    razonSocialComprador: "required",
    identificadorExtranjero: "forbidden",
    paisComprador: "forbidden",
    itbis: "optional",
    montoExento: "optional",
    // Aquí SÍ hay retención: es su razón de ser.
    retenciones: "optional",
    impuestosAdicionales: "forbidden",
    informacionesAdicionales: "forbidden",
    transporte: "forbidden",
    descuentosORecargos: "optional",
    informacionReferencia: "optional",
    fechaVencimientoSecuencia: "required",
    tipoIngresos: "forbidden",
    indicadorNotaCredito: "forbidden",
    formasPago: "optional",
    retencionEnItem: "required",
    tasasItbis: [1, 2, 3],
    isrRetenidoObligatorio: false,
  },
  "43": {
    code: "43",
    label: "Gastos Menores Electrónico",
    // **No lleva comprador.** Es un gasto propio, no una venta a nadie.
    comprador: "forbidden",
    rncComprador: "forbidden",
    razonSocialComprador: "forbidden",
    identificadorExtranjero: "forbidden",
    paisComprador: "forbidden",
    // Sin ITBIS: el esquema no trae ni un campo de gravado.
    itbis: "forbidden",
    montoExento: "optional",
    retenciones: "forbidden",
    impuestosAdicionales: "forbidden",
    informacionesAdicionales: "forbidden",
    transporte: "forbidden",
    descuentosORecargos: "forbidden",
    informacionReferencia: "optional",
    fechaVencimientoSecuencia: "required",
    tipoIngresos: "forbidden",
    indicadorNotaCredito: "forbidden",
    formasPago: "forbidden",
    retencionEnItem: "forbidden",
    tasasItbis: [],
    isrRetenidoObligatorio: false,
  },
  "44": {
    code: "44",
    label: "Regímenes Especiales Electrónico",
    comprador: "required",
    // Puede ser extranjero, así que el RNC no se exige.
    rncComprador: "optional",
    razonSocialComprador: "required",
    identificadorExtranjero: "optional",
    paisComprador: "forbidden",
    // El régimen especial es exento: no hay gravado ni ITBIS.
    itbis: "forbidden",
    montoExento: "optional",
    retenciones: "forbidden",
    impuestosAdicionales: "optional",
    informacionesAdicionales: "optional",
    transporte: "optional",
    descuentosORecargos: "optional",
    informacionReferencia: "optional",
    fechaVencimientoSecuencia: "required",
    tipoIngresos: "required",
    indicadorNotaCredito: "forbidden",
    formasPago: "optional",
    retencionEnItem: "forbidden",
    tasasItbis: [],
    isrRetenidoObligatorio: false,
  },
  "45": {
    code: "45",
    label: "Gubernamental Electrónico",
    comprador: "required",
    // El Estado siempre tiene RNC.
    rncComprador: "required",
    razonSocialComprador: "required",
    identificadorExtranjero: "forbidden",
    paisComprador: "forbidden",
    itbis: "optional",
    montoExento: "optional",
    retenciones: "forbidden",
    impuestosAdicionales: "optional",
    informacionesAdicionales: "optional",
    transporte: "optional",
    descuentosORecargos: "optional",
    informacionReferencia: "optional",
    fechaVencimientoSecuencia: "required",
    tipoIngresos: "required",
    indicadorNotaCredito: "forbidden",
    formasPago: "optional",
    retencionEnItem: "forbidden",
    tasasItbis: [1, 2, 3],
    isrRetenidoObligatorio: false,
  },
  "46": {
    code: "46",
    label: "Exportaciones Electrónico",
    comprador: "required",
    rncComprador: "optional",
    razonSocialComprador: "required",
    identificadorExtranjero: "optional",
    // El único tipo con país del comprador.
    paisComprador: "optional",
    // Solo ITBIS3 (tasa cero): una exportación no lleva ITBIS local.
    itbis: "optional",
    // **Prohibido**: en una exportación no hay «exento», hay tasa cero.
    montoExento: "forbidden",
    retenciones: "forbidden",
    impuestosAdicionales: "forbidden",
    informacionesAdicionales: "optional",
    transporte: "optional",
    descuentosORecargos: "optional",
    informacionReferencia: "optional",
    fechaVencimientoSecuencia: "required",
    tipoIngresos: "required",
    indicadorNotaCredito: "forbidden",
    formasPago: "optional",
    retencionEnItem: "forbidden",
    tasasItbis: [3],
    isrRetenidoObligatorio: false,
  },
  "47": {
    code: "47",
    label: "Pagos al Exterior Electrónico",
    // El beneficiario de fuera puede no identificarse como comprador.
    comprador: "optional",
    rncComprador: "forbidden",
    razonSocialComprador: "optional",
    identificadorExtranjero: "optional",
    paisComprador: "forbidden",
    itbis: "forbidden",
    montoExento: "optional",
    // Solo ISR: es una retención por pago al exterior.
    retenciones: "optional",
    impuestosAdicionales: "forbidden",
    informacionesAdicionales: "forbidden",
    transporte: "optional",
    descuentosORecargos: "forbidden",
    informacionReferencia: "optional",
    fechaVencimientoSecuencia: "required",
    tipoIngresos: "forbidden",
    indicadorNotaCredito: "forbidden",
    formasPago: "optional",
    retencionEnItem: "required",
    tasasItbis: [],
    isrRetenidoObligatorio: true,
  },
};

/**
 * Donde DermaLand es MÁS estricto que el esquema, y por qué.
 *
 * Los dos niveles se separan a propósito. `ECF_TYPE_RULES` dice lo que la DGII
 * acepta —y hay una prueba que lo compara contra los XSD oficiales, así que no
 * se puede falsear—. Esto de aquí dice lo que además exigimos nosotros.
 *
 * Mezclarlos fue justo el error que había en el builder anterior: exigía el RNC
 * del comprador en las notas 33 y 34 como si lo mandara el esquema, cuando el
 * esquema lo deja opcional. Escrito así, cualquiera ve qué es norma y qué es
 * decisión de la casa — y puede discutir la segunda sin tocar la primera.
 */
export const REGLAS_DE_NEGOCIO: Record<
  string,
  Partial<Record<keyof EcfTypeRules, { presence: Presence; why: string }>>
> = {
  "33": {
    rncComprador: {
      presence: "required",
      why: "Una nota de débito corrige una factura de crédito fiscal, y esa lleva el RNC del comprador. Sin él no se puede casar con lo que modifica.",
    },
  },
  "34": {
    rncComprador: {
      presence: "required",
      why: "Una nota de crédito corrige una factura de crédito fiscal, y esa lleva el RNC del comprador. Sin él no se puede casar con lo que modifica.",
    },
  },
};

/** Las reglas efectivas: el esquema, endurecido por lo que exige la casa. */
export function effectiveRulesFor(code: string): EcfTypeRules {
  const base = rulesFor(code);
  const extra = REGLAS_DE_NEGOCIO[code];
  if (!extra) return base;
  const salida = { ...base };
  for (const [campo, regla] of Object.entries(extra)) {
    (salida as Record<string, unknown>)[campo] = regla!.presence;
  }
  return salida;
}

export const ALL_ECF_TYPES = Object.keys(ECF_TYPE_RULES);

export class UnknownEcfType extends Error {
  constructor(code: string) {
    super(`Tipo e-CF desconocido: «${code}».`);
    this.name = "UnknownEcfType";
  }
}

/** Las reglas de un tipo. **Falla si no existe**, en vez de dar las del 31. */
export function rulesFor(code: string): EcfTypeRules {
  const r = ECF_TYPE_RULES[code];
  if (!r) throw new UnknownEcfType(code);
  return r;
}

export function isKnownEcfType(code: string): boolean {
  return code in ECF_TYPE_RULES;
}

export function ecfTypeLabel(code: string): string {
  return ECF_TYPE_RULES[code]?.label ?? `Tipo ${code}`;
}

export interface RuleViolation {
  field: string;
  problem: "faltante" | "prohibido";
  message: string;
}

/**
 * ¿Encaja lo que traemos con lo que admite este tipo?
 *
 * Se comprueba ANTES de construir el XML. Un campo prohibido lo rechazaría el
 * XSD con un mensaje del validador que nadie sabe leer; aquí se dice en
 * castellano y con el nombre del tipo delante.
 *
 * `present` dice qué trae la entrada, sin importar de dónde salga.
 */
export function checkTypeRules(
  code: string,
  present: {
    comprador?: boolean;
    rncComprador?: boolean;
    razonSocialComprador?: boolean;
    identificadorExtranjero?: boolean;
    paisComprador?: boolean;
    itbis?: boolean;
    montoExento?: boolean;
    retenciones?: boolean;
    impuestosAdicionales?: boolean;
    informacionReferencia?: boolean;
  },
): RuleViolation[] {
  const r = effectiveRulesFor(code);
  const violaciones: RuleViolation[] = [];

  const revisar = (
    campo: keyof typeof present,
    presencia: Presence,
    etiqueta: string,
  ) => {
    const hay = present[campo] === true;
    if (presencia === "required" && !hay) {
      violaciones.push({
        field: campo,
        problem: "faltante",
        message: `${r.label} exige ${etiqueta}.`,
      });
    }
    if (presencia === "forbidden" && hay) {
      violaciones.push({
        field: campo,
        problem: "prohibido",
        message: `${r.label} no admite ${etiqueta}.`,
      });
    }
  };

  revisar("comprador", r.comprador, "los datos del comprador");
  revisar("rncComprador", r.rncComprador, "el RNC del comprador");
  revisar("razonSocialComprador", r.razonSocialComprador, "la razón social del comprador");
  revisar("identificadorExtranjero", r.identificadorExtranjero, "un identificador extranjero");
  revisar("paisComprador", r.paisComprador, "el país del comprador");
  revisar("itbis", r.itbis, "montos gravados ni ITBIS");
  revisar("montoExento", r.montoExento, "monto exento");
  revisar("retenciones", r.retenciones, "retenciones");
  revisar("impuestosAdicionales", r.impuestosAdicionales, "impuestos adicionales");
  revisar("informacionReferencia", r.informacionReferencia, "la referencia al comprobante que modifica");

  return violaciones;
}
