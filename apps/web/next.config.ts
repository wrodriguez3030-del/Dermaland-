import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Marca de build para verificar qué commit está vivo en cada deployment.
  // Se pasa en el deploy con `--build-env SOURCE_SHA=$(git rev-parse --short HEAD)`
  // y queda inlineada en el bundle (la expone /api/health como `build`).
  // No es un secreto y NO toca las env vars de Production.
  env: {
    APP_BUILD_SHA: process.env.SOURCE_SHA ?? "dev",
  },
  // Paquetes server-side que NO se deben bundlear por el Next.js compiler:
  //  - `pdfkit` carga métricas de fuentes (.afm) vía `fs.readFileSync` con
  //    paths relativos a su node_modules — el bundler los rompería.
  //  - `xmllint-wasm` carga un binario `.wasm` desde su dist; el bundler
  //    de Next no copia esos assets correctamente.
  //  - `node-forge` y `xml-crypto` son grandes y server-only; mejor
  //    externalizar para reducir el bundle de Server Components y mejorar
  //    el tiempo de cold start.
  serverExternalPackages: ["pdfkit", "xmllint-wasm", "node-forge", "xml-crypto"],
  // Incluye los XSDs oficiales DGII en los lambdas que los leen vía fs.
  // La ruta /api/dgii/certificate/test-local hace `fs.readFile` sobre
  // `docs/dgii/xsd/e-CF-32-v1.0.xsd` para validar el XML firmado contra
  // el schema. Sin este include el bundler de Next no copia los .xsd al
  // deployment y el paso `xsd_valid` se omite en Vercel (aunque sí
  // funciona en dev local). El glob es relativo a la raíz del proyecto
  // (apps/web), por eso sube dos niveles.
  outputFileTracingIncludes: {
    "/api/dgii/certificate/**": ["../../docs/dgii/xsd/*.xsd"],
  },
  // SEGURIDAD (SEC-005 + DL-05): cabeceras de endurecimiento en todas las
  // respuestas. La CSP se despliega en modo REPORT-ONLY (solo en producción):
  // no bloquea nada, solo reporta violaciones para poder ajustar la política
  // antes de promoverla a enforcing (ver docs/security/deployment-security-checklist.md).
  // Permissions-Policy permite `camera=(self)` porque el conteo físico (PWA) escanea.
  async headers() {
    // Política de partida: `self` + los orígenes que la app realmente usa
    // (Supabase, Sentry). `script/style` permiten inline por ahora (Next inyecta
    // bootstrap inline); el objetivo es migrar a nonces antes de pasar a enforcing.
    const cspReportOnly = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Content-Security-Policy-Report-Only", value: cspReportOnly }]
            : []),
          // R-WEB-03: los despliegues Preview tienen URL pública y los mismos
          // datos que producción. Sin esto, Google podría indexar el catálogo
          // bajo un dominio efímero que mañana da 404 y que además compite con
          // el dominio bueno por el mismo contenido. Es la segunda capa: actúa
          // aunque el rastreador llegue por un enlace directo sin leer
          // `robots.txt`. En producción NO se emite.
          ...(process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production"
            ? [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
