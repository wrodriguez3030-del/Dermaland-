/**
 * Puerta de 2FA (B-04).
 *
 * El middleware confundía dos cosas distintas:
 *   - TENER un factor verificado   → `nextLevel === "aal2"`
 *   - HABERLO USADO en esta sesión → `currentLevel === "aal2"`
 *
 * Sólo exigía la segunda, de modo que un administrador que nunca escaneó el QR
 * no veía jamás un prompt: 2FA existía sin proteger a nadie. Para los roles
 * obligados ahora se exigen las dos.
 *
 * El fail-open se conserva para el resto de roles (un fallo del chequeo no debe
 * dejar a un cajero fuera del POS a mitad de un turno) y se retira para quien
 * está obligado, donde una cuenta comprometida cuesta más que el inconveniente.
 *
 * La decisión vive aquí, PURA, y no dentro del middleware, porque es la que
 * puede dejar sin acceso a los dos únicos administradores del sistema: tiene
 * que poderse verificar caso por caso sin levantar un servidor ni simular
 * Supabase. El middleware sólo la consulta y actúa.
 */

/** Nivel de garantía de autenticación (Supabase Auth). `null` = indeterminado. */
export type NivelAal = "aal1" | "aal2" | null | undefined;

export type DecisionMfa =
  /** Dejar pasar. */
  | "permitir"
  /** No tiene factor y le es obligatorio → `/perfil/seguridad`. */
  | "enrolar"
  /** Tiene factor pero la sesión sigue en aal1 → `/login/mfa`. */
  | "desafiar";

/**
 * Roles a los que 2FA les es OBLIGATORIO.
 *
 * `super_admin` entra junto a `admin` porque un rol con más poder que el
 * administrador saltándose la puerta anularía la puerta entera. El resto de
 * roles (`manager`, `cashier`, `inventory`, `supervisor`, `auditor`,
 * `vendedor`) conservan 2FA como opcional: ampliar esta lista es exactamente
 * el cambio que deja gente fuera del sistema, así que se hace a propósito y
 * avisando, nunca de rebote.
 */
export const ROLES_CON_2FA_OBLIGATORIO: ReadonlySet<string> = new Set([
  "admin",
  "super_admin",
]);

/**
 * ¿A este usuario le es obligatorio el segundo factor?
 *
 * `is_platform_admin` cuenta aparte del rol: el súper administrador de la
 * plataforma cruza todos los negocios y puede no llevar `role: "super_admin"`.
 * Comparación ESTRICTA con `true` (SEC-001): el claim tiene que ser el booleano
 * real de `app_metadata`, no un `"true"` de texto colado desde cualquier parte.
 *
 * El rol se normaliza (recorte + minúsculas) para que un `"Admin"` no se cuele
 * como no obligado: aquí una discrepancia de mayúsculas no molesta, abre una
 * puerta en silencio.
 */
export function requiere2fa(params: {
  role?: string | null;
  isPlatformAdmin?: boolean | null;
}): boolean {
  if (params.isPlatformAdmin === true) return true;
  const role =
    typeof params.role === "string" ? params.role.trim().toLowerCase() : "";
  return ROLES_CON_2FA_OBLIGATORIO.has(role);
}

/**
 * Normaliza lo que devuelve Supabase a un nivel que sepamos interpretar.
 *
 * El tipo de `@supabase/auth-js` es una unión ABIERTA (`"aal1" | "aal2" |
 * (string & {})`): mañana puede aparecer un nivel nuevo. Un valor que no
 * reconocemos no es "aal1" —eso sería inventarnos que la sesión es débil— sino
 * `null`, indeterminado, que la puerta trata como chequeo fallido y resuelve
 * según el rol.
 */
export function nivelAal(valor: unknown): NivelAal {
  return valor === "aal1" || valor === "aal2" ? valor : null;
}

/**
 * Corrige `nextLevel` con la lista de factores RECIÉN leída del servidor.
 *
 * `getAuthenticatorAssuranceLevel()` deriva `nextLevel` de la sesión guardada
 * en la galleta, que puede ser anterior al enrolamiento: quien activó 2FA en el
 * teléfono seguiría figurando "sin factor" en la laptop hasta que el token se
 * refresque. Con la puerta cerrada eso no es un detalle cosmético — es un
 * administrador dando vueltas por `/perfil/seguridad` mientras la página le
 * dice que su 2FA está activa.
 *
 * `middleware.ts` ya llama a `supabase.auth.getUser()`, que sí va al servidor,
 * así que la lista fresca sale gratis. Sólo puede AÑADIR certeza de que hay
 * factor, nunca quitarla: `factors` es opcional en la respuesta y su ausencia
 * no distingue "no tiene" de "no vino".
 */
export function nivelSiguienteConFactores(
  nextLevel: NivelAal,
  factors:
    | ReadonlyArray<{ status?: string | null } | null | undefined>
    | null
    | undefined,
): NivelAal {
  if (Array.isArray(factors) && factors.some((f) => f?.status === "verified")) {
    return "aal2";
  }
  return nextLevel;
}

/**
 * Qué hacer con esta petición.
 *
 * `chequeoFallo` = no sabemos en qué nivel está la sesión (el chequeo lanzó, o
 * devolvió niveles nulos). Para quien NO está obligado se deja pasar; para
 * quien SÍ lo está no se deja pasar, pero se le manda a un sitio con salida:
 * si consta que tiene factor, al desafío —que puede completar y entrar—, y si
 * no, a la página de seguridad. Nunca a una pantalla sin acción posible.
 */
export function mfaGateDecision(params: {
  role: string | null | undefined;
  isPlatformAdmin?: boolean | null;
  currentLevel: NivelAal;
  nextLevel: NivelAal;
  chequeoFallo: boolean;
}): DecisionMfa {
  const { currentLevel, nextLevel, chequeoFallo } = params;
  const obligado = requiere2fa(params);
  const tieneFactor = nextLevel === "aal2";
  const yaLoUso = currentLevel === "aal2";

  if (chequeoFallo) {
    if (!obligado) return "permitir";
    return tieneFactor ? "desafiar" : "enrolar";
  }

  if (tieneFactor && !yaLoUso) return "desafiar";
  if (!tieneFactor && obligado) return "enrolar";
  return "permitir";
}
