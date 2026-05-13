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
  "/_next",
  "/favicon.ico",
];

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname.startsWith(p));

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

  // Bloqueo super-admin: requiere claim `is_platform_admin`.
  if (pathname.startsWith("/super-admin")) {
    const isPlatformAdmin = user.user_metadata?.is_platform_admin === true;
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
