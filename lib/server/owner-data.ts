import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { amenities, businessDrafts, businessMemberships, businessPublications, businessRevisions, businesses, categories, changeRequests, cities, events, mediaAssets, notificationOutbox, planBenefits, plans, promotions, reviewDecisions, subscriptions } from "@/db/schema";
import { AppError } from "./errors";
import { requireBusinessOwner, type Principal } from "./permissions";

export async function readOwnerDashboard(db: Database, principal: Principal) {
  if (!principal.roles.includes("BUSINESS_OWNER") && !principal.roles.includes("SUPER_ADMIN")) throw new AppError("Se requiere una cuenta de propietario", 403);
  const linked = await db.select({ business: businesses, membership: businessMemberships }).from(businessMemberships)
    .innerJoin(businesses, eq(businessMemberships.businessId, businesses.id))
    .where(and(eq(businessMemberships.userId, principal.userId), eq(businessMemberships.status, "ACTIVO")))
    .orderBy(desc(businesses.updatedAt)).limit(100);
  const entries = await Promise.all(linked.map(async ({ business }) => {
    const [publication] = await db.select({ version: businessPublications.version }).from(businessPublications).where(eq(businessPublications.businessId, business.id)).limit(1);
    const [draft] = await db.select({ updatedAt: businessDrafts.updatedAt }).from(businessDrafts).where(and(eq(businessDrafts.businessId, business.id), eq(businessDrafts.authorId, principal.userId))).limit(1);
    const requests = await db.select({ id: changeRequests.id, status: changeRequests.status, submittedAt: changeRequests.submittedAt, resolvedAt: changeRequests.resolvedAt }).from(changeRequests).where(and(eq(changeRequests.businessId, business.id), eq(changeRequests.submittedBy, principal.userId))).orderBy(desc(changeRequests.submittedAt)).limit(10);
    const [subscription] = await db.select({ id: subscriptions.id, status: subscriptions.status, startsAt: subscriptions.startsAt, endsAt: subscriptions.endsAt, planId: plans.id, planName: plans.name, planCode: plans.code, planStatus: plans.status }).from(subscriptions).innerJoin(plans, eq(subscriptions.planId, plans.id)).where(and(eq(subscriptions.businessId, business.id), eq(subscriptions.status, "ACTIVA"))).limit(1);
    const now = new Date();
    const effective = subscription?.planStatus === "PUBLICADO" && (!subscription.startsAt || subscription.startsAt <= now) && (!subscription.endsAt || subscription.endsAt > now);
    const benefits = effective && subscription ? await db.select({ key: planBenefits.key, value: planBenefits.value }).from(planBenefits).where(eq(planBenefits.planId, subscription.planId)) : [];
    return { business, publication: publication ?? null, draft: draft ?? null, requests, subscription: subscription ?? null, benefits };
  }));
  const notifications = await db.select().from(notificationOutbox).where(eq(notificationOutbox.userId, principal.userId)).orderBy(desc(notificationOutbox.createdAt)).limit(30);
  return { businesses: entries, notifications };
}

export async function readOwnerBusiness(db: Database, principal: Principal, businessId: string) {
  await requireBusinessOwner(db, principal, businessId);
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) throw new AppError("Negocio no encontrado", 404);
  const [publication] = await db.select({ revisionId: businessPublications.revisionId, version: businessPublications.version, snapshot: businessRevisions.snapshot }).from(businessPublications).innerJoin(businessRevisions, eq(businessPublications.revisionId, businessRevisions.id)).where(eq(businessPublications.businessId, businessId)).limit(1);
  const [draft] = await db.select().from(businessDrafts).where(and(eq(businessDrafts.businessId, businessId), eq(businessDrafts.authorId, principal.userId))).limit(1);
  const requests = await db.select({ request: changeRequests, decision: reviewDecisions }).from(changeRequests).leftJoin(reviewDecisions, eq(reviewDecisions.requestId, changeRequests.id)).where(and(eq(changeRequests.businessId, businessId), eq(changeRequests.submittedBy, principal.userId))).orderBy(desc(changeRequests.submittedAt)).limit(20);
  const media = await db.select({ id: mediaAssets.id, kind: mediaAssets.kind, rights: mediaAssets.rights, altText: mediaAssets.altText, sourceUrl: mediaAssets.sourceUrl, storageKey: mediaAssets.storageKey, byteSize: mediaAssets.byteSize, createdAt: mediaAssets.createdAt }).from(mediaAssets).where(eq(mediaAssets.businessId, businessId)).orderBy(desc(mediaAssets.createdAt)).limit(100);
  return { business, publication: publication ?? null, draft: draft ?? null, requests, media: media.map(asset => ({ ...asset, url: asset.storageKey ? `/api/media/${asset.id}` : null })), promotions: await db.select().from(promotions).where(eq(promotions.businessId, businessId)).limit(100), events: await db.select().from(events).where(eq(events.businessId, businessId)).limit(100), categories: await db.select({ id: categories.id, name: categories.name, parentId: categories.parentId }).from(categories).where(eq(categories.status, "PUBLICADO")).limit(200), cities: await db.select({ id: cities.id, name: cities.name }).from(cities).limit(300), amenities: await db.select({ id: amenities.id, name: amenities.name }).from(amenities).where(eq(amenities.status, "PUBLICADO")).limit(200) };
}
