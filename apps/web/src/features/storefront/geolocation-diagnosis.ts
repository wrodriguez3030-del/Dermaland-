/**
 * Por QUÉ se negó la ubicación.
 *
 * `PERMISSION_DENIED` del navegador es un solo código para dos situaciones que
 * se arreglan en sitios distintos:
 *
 *  - el navegador tiene bloqueada la ubicación PARA ESTA PÁGINA (se arregla en
 *    el icono a la izquierda de la barra de direcciones), o
 *  - el sistema operativo no le deja usar la ubicación AL NAVEGADOR ENTERO —en
 *    un Mac, Configuración del Sistema → Privacidad y seguridad→ Localización—,
 *    y entonces la página ni siquiera llega a preguntar.
 *
 * El segundo caso es el que desconcierta: no aparece ningún diálogo, no hay
 * nada que aceptar, y el mensaje genérico «no diste permiso» acusa al cliente
 * de algo que no hizo. Peor: lo manda a buscar un permiso que en esa pantalla
 * no existe.
 *
 * Se distinguen mirando el estado del permiso ANTES y DESPUÉS del intento:
 * el navegador anota la decisión del usuario, el sistema operativo no. Si tras
 * el fallo el permiso sigue en «preguntar», nunca hubo decisión que anotar —el
 * bloqueo viene de más abajo—.
 */

/** Estado del permiso, o `desconocido` donde `navigator.permissions` no exista. */
export type EstadoPermiso = "granted" | "denied" | "prompt" | "desconocido";

/** Dónde hay que ir a arreglarlo. */
export type CulpableDeLaNegacion = "navegador" | "sistema";

export function diagnosticarNegacion(
  antes: EstadoPermiso,
  despues: EstadoPermiso,
): CulpableDeLaNegacion {
  // El permiso sigue en «preguntar» después de un rechazo: nadie decidió nada,
  // así que el navegador nunca llegó a preguntar. Lo bloquea el sistema.
  if (antes === "prompt" && despues === "prompt") return "sistema";

  // Todo lo demás —bloqueado de antes, bloqueado justo ahora al pulsar
  // «Bloquear», o sin `navigator.permissions` para saberlo— apunta al
  // navegador. Es el caso común, y su remedio (mirar el icono de la barra de
  // direcciones) es inofensivo aunque la causa fuera otra; mandar a alguien a
  // hurgar en la configuración del sistema para nada sale mucho más caro.
  return "navegador";
}
