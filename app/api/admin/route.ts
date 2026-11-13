import { z } from "zod";
import { withPrincipal } from "@/lib/server/route-context";
import { requireSuperAdmin } from "@/lib/server/permissions";
import { adminSections, readAdminSection } from "@/lib/server/admin-data";
import { applyAdminAction } from "@/lib/server/admin-actions";

export async function GET(request: Request) {
  return withPrincipal(request, async (db, principal) => {
    requireSuperAdmin(principal);
    const section = z.enum(adminSections).parse(new URL(request.url).searchParams.get("section") ?? "dashboard");
    return Response.json(await readAdminSection(db, section), { headers: { "cache-control": "no-store" } });
  });
}

export async function POST(request: Request) {
  return withPrincipal(request, async (db, principal) => {
    requireSuperAdmin(principal);
    const body = z.object({ action: z.string().min(1).max(80), payload: z.unknown() }).parse(await request.json());
    return Response.json(await applyAdminAction(db, principal, body.action, body.payload), { headers: { "cache-control": "no-store" } });
  });
}
