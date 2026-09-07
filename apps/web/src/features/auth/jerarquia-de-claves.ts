/**
 * Quién puede fijar y VER la clave de quién.
 *
 * El rol solo dice si alguien entra al panel de usuarios; no dice si puede
 * apoderarse de la cuenta del de al lado. Sin esta jerarquía, cualquier
 * administrador podría reiniciarle la clave al dueño —o leérsela con el ojo— y
 * entrar como él. En un sistema donde el ojo enseña claves en claro, eso no es
 * una posibilidad teórica: es el primer atajo que encuentra quien quiera.
 *
 * Las reglas, en orden:
 *
 *   1. Uno mismo, siempre. Nadie se queda fuera de su propia cuenta.
 *   2. Un administrador, sobre quien NO es administrador. Es su trabajo.
 *   3. Un administrador, sobre otro administrador: NO. Son pares.
 *   4. El súper administrador, sobre cualquier administrador: sí. Es quien
 *      responde por el sistema.
 *   5. Sobre un súper administrador ajeno: nadie.
 *   6. `manager` nunca, aunque `canManageIncentiveRules` le deje dar de alta
 *      personal: crear una ficha y apoderarse de una cuenta no son lo mismo.
 *
 * Función pura: la misma decisión la toman el servidor (que manda) y la
 * pantalla (que decide si pintar el ojo). Dos copias del criterio acabarían
 * discrepando, y la que discrepa en el lado del servidor es un agujero.
 */

/** Roles que pueden gestionar claves de OTROS. `manager` no está a propósito. */
const ROLES_QUE_GESTIONAN: ReadonlySet<string> = new Set(["admin", "super_admin"]);

/** Roles que cuentan como «administrador» a efectos de quién manda sobre quién. */
const ROLES_ADMINISTRADORES: ReadonlySet<string> = new Set(["admin", "super_admin"]);

export interface ActorClave {
  id: string;
  role: string;
  /** `app_metadata.is_platform_admin === true`. El súper administrador real. */
  isPlatformAdmin: boolean;
}

export interface ObjetivoClave {
  id: string;
  role: string;
  isPlatformAdmin?: boolean;
}

const normalizar = (r: string | null | undefined): string =>
  typeof r === "string" ? r.trim().toLowerCase() : "";

export function puedeGestionarClaveDe(actor: ActorClave, objetivo: ObjetivoClave): boolean {
  // 1. La propia cuenta, siempre.
  if (actor.id && actor.id === objetivo.id) return true;

  const rolActor = normalizar(actor.role);
  const rolObjetivo = normalizar(objetivo.role);
  const actorEsSuper = actor.isPlatformAdmin === true || rolActor === "super_admin";
  const objetivoEsSuper = objetivo.isPlatformAdmin === true || rolObjetivo === "super_admin";

  // Quien no gestiona claves, no gestiona ninguna.
  if (!actorEsSuper && !ROLES_QUE_GESTIONAN.has(rolActor)) return false;

  // 5. Sobre un súper administrador ajeno, nadie. Ni otro súper administrador:
  //    si fueran intercambiables, el papel dejaría de significar algo.
  if (objetivoEsSuper) return false;

  // 4. El súper administrador, sobre cualquiera que no sea otro súper.
  if (actorEsSuper) return true;

  // 3. Administrador sobre administrador: no. 2. Sobre el resto: sí.
  return !ROLES_ADMINISTRADORES.has(rolObjetivo);
}
