import { z } from "zod";
import { withPrincipal } from "@/lib/server/route-context";
import { readOwnerBusiness } from "@/lib/server/owner-data";
import { env } from "cloudflare:workers";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "ID inválido" }, { status: 400 });
  return withPrincipal(request, async (db, principal) => Response.json({ ...await readOwnerBusiness(db, principal, id), mediaUploadConfigured: !!env.BUCKET }, { headers: { "cache-control": "no-store" } }));
}
