import { cookies } from "next/headers";
import { env } from "cloudflare:workers";
import { withDb } from "@/db";
import { sendAuthEmail } from "./email";
import { requireBusinessOwner, requirePrincipal } from "./permissions";
import OwnerSignIn from "@/components/owner/owner-sign-in";
import OwnerPanel from "@/components/owner/owner-panel";

export default async function OwnerGate({ businessId, contentMode = false }: { businessId?: string; contentMode?: boolean }) {
  if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) return <OwnerSignIn unavailable />;
  let allowed = false; let denied = false;
  try {
    const cookie = (await cookies()).toString();
    if (cookie) {
      const principal = await withDb(db => requirePrincipal(db, new Headers({ cookie }), { secret: env.BETTER_AUTH_SECRET!, baseURL: env.BETTER_AUTH_URL!, sendEmail: sendAuthEmail }));
      if (!principal.roles.includes("BUSINESS_OWNER") && !principal.roles.includes("SUPER_ADMIN")) denied = true;
      else if (businessId) await withDb(db => requireBusinessOwner(db, principal, businessId));
      if (!denied) allowed = true;
    }
  } catch { denied = true; }
  return allowed ? <OwnerPanel selectedBusinessId={businessId} contentMode={contentMode} /> : <OwnerSignIn denied={denied} />;
}
