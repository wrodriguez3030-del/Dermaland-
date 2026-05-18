import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Paquetes server-side que NO se deben bundlear por el Next.js compiler:
  //  - `pdfkit` carga métricas de fuentes (.afm) vía `fs.readFileSync` con
  //    paths relativos a su node_modules — el bundler los rompería.
  //  - `xmllint-wasm` carga un binario `.wasm` desde su dist; el bundler
  //    de Next no copia esos assets correctamente.
  //  - `node-forge` y `xml-crypto` son grandes y server-only; mejor
  //    externalizar para reducir el bundle de Server Components y mejorar
  //    el tiempo de cold start.
  serverExternalPackages: ["pdfkit", "xmllint-wasm", "node-forge", "xml-crypto"],
};

export default nextConfig;
