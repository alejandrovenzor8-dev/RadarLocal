import { z } from "zod";
import { withPrincipal } from "@/lib/server/route-context";
import { decideBusinessChange } from "@/lib/server/revisions";

const decisionSchema = z.object({
  decision: z.enum(["APROBADA", "RECHAZADA", "CORRECCIONES_SOLICITADAS"]),
  reason: z.string().trim().max(2000).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "ID inválido" }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON inválido" }, { status: 400 }); }
  return withPrincipal(request, async (db, principal) => {
    const { decision, reason } = decisionSchema.parse(body);
    return Response.json(await decideBusinessChange(db, principal, id, decision, reason));
  });
}
