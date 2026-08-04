import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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
  "/tienda/pedido",
  "/_next",
  "/favicon.ico",
];

// PDF público firmado del comprobante: `/api/proformas/[id]/pdf?t=<token>`.
// El endpoint valida el token internamente (service-role acotado por business).
const PUBLIC_PATH_PATTERNS = [/^\/api\/proformas\/[^/]+\/pdf$/];

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

  // B-04: enforcement 2FA. Si el usuario tiene un factor TOTP verificado pero la
  // sesión aún está en aal1 (solo contraseña), exigimos completar el challenge
  // antes de cualquier ruta privada. Solo afecta a quien ACTIVÓ 2FA (los demás
  // tienen nextLevel=aal1 → no se redirige). `/login/mfa` es público → no hay bucle.
  // Fail-open ante error para no bloquear el acceso por un fallo del chequeo.
  try {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel === "aal1") {
      const url = request.nextUrl.clone();
      url.pathname = "/login/mfa";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  } catch {
    // No bloquear si el chequeo de aal falla (evita lockout).
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
