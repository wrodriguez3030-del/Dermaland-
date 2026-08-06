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

/** Forma mínima de un usuario recién leído del servidor. */
export interface UsuarioConFactores {
  factors?:
    | ReadonlyArray<
        { status?: string | null; factor_type?: string | null } | null | undefined
      >
    | null;
}

/**
 * ¿Consta un factor TOTP VERIFICADO en esta lista?
 *
 * Dos filtros, y los dos son la diferencia entre funcionar y dar vueltas:
 *
 * - **`status === "verified"`**: un enrolamiento abandonado a medias no cuenta.
 *   Mandar a un desafío a quien no tiene nada que verificar es un bucle.
 * - **`factor_type === "totp"`**: `listFactors()` reparte los factores en cubos
 *   por tipo (`GoTrueClient.js:4489-4500`) y la página del desafío lee SÓLO el
 *   cubo `totp` — que es lo único que esta aplicación sabe enrolar y verificar.
 *   Contar aquí un factor `phone` o `webauthn` haría que el middleware dijera
 *   "desafía" mientras la página dice "no hay nada que verificar": los dos
 *   lados discrepando, que es exactamente de lo que están hechos los bucles.
 *
 * Si algún día se soportan otros tipos, hay que cambiar los dos sitios a la vez.
 *
 * La ausencia de la lista se lee como "ninguno", igual que hace
 * `listFactors()` (`user?.factors ?? []`).
 */
export function tieneFactorVerificado(
  factors: UsuarioConFactores["factors"],
): boolean {
  return (
    Array.isArray(factors) &&
    factors.some((f) => f?.status === "verified" && f?.factor_type === "totp")
  );
}

/**
 * Nivel siguiente REAL, según la lectura fresca del usuario.
 *
 * `getAuthenticatorAssuranceLevel()` deriva `nextLevel` de la sesión guardada
 * en la galleta, y esa galleta miente en los dos sentidos:
 *
 * - **De menos**: quien activó 2FA en el teléfono figura "sin factor" en la
 *   laptop hasta que el token se refresque. Acabaría en `/perfil/seguridad`
 *   leyendo que su 2FA ya está activa, sin salida.
 * - **De más**: tras un break-glass, la galleta sigue anunciando un factor que
 *   ya no existe. Con la exención condicional (ver `middleware.ts`) eso es un
 *   ping-pong entre `/login/mfa` y `/perfil/seguridad` que no termina nunca.
 *
 * La lista de `getUser()` —que el middleware ya consulta contra el servidor— es
 * la MISMA fuente que usa `listFactors()` en el navegador, así que mandarla a
 * decidir hace imposible que las dos discrepen. Sólo se cae a lo que diga la
 * sesión si no hubo lectura fresca del usuario.
 */
export function nivelSiguienteConFactores(
  nextLevelDeLaSesion: NivelAal,
  usuarioFresco: UsuarioConFactores | null | undefined,
): NivelAal {
  if (!usuarioFresco) return nextLevelDeLaSesion;
  return tieneFactorVerificado(usuarioFresco.factors) ? "aal2" : "aal1";
}

/**
 * Qué puede hacer la página del desafío (`/login/mfa`) con lo que le devolvió
 * `listFactors()`.
 *
 * Ninguna de las tres acciones es "navegar sola", y eso es el punto. La página
 * saltaba automáticamente a `/perfil/seguridad` cuando no encontraba un TOTP
 * que verificar, y con la exención condicional de la puerta eso se volvía un
 * ping-pong infinito en cuanto el middleware y la página discrepaban. Discrepar
 * es fácil: basta que `getUser()` falle —red, un 5xx de GoTrue, una carrera del
 * refresco entre pestañas— para que `listFactors()` devuelva `data: null` y la
 * página crea que no hay factor **teniendo uno perfectamente normal**.
 *
 * Alinear los criterios (ver `tieneFactorVerificado`) quita las discrepancias
 * que sabemos nombrar. Quitar el salto automático quita la clase entera: un
 * salto que exige un clic no puede dar vueltas solo, ni por los dos casos
 * conocidos ni por el que todavía no se nos ha ocurrido.
 *
 * Vive aquí, pura, para que la prueba de la cadena de redirecciones use ESTA
 * función y no una imitación escrita a mano: una simulación que copia el
 * criterio del código hereda su punto ciego y no prueba nada.
 */
export type AccionDesafio =
  /** Hay un TOTP verificado: pedir el código de 6 dígitos. */
  | { accion: "pedir-codigo"; factorId: string }
  /** El servidor respondió y no hay nada que verificar. */
  | { accion: "sin-factor" }
  /** No se pudo preguntar. NO es lo mismo que "no tiene". */
  | { accion: "no-se-pudo-comprobar" };

export function accionDelDesafio(
  respuesta:
    | {
        data?: {
          totp?: ReadonlyArray<
            { id?: string | null; status?: string | null } | null | undefined
          > | null;
        } | null;
        error?: unknown;
      }
    | null
    | undefined,
): AccionDesafio {
  // `listFactors()` devuelve `{ data: null, error }` ante CUALQUIER fallo de
  // `getUser()`. Confundir eso con "no tiene factor" es el bucle B.
  if (!respuesta || respuesta.error || !respuesta.data) {
    return { accion: "no-se-pudo-comprobar" };
  }
  const totp = respuesta.data.totp?.find(
    (f) => f?.status === "verified" && typeof f?.id === "string" && f.id !== "",
  );
  if (!totp?.id) return { accion: "sin-factor" };
  return { accion: "pedir-codigo", factorId: totp.id };
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
