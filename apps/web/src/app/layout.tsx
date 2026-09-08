import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Tipografía del sistema de diseño: Inter (UI) + JetBrains Mono (SKU/lotes/códigos).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "DermaLand",
    template: "%s · DermaLand",
  },
  description:
    "Plataforma SaaS multiempresa para farmacia, dermocosmética y cuidado dermatológico — República Dominicana.",
  // 🔴 El icono se declara con una ruta de `public/` (`/icon.svg`), no con la
  // convención de `src/app/icon.svg` a secas: declarar `icons` en el metadata
  // SUSTITUYE a la convención, así que apuntar a una ruta que solo existe como
  // convención da un 404 — comprobado en producción, la pestaña se quedó con
  // el globo genérico. El archivo está en los dos sitios: `src/app` para la
  // convención y `public` para esta ruta.
  //
  // Antes no había ninguno, y el manifiesto apuntaba a dos PNG que no existían:
  // instalar la aplicación dejaba un icono roto.
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-DO" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
