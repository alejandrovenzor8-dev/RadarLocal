import { withPrincipal } from "@/lib/server/route-context";
import { readOwnerDashboard } from "@/lib/server/owner-data";

export async function GET(request: Request) {
  return withPrincipal(request, async (db, principal) => Response.json(await readOwnerDashboard(db, principal), { headers: { "cache-control": "no-store" } }));
}
