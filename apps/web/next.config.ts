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
  // SEGURIDAD (SEC-005): cabeceras de endurecimiento en todas las respuestas.
  // No incluye Content-Security-Policy estricta a propósito: una CSP debe
  // probarse en modo report-only primero para no romper Supabase/Vercel/imágenes
  // (ver docs/security/deployment-security-checklist.md). Permissions-Policy
  // permite `camera=(self)` porque el conteo físico (PWA) escanea códigos.
  async headers() {
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
        ],
      },
    ];
  },
};

export default nextConfig;
