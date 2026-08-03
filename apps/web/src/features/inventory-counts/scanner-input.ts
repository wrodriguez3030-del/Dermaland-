/**
 * Detección de "ráfaga de lector" para el campo de escaneo del inventario físico.
 *
 * Un lector de código de barra actúa como teclado HID: escribe el código
 * completo en milisegundos. Antes, el campo solo enviaba con `Enter`, así que
 * los lectores que NO envían Enter dejaban el código escrito sin contar nada —
 * parecía que el escáner estaba roto. Contar inventario tiene que ser sin
 * manos: cada escaneo suma +1 sin tocar el teclado ni el ratón.
 *
 * Estas funciones son PURAS (reciben el reloj por parámetro) para poder
 * probarlas sin temporizadores ni DOM.
 *
 * Regla: si el texto llegó como ráfaga → se envía solo tras
 * `SCANNER_IDLE_MS` de silencio. Si llegó a velocidad humana → NO se envía
 * solo; ahí el usuario usa `Enter`.
 */

/** Separación máxima entre teclas para considerarlas parte del mismo escaneo. */
export const SCANNER_MAX_GAP_MS = 50;

/** Silencio que cierra el código y dispara el envío automático. */
export const SCANNER_IDLE_MS = 100;

/**
 * Largo mínimo para arriesgar un envío automático. Los códigos reales son
 * EAN-13/UPC-12 o SKU tipo `DERM-I00061`; por debajo de esto es tecleo a medias.
 */
export const SCANNER_MIN_LENGTH = 4;

/** Proporción de intervalos rápidos que exige una ráfaga (el resto tolera un tropiezo). */
const FAST_RATIO = 0.8;

export interface ScanInputState {
  /** Momento de la última entrada, en ms. `null` = todavía no hay teclas. */
  lastAt: number | null;
  /** Intervalos por debajo de `SCANNER_MAX_GAP_MS`. */
  fastGaps: number;
  /** Intervalos por encima (tecleo humano). */
  slowGaps: number;
  /**
   * El campo recibió varios caracteres de golpe (lector que entrega el código
   * completo en un solo evento, o pegado). Se trata como ráfaga.
   */
  bulk: boolean;
}

export function emptyScanInputState(): ScanInputState {
  return { lastAt: null, fastGaps: 0, slowGaps: 0, bulk: false };
}

/**
 * Registra una entrada en el campo.
 *
 * @param addedChars caracteres que sumó este evento (negativo al borrar).
 */
export function recordScanInput(
  state: ScanInputState,
  input: { at: number; addedChars: number },
): ScanInputState {
  const bulk = state.bulk || input.addedChars >= SCANNER_MIN_LENGTH;

  if (state.lastAt === null) {
    return { lastAt: input.at, fastGaps: state.fastGaps, slowGaps: state.slowGaps, bulk };
  }

  const gap = input.at - state.lastAt;
  const fast = gap <= SCANNER_MAX_GAP_MS;
  return {
    lastAt: input.at,
    fastGaps: state.fastGaps + (fast ? 1 : 0),
    slowGaps: state.slowGaps + (fast ? 0 : 1),
    bulk,
  };
}

/**
 * ¿El contenido actual del campo parece venir de un lector?
 *
 * Conservador a propósito: ante la duda responde `false`, porque un falso
 * positivo enviaría un código a medio escribir y contaría el producto
 * equivocado. Un falso negativo solo obliga a presionar `Enter`.
 */
export function isScannerBurst(state: ScanInputState, value: string): boolean {
  if (value.trim().length < SCANNER_MIN_LENGTH) return false;
  if (state.bulk) return true;

  const total = state.fastGaps + state.slowGaps;
  if (total === 0) return false;

  return state.fastGaps / total >= FAST_RATIO;
}
