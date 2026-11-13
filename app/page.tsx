import RadarApp from "@/components/radar-app";
import { loadPublicPage } from "@/lib/server/public-page";

export const dynamic = "force-dynamic";
export default async function Home() { return <RadarApp path="/" data={await loadPublicPage("/")} />; }
