import type { UserRole } from "@/types";

/**
 * Quién puede hacer lo que no tiene vuelta atrás.
 *
 * Decisión del dueño (07/09/2026): **borrar y editar —y en general todo lo que
 * implique riesgo operativo— es de administradores.** Una cajera necesita
 * cobrar y consultar; no necesita poder borrar la ficha de un cliente con tres
 * años de historial, y tenerlo a un clic solo añade formas de equivocarse.
 *
 * 🔴 Esto es una guarda de INTERFAZ: quita el botón para que nadie lo pulse por
 * error. NO sustituye al permiso del servidor. Un botón escondido no protege
 * nada frente a alguien que sepa llamar a la API, así que las rutas que borran
 * o editan siguen comprobando el rol por su cuenta.
 */

/** Roles que pueden ejecutar acciones de riesgo. */
const ROLES_CON_RIESGO: ReadonlyArray<UserRole> = ["super_admin", "admin"];

/**
 * ¿Este rol puede borrar, anular o editar algo que otro ya usó?
 *
 * Se pregunta por la ACCIÓN, no por la pantalla: la misma respuesta vale para
 * el listado de clientes, el de productos y cualquier otro, y así no hay dos
 * criterios que se separen con el tiempo.
 */
export function puedeAccionDeRiesgo(role: UserRole): boolean {
  return ROLES_CON_RIESGO.includes(role);
}
