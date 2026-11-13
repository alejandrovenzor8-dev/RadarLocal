import { asc, count, desc, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { user } from "@/db/auth-schema";
import { advertisements, advertisingRates, amenities, auditLog, businessDrafts, businessMemberships, businessPublications, businessRevisions, businesses, categories, changeRequests, cities, contactChannels, events, legalDocuments, mediaAssets, planBenefits, plans, platformSettings, promotions, reviewDecisions, states, subscriptions, userRoles } from "@/db/schema";
import { adminBenefitKeys, adminPlanNames, adminSettingKeys } from "@/lib/admin-catalog";

export const adminSections = ["dashboard", "users", "businesses", "reviews", "categories", "geography", "plans", "subscriptions", "content", "settings", "advertising", "legal", "audit"] as const;
export type AdminSection = typeof adminSections[number];

export async function readAdminSection(db: Database, section: AdminSection) {
  switch (section) {
    case "dashboard": {
      const [[users], [businessCount], [pending], [published], [subscriptionCount]] = await Promise.all([
        db.select({ value: count() }).from(user), db.select({ value: count() }).from(businesses),
        db.select({ value: count() }).from(changeRequests).where(eq(changeRequests.status, "PENDIENTE")),
        db.select({ value: count() }).from(businessPublications), db.select({ value: count() }).from(subscriptions),
      ]);
      return { users: users.value, businesses: businessCount.value, pendingReviews: pending.value, published: published.value, subscriptions: subscriptionCount.value,
        activity: await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(12) };
    }
    case "users": return { users: await db.select({ id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, createdAt: user.createdAt }).from(user).orderBy(desc(user.createdAt)).limit(100), roles: await db.select().from(userRoles).limit(300) };
    case "businesses": return { businesses: await db.select().from(businesses).orderBy(desc(businesses.createdAt)).limit(100), users: await db.select({ id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified }).from(user).where(eq(user.emailVerified, true)).limit(200), categories: await db.select().from(categories).limit(200), cities: await db.select().from(cities).limit(300), memberships: await db.select().from(businessMemberships).limit(300), media: await db.select().from(mediaAssets).limit(300), drafts: await db.select().from(businessDrafts).limit(100), publications: await db.select().from(businessPublications).limit(100), revisions: await db.select().from(businessRevisions).orderBy(desc(businessRevisions.createdAt)).limit(100) };
    case "reviews": return { requests: await db.select().from(changeRequests).orderBy(desc(changeRequests.submittedAt)).limit(100), revisions: await db.select().from(businessRevisions).orderBy(desc(businessRevisions.createdAt)).limit(150), publications: await db.select().from(businessPublications).limit(100), decisions: await db.select().from(reviewDecisions).orderBy(desc(reviewDecisions.decidedAt)).limit(100), businesses: await db.select({ id: businesses.id, name: businesses.name }).from(businesses).limit(100) };
    case "categories": return { categories: await db.select().from(categories).orderBy(asc(categories.name)).limit(200), amenities: await db.select().from(amenities).orderBy(asc(amenities.name)).limit(200) };
    case "geography": return { states: await db.select().from(states).orderBy(asc(states.name)).limit(100), cities: await db.select().from(cities).orderBy(asc(cities.name)).limit(300) };
    case "plans": {
      const configuredPlans = await db.select().from(plans).orderBy(asc(plans.code)).limit(100);
      const configuredBenefits = await db.select().from(planBenefits).limit(500);
      const visiblePlans = [...configuredPlans, ...Object.entries(adminPlanNames).filter(([code]) => !configuredPlans.some(plan => plan.code === code)).map(([code, name]) => ({ id: null, code, name, priceMinor: null, currency: null, status: "PENDIENTE_CONFIGURACION" as const }))];
      const benefits = configuredPlans.flatMap(plan => adminBenefitKeys.map(key => {
        const configured = configuredBenefits.find(benefit => benefit.planId === plan.id && benefit.key === key);
        return { planId: plan.id, key, value: configured?.value ?? null, status: configured ? plan.status : "PENDIENTE_CONFIGURACION" };
      }));
      return { plans: visiblePlans, benefits };
    }
    case "subscriptions": return { subscriptions: await db.select().from(subscriptions).orderBy(desc(subscriptions.createdAt)).limit(200), plans: await db.select().from(plans).limit(100), businesses: await db.select({ id: businesses.id, name: businesses.name }).from(businesses).limit(200) };
    case "content": return { promotions: await db.select().from(promotions).limit(100), events: await db.select().from(events).limit(100), advertisements: await db.select().from(advertisements).limit(100) };
    case "settings": {
      const configured = await db.select().from(platformSettings).orderBy(asc(platformSettings.key)).limit(100);
      const channels = await db.select().from(contactChannels).limit(100);
      const settings = [...configured, ...adminSettingKeys.filter(key => !configured.some(row => row.key === key)).map(key => ({ key, value: null, status: "PENDIENTE_CONFIGURACION" as const, updatedBy: null, updatedAt: null }))];
      const contacts = [...channels, ...["EMAIL", "PHONE", "WHATSAPP", "FACEBOOK", "INSTAGRAM", "TIKTOK", "WEBSITE"].filter(kind => !channels.some(row => row.kind === kind)).map(kind => ({ id: null, kind, value: null, status: "PENDIENTE_CONFIGURACION" as const, updatedBy: null }))];
      return { settings, contacts };
    }
    case "advertising": return { rates: await db.select().from(advertisingRates).limit(100), advertisements: await db.select().from(advertisements).limit(100) };
    case "legal": {
      const configured = await db.select().from(legalDocuments).orderBy(desc(legalDocuments.version)).limit(100);
      return { documents: [...configured, ...["TERMINOS", "PRIVACIDAD", "COOKIES"].filter(kind => !configured.some(row => row.kind === kind)).map(kind => ({ id: null, kind, version: 0, body: null, status: "PENDIENTE_CONFIGURACION" as const, publishedAt: null }))] };
    }
    case "audit": return { activity: await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(200) };
  }
}
