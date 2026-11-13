import type { Metadata } from "next";
import { env } from "cloudflare:workers";
import "./globals.css";

export function generateMetadata(): Metadata {
  return {
    title: "RadarLocal | Negocios de Chihuahua",
    description: "Directorio de negocios de Chihuahua en comida y bebidas, inmobiliarias, salones de eventos y vinos.",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    ...(env.RADAR_ENVIRONMENT === "staging" ? { robots: { index: false, follow: false } } : {}),
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-MX">
      <body className="antialiased">{children}</body>
    </html>
  );
}
