import type { NextConfig } from "next";

/**
 * Configuración base de Next.js para apps/web.
 * - reactStrictMode: true para detectar problemas de side effects pronto.
 * - transpilePackages: el monorepo usa packages internos (`@dermaland/*`)
 *   que se publican como source TS, Next debe transpilarlos.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@dermaland/db", "@dermaland/shared", "@dermaland/ui"],
};

export default nextConfig;
