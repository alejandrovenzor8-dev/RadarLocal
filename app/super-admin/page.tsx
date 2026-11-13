import { cookies } from "next/headers";
import { env } from "cloudflare:workers";
import { withDb } from "@/db";
import { requirePrincipal, requireSuperAdmin } from "@/lib/server/permissions";
import { sendAuthEmail } from "@/lib/server/email";
import AdminPanel from "@/components/admin/admin-panel";
import AdminSignIn from "@/components/admin/admin-sign-in";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) return <AdminSignIn unavailable />;
  let allowed = false;
  try {
    const cookie = (await cookies()).toString();
    if (cookie) {
      const principal = await withDb(db => requirePrincipal(db, new Headers({ cookie }), {
        secret: env.BETTER_AUTH_SECRET!, baseURL: env.BETTER_AUTH_URL!, sendEmail: sendAuthEmail,
      }));
      requireSuperAdmin(principal);
      allowed = true;
    }
  } catch { allowed = false; }
  return allowed ? <AdminPanel /> : <AdminSignIn />;
}
