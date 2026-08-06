import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  mfaGateDecision,
  nivelAal,
  nivelSiguienteConFactores,
  type NivelAal,
} from "@/lib/auth/mfa-gate";

/**
 * Middleware de auth.
 *
 * Responsabilidades:
 * 1. Refrescar la sesión Supabase en cada request (cookies expiran).
 * 2. Redirigir a /login si la ruta es protegida y no hay sesión.
 * 3. Bloquear `/super-admin/*` si el usuario no tiene `is_platform_admin`.
 *
 * Cuando `DATA_SOURCE=mock` el middleware deja pasar todo — útil para demos
 * sin Supabase. En producción `DATA_SOURCE=supabase` y el bloqueo es real.
 */

const PUBLIC_PATHS = [
  "/login",
  // DL-18: flujo de recuperación de contraseña (enlace de un solo uso de Supabase).
  "/recuperar",
  "/restablecer",
  "/auth/callback",
  "/api/whatsapp/webhook",
  "/api/health",
  // Comprobante público: página del cliente (`/factura/[token]`) + su imagen OG.
  // Autorización por token firmado, NO por sesión (por eso pasa el middleware).
  "/factura",
  // Logo PNG para correos (lo carga el proxy de imágenes del cliente de correo).
  // DL-07: ruta EXACTA. Antes era "/api/brand", que por `startsWith` dejaba
  // pública también "/api/brands" (CRUD de marcas) y saltaba el 2FA.
  "/api/brand/logo",
  // Tienda en línea. NO usa sesión: el negocio se resuelve en el servidor con
  // `business_web_settings.storefront_enabled` (a lo sumo uno en toda la
  // plataforma) y se lee con service-role acotado, nunca con la clave anónima.
  // Si la tienda está apagada, las rutas devuelven 404 por sí solas.
  "/tienda",
  // El `matcher` de abajo no excluye `.txt`, así que sin esta entrada el
  // middleware respondía a `/robots.txt` con un 307 a `/login`: el rastreador
  // nunca llegaba a leer las reglas y, sin reglas, asume que puede rastrear
  // todo. Justo lo contrario de lo que hace falta en los despliegues Preview.
  "/robots.txt",
  "/sitemap.xml",
  // Carrito de la tienda: el navegador guarda slugs y esta ruta devuelve los
  // precios. Es la ÚNICA entrada pública bajo `/api/storefront`; `settings` y
  // `products` son administración y siguen exigiendo sesión y 2FA. Por el match
  // por segmento (DL-07), esta entrada NO los cubre.
  "/api/storefront/cart",
  // Alta de pedido desde la tienda (sin sesión) y consulta del pedido por token
  // firmado. El CAMBIO DE ESTADO no vive aquí debajo a propósito: está en
  // `/api/pedidos-web/...`, fuera de este prefijo, y por tanto exige sesión del
  // negocio. `middleware.test.ts` lo fija en los dos sentidos.
  "/api/storefront/orders",
  // "No soy yo" del checkout: borra la galleta que recuerda al cliente en este
  // dispositivo. Lo único que puede provocar quien la llame es que su propio
  // navegador deje de recordar sus datos.
  "/api/storefront/olvidarme",
  "/tienda/pedido",
  "/_next",
  "/favicon.ico",
];

// PDF público firmado del comprobante: `/api/proformas/[id]/pdf?t=<token>`.
// El endpoint valida el token internamente (service-role acotado por business).
const PUBLIC_PATH_PATTERNS = [/^\/api\/proformas\/[^/]+\/pdf$/];

/** A dónde manda la puerta de 2FA a quien todavía no tiene factor. */
export const MFA_ENROLL_PATH = "/perfil/seguridad";
/** A dónde manda la puerta de 2FA a quien tiene factor y no lo ha usado. */
export const MFA_CHALLENGE_PATH = "/login/mfa";

/**
 * Rutas exentas de la puerta 2FA.
 *
 * NO son públicas: siguen exigiendo sesión y personal del negocio. Son el
 * DESTINO al que la propia puerta redirige, así que si la puerta las vigilara
 * se mordería la cola: se manda al administrador a enrolarse y la redirección
 * lo vuelve a redirigir, para siempre.
 */
const MFA_EXEMPT_PATHS: ReadonlyArray<string> = [
  MFA_ENROLL_PATH,
  MFA_CHALLENGE_PATH,
];

/**
 * ¿Esta ruta está exenta de la puerta de 2FA?
 *
 * Match por SEGMENTO igual que `isPublic` (DL-07): `/perfil/seguridad-falsa` no
 * puede heredar la exención de `/perfil/seguridad` por empezar igual.
 *
 * Se exporta para poder probarlo: un fallo aquí no es ruidoso — o encierra a
 * los administradores en un bucle, o abre un agujero por el que se salta el
 * segundo factor.
 */
export const isMfaExempt = (pathname: string) =>
  MFA_EXEMPT_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

/**
 * ¿Esta ruta se sirve SIN sesión?
 *
 * DL-07: match por SEGMENTO (no por prefijo suelto). `startsWith(p)` hacía que
 * "/api/brand" cubriera "/api/brands" —el CRUD de marcas— y que "/factura"
 * cubriera "/factura-x".
 *
 * Se exporta solo para poder probarlo: esta lista es la frontera entre lo que ve
 * cualquiera y lo que exige sesión y 2FA, y un error aquí no falla ruidosamente,
 * abre una puerta en silencio. `middleware.test.ts` la comprueba en los DOS
 * sentidos: que lo público pase y que lo privado no.
 */
export const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
  PUBLIC_PATH_PATTERNS.some((re) => re.test(pathname));

/**
 * ¿Este usuario es PERSONAL del negocio, o un cliente de la tienda?
 *
 * Hasta ahora la pregunta no hacía falta: los usuarios sólo los creaba un
 * administrador, así que "tiene sesión" y "es del negocio" eran lo mismo. Con el
 * registro de clientes abierto dejan de serlo, y el middleware es el único sitio
 * donde la diferencia se puede aplicar ANTES de servir una página del ERP.
 *
 * La marca es `business_id` en `app_metadata`, escribible sólo por service_role
 * (SEC-001). Un cliente recién registrado no la tiene y nunca la tendrá: su
 * vínculo con la ficha comercial vive en `client_auth_links`, no en el token.
 *
 * `is_platform_admin === true` (comparación ESTRICTA: un `"true"` de texto no
 * eleva a nadie) también entra, porque el súper admin es personal por definición
 * y puede no tener negocio asignado. `/super-admin` conserva además su propio
 * control más abajo.
 */
export const isBusinessUser = (
  appMetadata: Record<string, unknown> | null | undefined,
): boolean => {
  const m = appMetadata ?? {};
  if (m.is_platform_admin === true) return true;
  const businessId = m.business_id;
  return typeof businessId === "string" && businessId.trim().length > 0;
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const dataSource = process.env.DATA_SOURCE ?? "mock";
  if (dataSource === "mock") return NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.next();

  const response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Tener sesión ya no basta: hay que ser del NEGOCIO. Un cliente de la tienda
  // tiene sesión perfectamente válida y no debe ver `/inventario` ni `/ventas`.
  // Se le devuelve a la tienda y no a `/login`: ya está autenticado, mandarlo al
  // login sería pedirle que arregle algo que no está roto.
  if (!isBusinessUser(user.app_metadata)) {
    const url = request.nextUrl.clone();
    url.pathname = "/tienda";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // B-04: enforcement 2FA. Antes esto sólo exigía el segundo factor a quien YA
  // lo había activado, así que un administrador que nunca escaneó el QR no veía
  // un solo prompt: 2FA existía sin proteger a nadie. Ahora, para los roles
  // obligados, se exige TENER factor y HABERLO usado; para el resto 2FA sigue
  // siendo opcional, pero si lo activaron se respeta.
  //
  // La decisión vive en `src/lib/auth/mfa-gate.ts`, pura y probada caso por
  // caso: es la que puede dejar sin entrar a los dos únicos administradores.
  if (!isMfaExempt(pathname)) {
    let currentLevel: NivelAal = null;
    let nextLevel: NivelAal = null;
    let chequeoFallo = false;
    try {
      const { data: aal, error } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      currentLevel = nivelAal(aal?.currentLevel);
      nextLevel = nivelAal(aal?.nextLevel);
      // Sin sesión, esta llamada devuelve niveles NULOS y `error: null`. Sin
      // esta comprobación ese caso pasaría por un "aal1" legítimo. Si no
      // sabemos en qué nivel está la sesión, no la damos por buena.
      if (error || !aal || currentLevel === null) chequeoFallo = true;
    } catch {
      chequeoFallo = true;
    }

    // `nextLevel` se deriva de la sesión guardada en la galleta, que puede ser
    // ANTERIOR al enrolamiento: quien activó 2FA en el teléfono seguiría
    // figurando "sin factor" en la laptop hasta el próximo refresco del token,
    // y con la puerta cerrada eso es un administrador dando vueltas. `user`
    // viene del `getUser()` de arriba —que sí consulta al servidor—, así que su
    // lista de factores es la fresca y no cuesta una llamada extra.
    nextLevel = nivelSiguienteConFactores(nextLevel, user.factors);

    // Claims SIEMPRE de `app_metadata` (SEC-001): `user_metadata` lo escribe el
    // propio usuario con `auth.updateUser`, así que dejarle elegir su rol aquí
    // sería dejarle elegir si le toca 2FA.
    const decision = mfaGateDecision({
      role:
        typeof user.app_metadata?.role === "string"
          ? user.app_metadata.role
          : undefined,
      isPlatformAdmin: user.app_metadata?.is_platform_admin === true,
      currentLevel,
      nextLevel,
      chequeoFallo,
    });

    if (decision !== "permitir") {
      const url = request.nextUrl.clone();
      url.pathname =
        decision === "enrolar" ? MFA_ENROLL_PATH : MFA_CHALLENGE_PATH;
      // Limpiar la query original: el destino sólo entiende `next` y arrastrar
      // los parámetros de la ruta bloqueada no aporta nada.
      url.search = "";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  // Bloqueo super-admin: requiere claim `is_platform_admin` de `app_metadata`
  // (solo escribible por service_role). NUNCA `user_metadata` — el usuario lo
  // puede modificar con `auth.updateUser` y auto-elevarse (SEC-001).
  if (pathname.startsWith("/super-admin")) {
    const isPlatformAdmin = user.app_metadata?.is_platform_admin === true;
    if (!isPlatformAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Match todo excepto assets estáticos
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
