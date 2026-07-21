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
  "/auth/callback",
  "/api/whatsapp/webhook",
  "/api/health",
  // Comprobante público: página del cliente (`/factura/[token]`) + su imagen OG.
  // Autorización por token firmado, NO por sesión (por eso pasa el middleware).
  "/factura",
  "/_next",
  "/favicon.ico",
];

// PDF público firmado del comprobante: `/api/proformas/[id]/pdf?t=<token>`.
// El endpoint valida el token internamente (service-role acotado por business).
const PUBLIC_PATH_PATTERNS = [/^\/api\/proformas\/[^/]+\/pdf$/];

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
  PUBLIC_PATH_PATTERNS.some((re) => re.test(pathname));

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
