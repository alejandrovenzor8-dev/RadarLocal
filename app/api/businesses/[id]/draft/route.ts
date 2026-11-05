import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { businessDrafts } from "@/db/schema";
import { requireBusinessOwner } from "@/lib/server/permissions";
import { withPrincipal } from "@/lib/server/route-context";
import { saveBusinessDraft } from "@/lib/server/revisions";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "ID inválido" }, { status: 400 });
  return withPrincipal(request, async (db, principal) => {
    await requireBusinessOwner(db, principal, id);
    const [draft] = await db.select().from(businessDrafts).where(and(eq(businessDrafts.businessId, id), eq(businessDrafts.authorId, principal.userId))).limit(1);
    return Response.json({ draft: draft ?? null });
  });
}
export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "ID inválido" }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON inválido" }, { status: 400 }); }
  return withPrincipal(request, async (db, principal) => Response.json(await saveBusinessDraft(db, principal, id, body)));
}
