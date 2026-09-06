/**
 * v574 — `IndicadorMontoGravado` (IdDoc): el campo por el que la DGII rechazó el primer
 * comprobante gravado que este sistema emitió de verdad.
 *
 * ── El rechazo, textual ──────────────────────────────────────────────────────────────
 * DGII, 23/08/2026 1:29:57 PM AST, sobre `E410000000001` (TrackId
 * `1a7b615e-077c-4520-b667-45cd8acf9e6d`):
 *
 *   «[176] El campo IndicadorMontoGravado del área IdDoc de la sección Encabezado
 *    no es válido»
 *
 * ── Por qué tardó tanto en aparecer ──────────────────────────────────────────────────
 * Los trece comprobantes que este negocio había emitido antes tienen `TotalITBIS = 0`:
 * un spa que factura servicios exentos. El E41 fue el PRIMERO con ITBIS ≠ 0, y el
 * primero rechazado. Así que el defecto nunca fue «del tipo 41»: el día que se venda un
 * producto gravado, la factura de venta sale con el mismo hueco.
 *
 * ── La regla ya estaba escrita, en el sitio donde no hacía falta ─────────────────────
 * v413 la dedujo de los XSD oficiales y dejó en `official-dataset-fidelity.ts` una
 * función pura que la comprueba. Pero la cableó sólo en el camino de CERTIFICACIÓN, que
 * toma el valor del Excel oficial y por eso jamás falló. El camino de producción
 * —`invoice-prepare.ts` → `buildEcfXml`— nunca puso el campo, y nadie lo comprobaba.
 * Este módulo es la fuente única de la regla, para los dos caminos.
 *
 * ── Qué significa el valor ───────────────────────────────────────────────────────────
 * «0» = el monto declarado NO lleva el impuesto incluido. Es lo que el builder construye
 * siempre: `MontoItem = precio·cantidad − descuento` y el ITBIS se suma aparte
 * (`builder.ts:82-84`). Si algún día las líneas pasaran a declararse con el impuesto
 * dentro, este es el punto que hay que cambiar —y `montoItemLlevaItbisIncluido` es el
 * argumento que lo dice, para que el cambio no se haga por descuido.
 *
 * Sin I/O: se puede probar entero.
 */

/** Tipos cuyo XSD DECLARA el elemento → tiene que ir presente y valer "0" o "1". */
export const TIPOS_QUE_DECLARAN_INDICADOR_MONTO_GRAVADO: ReadonlySet<string> = new Set([
  "31",
  "32",
  "33",
  "34",
  "41",
  "45",
]);

/** Tipos cuyo XSD NO lo declara → emitirlo sería un nodo ilegal para su esquema. */
export const TIPOS_SIN_INDICADOR_MONTO_GRAVADO: ReadonlySet<string> = new Set(["43", "44", "46", "47"]);

/** Valores del enum. Nunca por truthiness: "0" es un valor legítimo, no un vacío. */
export const VALORES_INDICADOR_MONTO_GRAVADO: ReadonlySet<string> = new Set(["0", "1"]);

/**
 * Qué `IndicadorMontoGravado` corresponde a un comprobante, o `undefined` si su XSD no
 * admite el campo. `undefined` —y no `null`— porque es lo que el builder omite.
 */
export function indicadorMontoGravadoPara(
  tipoEcf: string,
  opciones?: { montoItemLlevaItbisIncluido?: boolean },
): "0" | "1" | undefined {
  if (!TIPOS_QUE_DECLARAN_INDICADOR_MONTO_GRAVADO.has(tipoEcf)) return undefined;
  return opciones?.montoItemLlevaItbisIncluido ? "1" : "0";
}
