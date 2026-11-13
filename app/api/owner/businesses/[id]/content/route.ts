import { z } from "zod";
import { withPrincipal } from "@/lib/server/route-context";
import { saveOwnerContent } from "@/lib/server/owner-content";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "ID inválido" }, { status: 400 });
  return withPrincipal(request, async (db, principal) => Response.json(await saveOwnerContent(db, principal, id, await request.json()), { status: 201 }));
}
