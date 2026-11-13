import RadarApp from "@/components/radar-app";
import type { Metadata } from "next";
import { loadPublicPage } from "@/lib/server/public-page";

type Props = { params: Promise<{ path: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const path = "/" + (await params).path.join("/");
  if (["/login", "/registro", "/recuperar", "/restablecer", "/verificar-correo"].includes(path) || path.startsWith("/mi-cuenta")) return { robots: { index: false, follow: false } };
  if (!path.startsWith("/negocio/")) return { robots: { index: true, follow: true } };
  const data = await loadPublicPage(path);
  return data.detail ? { title: `${data.detail.name} | RadarLocal`, description: data.detail.description.slice(0, 160), robots: { index: true, follow: true } }
    : { title: "Negocio no disponible | RadarLocal", robots: { index: false, follow: false } };
}
export default async function AnyRoute({ params, searchParams }: Props) {
  const path = "/" + (await params).path.join("/");
  return <RadarApp path={path} data={await loadPublicPage(path, await searchParams)} />;
}
