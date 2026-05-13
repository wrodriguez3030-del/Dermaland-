import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DermaLand — SaaS farmacia y dermocosmética",
  description:
    "Plataforma multiempresa para farmacia, dermocosmética y cuidado dermatológico (RD).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
