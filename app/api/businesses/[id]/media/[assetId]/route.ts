import { z } from "zod";
import { withPrincipal } from "@/lib/server/route-context";
import { discardPendingImage } from "@/lib/server/media";

export async function DELETE(request: Request, context: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await context.params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(assetId).success) return Response.json({ error: "ID inválido" }, { status: 400 });
  return withPrincipal(request, async (db, principal) => Response.json(await discardPendingImage(db, principal, id, assetId)));
}
