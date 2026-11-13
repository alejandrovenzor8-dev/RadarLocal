import { env } from "cloudflare:workers";
import { withDb } from "@/db";
import { createAuth } from "@/lib/server/auth";
import { sendAuthEmail } from "@/lib/server/email";
import { eq } from "drizzle-orm";
import { userRoles } from "@/db/schema";

export async function GET(request: Request) {
  if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) return Response.json({ user: null, roles: [], available: false }, { headers: { "cache-control": "private, no-store" } });
  try {
    const result = await withDb(async db => {
      const session = await createAuth(db, { secret: env.BETTER_AUTH_SECRET!, baseURL: env.BETTER_AUTH_URL!, sendEmail: sendAuthEmail }).api.getSession({ headers: request.headers });
      if (!session) return { user: null, roles: [], available: true };
      const roles = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, session.user.id));
      return { user: { id: session.user.id, name: session.user.name, email: session.user.email, emailVerified: session.user.emailVerified }, roles: roles.map(row => row.role), available: true };
    });
    return Response.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("No se pudo leer la sesión", error);
    return Response.json({ user: null, roles: [], available: false }, { status: 503, headers: { "cache-control": "private, no-store" } });
  }
}
