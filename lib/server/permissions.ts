import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import type { Database } from "@/db";
import { businessMemberships, planBenefits, plans, subscriptions, userRoles } from "@/db/schema";
import { createAuth, type AuthSettings } from "./auth";
import { AppError } from "./errors";

export type RadarRole = "SUPER_ADMIN" | "ADMIN" | "BUSINESS_OWNER" | "CUSTOMER";
export type Principal = { userId: string; roles: RadarRole[] };

export async function requirePrincipal(db: Database, headers: Headers, settings: AuthSettings): Promise<Principal> {
  const session = await createAuth(db, settings).api.getSession({ headers });
  if (!session) throw new AppError("Inicia sesión", 401);
  const grants = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, session.user.id));
  return { userId: session.user.id, roles: grants.map(row => row.role) };
}

export function requireReviewer(principal: Principal): void {
  if (!principal.roles.includes("ADMIN") && !principal.roles.includes("SUPER_ADMIN")) {
    throw new AppError("No tienes permiso para revisar", 403);
  }
}

export function requireSuperAdmin(principal: Principal): void {
  if (!principal.roles.includes("SUPER_ADMIN")) throw new AppError("Se requiere SUPER_ADMIN", 403);
}

export async function requireBusinessOwner(db: Database, principal: Principal, businessId: string): Promise<void> {
  if (principal.roles.includes("SUPER_ADMIN")) return;
  if (!principal.roles.includes("BUSINESS_OWNER")) throw new AppError("No tienes acceso a este negocio", 403);
  const [link] = await db.select({ userId: businessMemberships.userId }).from(businessMemberships)
    .where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.userId, principal.userId), eq(businessMemberships.status, "ACTIVO"))).limit(1);
  if (!link) throw new AppError("No tienes acceso a este negocio", 403);
}

export async function hasBusinessBenefit(db: Database, businessId: string, benefitKey: string, now = new Date()): Promise<boolean> {
  const rows = await db.select({ value: planBenefits.value }).from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .innerJoin(planBenefits, eq(planBenefits.planId, plans.id))
    .where(and(eq(subscriptions.businessId, businessId), eq(subscriptions.status, "ACTIVA"), eq(plans.status, "PUBLICADO"), eq(planBenefits.key, benefitKey),
      or(isNull(subscriptions.startsAt), lt(subscriptions.startsAt, now)), or(isNull(subscriptions.endsAt), gt(subscriptions.endsAt, now)))).limit(1);
  const value = rows[0]?.value;
  return typeof value === "boolean" ? value : typeof value === "number" ? value > 0 : typeof value === "string" ? value.length > 0 : false;
}
