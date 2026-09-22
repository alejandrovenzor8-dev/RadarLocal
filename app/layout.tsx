import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RadarLocal | Encuentra lo mejor cerca de ti",
  description: "Directorio digital para descubrir negocios, servicios y promociones en Chihuahua.",
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
