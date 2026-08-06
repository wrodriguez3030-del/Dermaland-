// ¿Va como Factura de Consumo completa o como Resumen?
//
// QUÉ ES EL RFCE Y POR QUÉ IMPORTA TANTO AQUÍ
//
// El **Resumen de Factura de Consumo Electrónica** es la forma en que la DGII
// recibe las ventas de consumo por debajo de cierto monto: en vez del e-CF 32
// entero, se transmite un resumen. Está en las Normas Generales 07-2018 y
// 10-2018 y tiene su propio esquema, «RFCE 32 v1.0».
//
// Para una farmacia esto **no es un caso raro: es el camino normal**. Casi toda
// venta de mostrador a consumidor final cae por debajo del umbral. Tratar el
// RFCE como la excepción sería tener bien resuelto lo que casi nunca pasa.
//
// EL UMBRAL, VERIFICADO
//
// La DGII lo describe como «Facturas de Consumo Electrónicas **menores a**
// DOP$250 mil». «Menores a» es estrictamente menor: **250 000,00 exactos NO son
// menores a 250 000**, así que a ese importe corresponde el e-CF 32 completo.
//
// Fuentes consultadas el 2026-08-04:
//   · dgii.gov.do — Documentación sobre e-CF, «Formato Resumen Factura Consumo
//     Electrónica v1.0».
//   · ayuda.dgii.gov.do — respuesta oficial: «Facturas de Consumo Electrónicas
//     menores a DOP$250 mil».
//
// HACIA DÓNDE SE FALLA
//
// En el límite y ante cualquier duda, **se manda el comprobante COMPLETO**.
// Enviar un e-CF entero donde bastaba un resumen es enviar información de más:
// la DGII la tiene toda. Enviar un resumen donde hacía falta el completo es
// informar de menos, y eso ya es un problema con la DGII.
//
// Por eso `decideConsumoFormat` empuja al completo cuando el importe no se
// puede leer, y no al revés.

/**
 * El umbral, en pesos. **Un solo sitio en todo el sistema.**
 *
 * Si algún día cambia la norma, cambia aquí y en ningún otro lado. Un número
 * fiscal repetido en tres archivos es un número que acabará valiendo tres cosas
 * distintas.
 */
export const RFCE_AMOUNT_LIMIT = 250_000;

/**
 * Sobre qué importe se compara.
 *
 * Se usa el **monto total del comprobante** —lo que paga el cliente, con ITBIS
 * incluido—, que es la lectura natural de «facturas menores a DOP$250 mil».
 *
 * ⚠️ La DGII no detalla en la documentación pública consultada si la
 * comparación va sobre el monto total o sobre otro subtotal. **Es uno de los dos
 * puntos que el contador tiene que confirmar antes de emitir de verdad**; el
 * otro es el comportamiento en el límite exacto. Mientras tanto, la elección
 * hecha aquí es la que informa de más y nunca de menos.
 */
export type ConsumoFormat = "rfce" | "ecf32";

export interface ConsumoFormatDecision {
  format: ConsumoFormat;
  /** El importe con el que se decidió, ya redondeado a dos decimales. */
  amount: number;
  /** Para la pantalla y la auditoría. Nunca un número suelto sin explicar. */
  reason: string;
}

/** Dos decimales, como el resto del sistema (`cart-line.ts`). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Resumen o comprobante completo.
 *
 * `amount` se redondea a dos decimales ANTES de comparar. Sin eso, un total que
 * arrastra `249999.99999999997` de una suma de flotantes decidiría distinto que
 * el mismo importe escrito a mano, y el mismo carrito daría un formato distinto
 * según cómo se hubiera calculado.
 */
export function decideConsumoFormat(amount: number): ConsumoFormatDecision {
  if (!Number.isFinite(amount)) {
    // No se puede leer el importe. Se manda el completo: informar de más nunca
    // es el problema.
    return {
      format: "ecf32",
      amount: 0,
      reason:
        "No se pudo determinar el monto; se emite la Factura de Consumo completa.",
    };
  }

  const monto = round2(amount);

  // ESTRICTAMENTE MENOR. «Menores a DOP$250 mil»: 250 000,00 exactos no son
  // menores a 250 000.
  if (monto < RFCE_AMOUNT_LIMIT) {
    return {
      format: "rfce",
      amount: monto,
      reason: `Monto menor a ${RFCE_AMOUNT_LIMIT.toLocaleString("es-DO")}: se transmite el Resumen de Factura de Consumo.`,
    };
  }

  return {
    format: "ecf32",
    amount: monto,
    reason: `Monto de ${RFCE_AMOUNT_LIMIT.toLocaleString("es-DO")} o más: se transmite la Factura de Consumo completa.`,
  };
}

/** ¿Este comprobante va como resumen? Atajo para leer mejor en las pantallas. */
export function usesRfce(amount: number): boolean {
  return decideConsumoFormat(amount).format === "rfce";
}

/**
 * El RFCE **solo existe para la Factura de Consumo (32)**.
 *
 * Preguntarlo para un 31 —crédito fiscal— o para una nota no es un caso
 * límite: es una confusión, y devolver «no» en silencio la escondería. Por eso
 * esto es una comprobación explícita que el llamador tiene que hacer antes.
 */
export function isRfceEligibleType(tipoEcf: string): boolean {
  return tipoEcf === "32";
}
