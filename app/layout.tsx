import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RadarLocal | Negocios de Chihuahua",
  description: "Demo de negocios de Chihuahua en restaurantes, inmobiliarias, salones de eventos y vinos.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

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
