import {
  puedeGestionarClaveDe,
  type ActorClave,
  type ObjetivoClave,
} from "./jerarquia-de-claves";

/**
 * Quién puede BORRAR a quién.
 *
 * Es la misma jerarquía que decide quién puede fijar y ver la clave de quién
 * (`puedeGestionarClaveDe`), a propósito: quien puede apoderarse de una cuenta
 * ya puede hacer todo lo que esa cuenta hace, así que inventar una segunda
 * escala para el borrado solo crearía dos criterios que acabarían discrepando.
 *
 * 🔴 Con UNA diferencia: **la propia cuenta, no**. En la de las claves uno
 * siempre puede con la suya —nadie se queda fuera de su cuenta—; aquí eso es
 * justo lo contrario de lo que hace falta. Un administrador que se borra a sí
 * mismo por error deja el negocio sin quien administre y no hay pantalla desde
 * la que arreglarlo.
 *
 * Función pura: la misma decisión la toman el servidor (que manda) y la
 * pantalla (que decide si pintar el botón). Ofrecer un botón que luego devuelve
 * 403 es peor que no ofrecerlo.
 */
export function puedeEliminarA(actor: ActorClave, objetivo: ObjetivoClave): boolean {
  if (actor.id && actor.id === objetivo.id) return false;
  return puedeGestionarClaveDe(actor, objetivo);
}
