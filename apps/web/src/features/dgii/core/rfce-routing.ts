import { RFCE_MONTO_MAXIMO } from "./builders/rfce";

/**
 * v499 — Íntegro o resumen: la regla que decide por dónde sale una Factura de Consumo.
 *
 * DGII no recibe todas las facturas de consumo por el mismo lugar. Una E32 por debajo de
 * RD$250,000 no se envía completa: se envía un **resumen (RFCE)** a un host distinto
 * (`fc.dgii.gov.do/{ambiente}/recepcionfc`), mientras que la E32 que llega al tope y todos
 * los demás tipos van íntegros a `ecf.dgii.gov.do/{ambiente}/recepcion`.
 *
 * Esto no era un problema mientras sólo se certificaba: los casos de prueba venían ya
 * clasificados en la hoja oficial de DGII, así que nadie tuvo que calcular el umbral. En
 * una venta real no hay hoja que consultar, y sin esta decisión el comprobante sale
 * completo hacia el endpoint que espera un resumen.
 *
 * Para un spa el caso normal ES el resumen: ninguna sesión de láser llega a RD$250,000.
 *
 * ── Por qué una función pura y no un `if` en el preparador ──────────────────
 * Porque la misma pregunta la van a hacer el preparador, el emisor, la representación
 * impresa (el QR cambia de servicio y de cantidad de parámetros) y cualquier reporte que
 * quiera decir «esta salió como resumen». Con la regla en un solo lugar, el día que DGII
 * mueva el umbral se corrige una vez.
 *
 * El tope se IMPORTA del builder RFCE, que es su dueño canónico y lo hace cumplir al
 * construir. No se redeclara acá. (`official-dataset.ts` tiene una segunda copia del mismo
 * número, documentada como deuda en `docs/planning/V498_ESTUDIO_L10N_DO_EDI.md`; no se
 * consolida sin autorización.)
 */

/** Cómo sale el comprobante y a qué servicio de DGII. */
export type EcfDelivery = {
  /** `ecf` = comprobante completo · `rfce` = resumen del E32 bajo el tope. */
  kind: "ecf" | "rfce";
  /** Servicio de recepción de DGII: `recepcion` (ecf.dgii) o `recepcionfc` (fc.dgii). */
  channel: "recepcion" | "recepcionfc";
  /** Explicación en español, para mensajes y auditoría. Nunca un código suelto. */
  reason: string;
};

export type ResolveEcfDeliveryInput = {
  tipoEcf: string;
  /**
   * Total del comprobante **en pesos dominicanos**.
   *
   * El tope de DGII está en DOP. Si algún día se factura en otra moneda hay que convertir
   * ANTES de llamar acá: una factura de USD 8,333 parece menor al tope y equivale a unos
   * RD$500,000 — no es resumen. Hoy AgendApp factura en pesos, así que el llamador ya
   * pasa DOP; queda dicho para que no se rompa en silencio el día que cambie.
   */
  montoTotalDop: number;
};

/**
 * Decide si un comprobante sale íntegro o como resumen.
 *
 * El umbral es ESTRICTO (`< 250,000`): una factura de exactamente RD$250,000 va íntegra.
 * Así lo exige el builder RFCE al construir, y así se mantiene acá para que la decisión y
 * la construcción no puedan discrepar.
 */
/**
 * v584 — ¿Este comprobante se envía como RESUMEN? La condición, en un solo sitio.
 *
 * El tope nunca pudo divergir —`official-dataset.ts` re-exporta esta misma constante— pero
 * la CONDICIÓN sí estaba escrita dos veces: aquí, que decide a qué servicio se envía, y en
 * `simulation-ri.ts`, que decide a dónde apunta el QR impreso. El día que la regla cambie y
 * sólo se toque una, el comprobante se manda a un sitio y su QR apunta a otro: la clienta
 * escanea y no encuentra nada.
 *
 * Devuelve `false` ante un total inutilizable en vez de lanzar, porque el generador del QR
 * trabaja sobre un XML ya firmado y no puede permitirse reventar al imprimir. `resolveEcfDelivery`
 * sí lanza: allí todavía se está a tiempo de no mandar nada.
 */
export function esResumenRfce(input: ResolveEcfDeliveryInput): boolean {
  const { tipoEcf, montoTotalDop } = input;
  if (tipoEcf !== "32") return false;
  if (!Number.isFinite(montoTotalDop) || montoTotalDop < 0) return false;
  return montoTotalDop < RFCE_MONTO_MAXIMO;
}

export function resolveEcfDelivery(input: ResolveEcfDeliveryInput): EcfDelivery {
  const { tipoEcf, montoTotalDop } = input;

  if (tipoEcf !== "32") {
    return {
      kind: "ecf",
      channel: "recepcion",
      reason: `El tipo ${tipoEcf} siempre se envía completo; el resumen RFCE existe sólo para la Factura de Consumo (32).`,
    };
  }

  // Un total que no es un número utilizable no se resuelve por defecto a «íntegro»: eso
  // mandaría el comprobante al servicio equivocado sin que nadie se entere. Se rechaza.
  if (!Number.isFinite(montoTotalDop) || montoTotalDop < 0) {
    throw new RangeError(
      `No se puede decidir íntegro o resumen sin un total válido en RD$ (recibido: ${String(montoTotalDop)}).`,
    );
  }

  if (esResumenRfce(input)) {
    return {
      kind: "rfce",
      channel: "recepcionfc",
      reason: `Factura de consumo por RD$${montoTotalDop.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, bajo el tope de RD$${RFCE_MONTO_MAXIMO.toLocaleString("es-DO")}: se envía como resumen (RFCE) a recepcionfc.`,
    };
  }

  return {
    kind: "ecf",
    channel: "recepcion",
    reason: `Factura de consumo por RD$${montoTotalDop.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, desde el tope de RD$${RFCE_MONTO_MAXIMO.toLocaleString("es-DO")}: se envía completa y exige RNC del comprador.`,
  };
}

export { RFCE_MONTO_MAXIMO };
