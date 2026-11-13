import { and, desc, eq } from "drizzle-orm";
import { ZodError } from "zod";
import { env } from "cloudflare:workers";
import { withDb } from "@/db";
import { legalDocuments, plans, platformSettings } from "@/db/schema";
import { getPublicBusiness, listPublicBusinesses, listPublicContent, listPublicTaxonomy, type DirectoryResult } from "./public-directory";
import { logServerError } from "./safe-log";

export type PublicPageData = {
  directory: DirectoryResult;
  taxonomy: Awaited<ReturnType<typeof listPublicTaxonomy>>;
  content: Awaited<ReturnType<typeof listPublicContent>>;
  detail: Awaited<ReturnType<typeof getPublicBusiness>>;
  plans: { id: string; name: string; priceMinor: number; currency: string }[];
  legal: { kind: string; body: string }[];
  brand: { name: string; description: string } | null;
  unavailable: boolean; invalidFilter: boolean; query: string;
};

const empty: PublicPageData = {
  directory: { items: [], total: 0, page: 1, pages: 0 },
  taxonomy: { categories: [], states: [], cities: [], amenities: [] },
  content: { promotions: [], events: [] }, detail: null, plans: [], legal: [], brand: null, unavailable: false, invalidFilter: false, query: "",
};

export async function loadPublicPage(path: string, params: Record<string, string | string[] | undefined> = {}): Promise<PublicPageData> {
  const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string")).toString();
  try {
    return await withDb(async db => {
      const chosen = (key: string) => typeof params[key] === "string" && params[key] !== "" ? params[key] as string : undefined;
      const filter = {
        q: typeof params.q === "string" ? params.q : "",
        category: chosen("category"), state: chosen("state"), city: chosen("city"),
        service: chosen("service"), amenity: chosen("amenity"),
        lat: chosen("lat"), lng: chosen("lng"), radiusKm: chosen("radiusKm"), page: chosen("page"),
      };
      const needsDirectory = path === "/" || path === "/explorar" || path === "/mapa" || path.startsWith("/categorias/") || path.startsWith("/mi-cuenta");
      const directory = needsDirectory ? await listPublicBusinesses(db, path === "/" ? { page: 1 } : filter) : empty.directory;
      const taxonomy = path === "/" || path === "/explorar" || path.startsWith("/categorias/") ? await listPublicTaxonomy(db) : empty.taxonomy;
      const content = path === "/" || path === "/promociones" || path === "/eventos" ? await listPublicContent(db) : empty.content;
      const detail = path.startsWith("/negocio/") ? await getPublicBusiness(db, decodeURIComponent(path.slice(9))) : null;
      const planRows = path === "/para-negocios" ? await db.select({ id: plans.id, name: plans.name, priceMinor: plans.priceMinor, currency: plans.currency }).from(plans).where(eq(plans.status, "PUBLICADO")) : [];
      const legalRows = path === "/terminos" || path === "/privacidad" ? await db.select({ kind: legalDocuments.kind, body: legalDocuments.body }).from(legalDocuments).where(and(eq(legalDocuments.status, "PUBLICADO"), eq(legalDocuments.kind, path === "/terminos" ? "TERMINOS" : "PRIVACIDAD"))).orderBy(desc(legalDocuments.version)).limit(1) : [];
      const settingRows = await db.select({ key: platformSettings.key, value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.status, "PUBLICADO"));
      const textSetting = (key: string) => { const value = settingRows.find(row => row.key === key)?.value?.text; return typeof value === "string" ? value : null; };
      const brand = textSetting("commercial_name") && textSetting("description") ? { name: textSetting("commercial_name")!, description: textSetting("description")! } : null;
      const visibleDirectory = env.BUCKET ? directory : { ...directory, items: directory.items.map(item => ({ ...item, imageUrl: null })) };
      const visibleDetail = env.BUCKET || !detail ? detail : { ...detail, imageUrl: null, images: [] };
      return { directory: visibleDirectory, taxonomy, content, detail: visibleDetail, plans: planRows.filter((row): row is { id: string; name: string; priceMinor: number; currency: string } => !!row.name && row.priceMinor !== null && !!row.currency),
        legal: legalRows.filter((row): row is { kind: string; body: string } => !!row.body), brand, unavailable: false, invalidFilter: false, query };
    });
  } catch (error) {
    if (error instanceof ZodError) return { ...empty, invalidFilter: true, query };
    logServerError("public_directory", error);
    return { ...empty, unavailable: true, query };
  }
}
