import { z } from "zod";
import { withPrincipal } from "@/lib/server/route-context";
import { submitBusinessDraft } from "@/lib/server/revisions";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "ID inválido" }, { status: 400 });
  return withPrincipal(request, async (db, principal) => Response.json(await submitBusinessDraft(db, principal, id), { status: 201 }));
}
