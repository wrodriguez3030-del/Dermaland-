/**
 * Respuestas de DGII que NO se arreglan reintentando — v533, extraído en v550.
 *
 * ── Por qué vive aquí y no dentro de `submission-service.ts` ────────────────
 * Nació ahí, en el camino de ENVÍO. Pero el camino de PREPARACIÓN —el que reserva el
 * e-NCF— también necesita saberlo, y `submission-service` arrastra almacenamiento y cliente
 * HTTP de DGII: importarlo desde el punto de venta habría cargado toda esa cadena.
 *
 * Es el mismo movimiento que hizo v530 con `killswitches.ts`: **una sola definición, varios
 * consumidores**, en un módulo puro sin dependencias.
 *
 * ── Qué problema resuelve saberlo antes de reservar ─────────────────────────
 * Desde el 6 de agosto de 2026 DGII rechaza cada envío con «El RNC … del certificado no
 * está delegado para realizar transacciones». Eso no es un tropiezo de red: hasta que el
 * dueño no delegue el certificado en la Oficina Virtual, ningún reintento va a salir.
 *
 * Mientras tanto, con la emisión real encendida, **cada venta reservaba un número fiscal
 * que no podía usarse**. Se quemaron 10 del rango E32 (E320000000001 a E320000000010,
 * ninguno con TrackId), y los huecos en la secuencia son exactamente lo que DGII revisa.
 */

/**
 * Se reconocen por el TEXTO de DGII porque el código HTTP no alcanza: el mismo 400 puede
 * ser un XML mal armado —que se corrige y sale— o una configuración pendiente.
 */
export const ESTOS_NO_SE_ARREGLAN_REINTENTANDO: RegExp[] = [
  /no est[áa] delegado/i, // «El RNC … del certificado no está delegado para realizar transacciones.»
  /tipo de certificado no admitido/i,
  /certificado.*(vencido|expirado|revocado)/i,
  /contribuyente no autorizado/i,
  /no autorizado para emitir/i,
];

/**
 * ¿Este mensaje de DGII describe una configuración pendiente?
 *
 * Ante la duda devuelve `false`: un mensaje desconocido se trata como tropiezo y se
 * reintenta. Equivocarse hacia el `true` pararía la facturación de un negocio por un error
 * pasajero, que es mucho peor que quemar un número.
 */
export function esBloqueanteDeConfiguracion(mensaje: string | null | undefined): boolean {
  if (typeof mensaje !== "string" || !mensaje.trim()) return false;
  return ESTOS_NO_SE_ARREGLAN_REINTENTANDO.some((re) => re.test(mensaje));
}

/**
 * Qué decirle a quien está cobrando. En pantalla, no en un registro que nadie abre.
 *
 * Dice **qué pasó y qué hacer** (regla 32), y deja claro lo único que de verdad importa en
 * ese momento: que el cobro sigue su curso.
 */
export const AVISO_EMISION_EN_PAUSA =
  "Emisión fiscal en pausa: DGII rechaza los envíos porque el certificado no está " +
  "delegado en la Oficina Virtual. La venta se cobra igual, sin comprobante fiscal. " +
  "Para reanudarla: Oficina Virtual → Delegaciones de e-CF → Delegación de Roles, con rol de firmante.";
