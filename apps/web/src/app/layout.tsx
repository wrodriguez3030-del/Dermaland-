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
  // El icono sale de `src/app/icon.svg` por convención de Next, pero se
  // declara también aquí para el manifiesto y para los buscadores. Antes no
  // había ninguno: la pestaña enseñaba el globo genérico del navegador, y el
  // manifiesto apuntaba a dos PNG que no existían — instalar la aplicación
  // dejaba un icono roto.
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
