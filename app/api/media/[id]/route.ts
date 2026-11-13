import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withDb } from "@/db";
import { businesses, mediaAssets } from "@/db/schema";
import { AppError } from "@/lib/server/errors";
import { sendAuthEmail } from "@/lib/server/email";
import { isPublicMedia } from "@/lib/server/media";
import { requireBusinessOwner, requirePrincipal } from "@/lib/server/permissions";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404 });
  if (!env.BUCKET) return Response.json({ error: "Almacenamiento de imágenes sin configurar" }, { status: 503 });
  try {
    return await withDb(async db => {
      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
      if (!asset?.businessId || !asset.storageKey) return new Response(null, { status: 404 });
      const [business] = await db.select({ status: businesses.status, verification: businesses.verification, suspendedAt: businesses.suspendedAt }).from(businesses).where(eq(businesses.id, asset.businessId)).limit(1);
      const publicAccess = business?.status === "PUBLICADO" && business.verification === "VERIFICADO" && !business.suspendedAt && asset.rights === "AUTORIZADO" && await isPublicMedia(db, id, asset.businessId);
      if (!publicAccess) {
        if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) return new Response(null, { status: 401 });
        const principal = await requirePrincipal(db, request.headers, { secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL, sendEmail: sendAuthEmail });
        if (!principal.roles.includes("ADMIN") && !principal.roles.includes("SUPER_ADMIN")) await requireBusinessOwner(db, principal, asset.businessId);
      }
      const object = await env.BUCKET!.get(asset.storageKey);
      if (!object) return new Response(null, { status: 404 });
      return new Response(object.body, { headers: { "content-type": asset.mimeType ?? "application/octet-stream", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.status });
    console.error("No se pudo leer la imagen", error);
    return new Response(null, { status: 503 });
  }
}
