import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db";
import { user } from "@/db/auth-schema";
import { advertisements, advertisingRates, amenities, auditLog, businessMemberships, businessPublications, businesses, categories, cities, contactChannels, events, legalDocuments, mediaAssets, planBenefits, plans, platformSettings, promotions, states, subscriptions, userRoles } from "@/db/schema";
import { AppError } from "./errors";
import { hasBusinessBenefit, requireSuperAdmin, type Principal } from "./permissions";
import { adminBenefitKeys, adminSettingKeys } from "@/lib/admin-catalog";

const id = z.uuid();
const label = z.string().trim().min(2).max(160);
const slug = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
const status = z.enum(["PENDIENTE_CONFIGURACION", "PUBLICADO", "ARCHIVADO"]);
const optionalUrl = z.url().max(1000).nullable();
const money = z.number().int().min(0).max(100_000_000).nullable();
const parse = <T extends z.ZodType>(schema: T, value: unknown): z.infer<T> => schema.parse(value);

type AuditDb = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
async function audit(db: AuditDb, principal: Principal, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
  await db.insert(auditLog).values({ actorId: principal.userId, action, entityType, entityId, details });
}

async function verifyPublishableBusiness(db: Database, businessId: string) {
  const [business] = await db.select({ verification: businesses.verification, status: businesses.status, suspendedAt: businesses.suspendedAt }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) throw new AppError("Negocio no encontrado", 404);
  if (business.verification !== "VERIFICADO" || business.status !== "PUBLICADO" || business.suspendedAt) throw new AppError("La ficha del negocio debe estar verificada, activa y publicada", 409);
  const [publication] = await db.select({ businessId: businessPublications.businessId }).from(businessPublications).where(eq(businessPublications.businessId, businessId)).limit(1);
  if (!publication) throw new AppError("Falta una versión pública aprobada", 409);
}

export async function applyAdminAction(db: Database, principal: Principal, action: string, input: unknown): Promise<unknown> {
  requireSuperAdmin(principal);
  switch (action) {
    case "user.role": {
      const data = parse(z.object({ userId: z.string().min(1), role: z.enum(["ADMIN", "BUSINESS_OWNER"]), enabled: z.boolean() }), input);
      const [target] = await db.select({ id: user.id, verified: user.emailVerified }).from(user).where(eq(user.id, data.userId)).limit(1);
      if (!target) throw new AppError("Usuario no encontrado", 404);
      if (data.enabled && !target.verified) throw new AppError("Primero debe verificar su correo", 409);
      await db.transaction(async tx => {
        if (data.enabled) await tx.insert(userRoles).values({ userId: data.userId, role: data.role, grantedBy: principal.userId }).onConflictDoNothing();
        else await tx.delete(userRoles).where(and(eq(userRoles.userId, data.userId), eq(userRoles.role, data.role)));
        await audit(tx, principal, data.enabled ? "ROLE_GRANTED" : "ROLE_REVOKED", "user", data.userId, { role: data.role });
      });
      return { ok: true };
    }
    case "business.create": {
      const data = parse(z.object({ name: label, slug, categoryId: id.nullable(), cityId: id.nullable(), sourceUrl: optionalUrl, sourceNotes: z.string().max(2000).nullable() }), input);
      return db.transaction(async tx => {
        const [created] = await tx.insert(businesses).values(data).returning();
        await audit(tx, principal, "BUSINESS_CREATED", "business", created.id);
        return created;
      });
    }
    case "business.update": {
      const data = parse(z.object({ id, name: label, categoryId: id.nullable(), cityId: id.nullable(), sourceUrl: optionalUrl, sourceNotes: z.string().max(2000).nullable(), status, verification: z.enum(["PENDIENTE_VERIFICACION", "VERIFICADO", "RECHAZADO"]), suspended: z.boolean() }), input);
      return db.transaction(async tx => {
        const [current] = await tx.select({ status: businesses.status, name: businesses.name, categoryId: businesses.categoryId, cityId: businesses.cityId }).from(businesses).where(eq(businesses.id, data.id)).limit(1);
        if (!current) throw new AppError("Negocio no encontrado", 404);
        if (data.status === "PUBLICADO") {
          const [publication] = await tx.select({ revisionId: businessPublications.revisionId }).from(businessPublications).where(eq(businessPublications.businessId, data.id)).limit(1);
          if (!publication || data.verification !== "VERIFICADO") throw new AppError("Publica una revisión aprobada antes de activar la ficha", 409);
          if (data.name !== current.name || data.categoryId !== current.categoryId || data.cityId !== current.cityId) throw new AppError("Edita la información pública mediante una revisión", 409);
        }
        const [updated] = await tx.update(businesses).set({ name: data.name, categoryId: data.categoryId, cityId: data.cityId, sourceUrl: data.sourceUrl, sourceNotes: data.sourceNotes, status: data.status, verification: data.verification, suspendedAt: data.suspended ? new Date() : null, sourceCheckedAt: data.verification === "VERIFICADO" ? new Date() : null, updatedAt: new Date() }).where(eq(businesses.id, data.id)).returning();
        await audit(tx, principal, "BUSINESS_UPDATED", "business", data.id, { fromStatus: current.status, toStatus: data.status, verification: data.verification, suspended: data.suspended });
        return updated;
      });
    }
    case "business.owner": {
      const data = parse(z.object({ businessId: id, userId: z.string().min(1), status: z.enum(["PENDIENTE", "ACTIVO", "REVOCADO"]) }), input);
      return db.transaction(async tx => {
        const [target] = await tx.select({ verified: user.emailVerified }).from(user).where(eq(user.id, data.userId)).limit(1);
        if (!target?.verified) throw new AppError("El propietario debe tener una cuenta verificada", 409);
        await tx.insert(businessMemberships).values({ ...data, linkedBy: principal.userId }).onConflictDoUpdate({ target: [businessMemberships.businessId, businessMemberships.userId], set: { status: data.status, linkedBy: principal.userId, linkedAt: new Date() } });
        if (data.status === "ACTIVO") await tx.insert(userRoles).values({ userId: data.userId, role: "BUSINESS_OWNER", grantedBy: principal.userId }).onConflictDoNothing();
        await audit(tx, principal, "BUSINESS_OWNER_LINKED", "business", data.businessId, { userId: data.userId, status: data.status });
        return { ok: true };
      });
    }
    case "media.rights": {
      const data = parse(z.object({ id, rights: z.enum(["PENDIENTE", "AUTORIZADO", "RECHAZADO"]), altText: z.string().trim().max(300).nullable() }), input);
      return db.transaction(async tx => {
        const [asset] = await tx.update(mediaAssets).set({ rights: data.rights, altText: data.altText }).where(eq(mediaAssets.id, data.id)).returning();
        if (!asset) throw new AppError("Imagen no encontrada", 404);
        await audit(tx, principal, "MEDIA_REVIEWED", "media", data.id, { rights: data.rights });
        return asset;
      });
    }
    case "category.save": {
      const data = parse(z.object({ id: id.optional(), name: label, slug, parentId: id.nullable(), status }), input);
      return db.transaction(async tx => {
        if (data.id && data.parentId === data.id) throw new AppError("Una categoría no puede ser su propia subcategoría", 400);
        if (data.parentId) {
          const [parent] = await tx.select({ parentId: categories.parentId, status: categories.status }).from(categories).where(eq(categories.id, data.parentId)).limit(1);
          if (!parent || parent.parentId) throw new AppError("Selecciona una categoría principal válida", 400);
          if (data.status === "PUBLICADO" && parent.status !== "PUBLICADO") throw new AppError("Publica primero la categoría principal", 409);
        }
        const values = { name: data.name, slug: data.slug, parentId: data.parentId, status: data.status };
        const [row] = data.id ? await tx.update(categories).set(values).where(eq(categories.id, data.id)).returning() : await tx.insert(categories).values(values).returning();
        if (!row) throw new AppError("Categoría no encontrada", 404);
        await audit(tx, principal, "CATEGORY_SAVED", "category", row.id, { status: row.status });
        return row;
      });
    }
    case "amenity.save": {
      const data = parse(z.object({ id: id.optional(), name: label, slug, status }), input);
      return db.transaction(async tx => {
        const values = { name: data.name, slug: data.slug, status: data.status };
        const [row] = data.id ? await tx.update(amenities).set(values).where(eq(amenities.id, data.id)).returning() : await tx.insert(amenities).values(values).returning();
        if (!row) throw new AppError("Amenidad no encontrada", 404);
        await audit(tx, principal, "AMENITY_SAVED", "amenity", row.id);
        return row;
      });
    }
    case "state.save": {
      const data = parse(z.object({ id: id.optional(), code: z.string().trim().min(2).max(12), name: label }), input);
      return db.transaction(async tx => {
        const values = { code: data.code.toUpperCase(), name: data.name };
        const [row] = data.id ? await tx.update(states).set(values).where(eq(states.id, data.id)).returning() : await tx.insert(states).values(values).returning();
        if (!row) throw new AppError("Estado no encontrado", 404);
        await audit(tx, principal, "STATE_SAVED", "state", row.id);
        return row;
      });
    }
    case "city.save": {
      const data = parse(z.object({ id: id.optional(), stateId: id, name: label, slug }), input);
      return db.transaction(async tx => {
        const values = { stateId: data.stateId, name: data.name, slug: data.slug };
        const [row] = data.id ? await tx.update(cities).set(values).where(eq(cities.id, data.id)).returning() : await tx.insert(cities).values(values).returning();
        if (!row) throw new AppError("Ciudad no encontrada", 404);
        await audit(tx, principal, "CITY_SAVED", "city", row.id);
        return row;
      });
    }
    case "plan.save": {
      const data = parse(z.object({ id: id.optional(), code: z.enum(["GRATUITO", "BASICO", "PLUS"]), name: label, priceMinor: money, currency: z.enum(["MXN"]).nullable(), status }), input);
      if (data.status === "PUBLICADO" && (data.priceMinor === null || !data.currency)) throw new AppError("Configura precio y moneda antes de publicar", 409);
      return db.transaction(async tx => {
        if (data.status === "PUBLICADO") {
          if (!data.id) throw new AppError("Crea el plan pendiente antes de publicarlo", 409);
          const configured = await tx.select({ key: planBenefits.key }).from(planBenefits).where(eq(planBenefits.planId, data.id));
          if (adminBenefitKeys.some(key => !configured.some(row => row.key === key))) throw new AppError("Configura todos los beneficios antes de publicar el plan", 409);
        }
        const values = { code: data.code, name: data.name, priceMinor: data.priceMinor, currency: data.currency, status: data.status };
        const [row] = data.id ? await tx.update(plans).set(values).where(eq(plans.id, data.id)).returning() : await tx.insert(plans).values(values).returning();
        if (!row) throw new AppError("Plan no encontrado", 404);
        await audit(tx, principal, "PLAN_SAVED", "plan", row.id, { status: row.status });
        return row;
      });
    }
    case "benefit.save": {
      const data = parse(z.object({ planId: id, key: z.enum(adminBenefitKeys), value: z.union([z.boolean(), z.number().int().min(0).max(1000)]) }), input);
      if (data.key === "max_photos" ? typeof data.value !== "number" : typeof data.value !== "boolean") throw new AppError("Tipo de beneficio inválido", 400);
      return db.transaction(async tx => {
        await tx.insert(planBenefits).values(data).onConflictDoUpdate({ target: [planBenefits.planId, planBenefits.key], set: { value: data.value } });
        await audit(tx, principal, "BENEFIT_SAVED", "plan", data.planId, { key: data.key, value: data.value });
        return { ok: true };
      });
    }
    case "subscription.save": {
      const data = parse(z.object({ id: id.optional(), businessId: id, planId: id, status: z.enum(["PENDIENTE", "ACTIVA", "SUSPENDIDA", "CANCELADA", "VENCIDA"]), startsAt: z.iso.datetime().nullable(), endsAt: z.iso.datetime().nullable() }), input);
      return db.transaction(async tx => {
        if (data.status === "ACTIVA") {
          const [plan] = await tx.select({ status: plans.status }).from(plans).where(eq(plans.id, data.planId)).limit(1);
          if (plan?.status !== "PUBLICADO") throw new AppError("El plan debe estar publicado", 409);
        }
        const values = { businessId: data.businessId, planId: data.planId, status: data.status, startsAt: data.startsAt ? new Date(data.startsAt) : null, endsAt: data.endsAt ? new Date(data.endsAt) : null };
        const [row] = data.id ? await tx.update(subscriptions).set(values).where(eq(subscriptions.id, data.id)).returning() : await tx.insert(subscriptions).values(values).returning();
        if (!row) throw new AppError("Suscripción no encontrada", 404);
        await audit(tx, principal, "SUBSCRIPTION_SAVED", "subscription", row.id, { status: row.status });
        return row;
      });
    }
    case "setting.save": {
      const data = parse(z.object({ key: z.enum(adminSettingKeys), value: z.string().trim().max(5000).nullable(), status }), input);
      if (data.status === "PUBLICADO" && !data.value) throw new AppError("Completa el valor antes de publicarlo", 409);
      if (data.value && data.key.endsWith("_url")) z.url().parse(data.value);
      return db.transaction(async tx => {
        const values = { value: data.value ? { text: data.value } : null, status: data.status, updatedBy: principal.userId, updatedAt: new Date() };
        const [row] = await tx.insert(platformSettings).values({ key: data.key, ...values }).onConflictDoUpdate({ target: platformSettings.key, set: values }).returning();
        await audit(tx, principal, "SETTING_SAVED", "setting", data.key, { status: data.status });
        return row;
      });
    }
    case "contact.save": {
      const data = parse(z.object({ id: id.optional(), kind: z.enum(["EMAIL", "PHONE", "WHATSAPP", "FACEBOOK", "INSTAGRAM", "TIKTOK", "WEBSITE"]), value: z.string().trim().max(500).nullable(), status }), input);
      if (data.status === "PUBLICADO" && !data.value) throw new AppError("Completa el contacto antes de publicarlo", 409);
      if (data.value && ["FACEBOOK", "INSTAGRAM", "TIKTOK", "WEBSITE"].includes(data.kind)) z.url().parse(data.value);
      if (data.value && data.kind === "EMAIL") z.email().parse(data.value);
      return db.transaction(async tx => {
        const values = { kind: data.kind, value: data.value, status: data.status, updatedBy: principal.userId };
        const [row] = data.id ? await tx.update(contactChannels).set(values).where(eq(contactChannels.id, data.id)).returning() : await tx.insert(contactChannels).values(values).returning();
        if (!row) throw new AppError("Contacto no encontrado", 404);
        await audit(tx, principal, "CONTACT_SAVED", "contact", row.id, { status: row.status });
        return row;
      });
    }
    case "rate.save": {
      const data = parse(z.object({ id: id.optional(), code: slug, priceMinor: money, currency: z.enum(["MXN"]).nullable(), status }), input);
      if (data.status === "PUBLICADO" && (data.priceMinor === null || !data.currency)) throw new AppError("Configura precio y moneda", 409);
      return db.transaction(async tx => {
        const values = { code: data.code, priceMinor: data.priceMinor, currency: data.currency, status: data.status };
        const [row] = data.id ? await tx.update(advertisingRates).set(values).where(eq(advertisingRates.id, data.id)).returning() : await tx.insert(advertisingRates).values(values).returning();
        if (!row) throw new AppError("Tarifa no encontrada", 404);
        await audit(tx, principal, "RATE_SAVED", "rate", row.id, { status: row.status });
        return row;
      });
    }
    case "legal.save": {
      const data = parse(z.object({ kind: z.enum(["TERMINOS", "PRIVACIDAD", "COOKIES", "OTRO"]), body: z.string().trim().max(100_000).nullable(), status }), input);
      if (data.status === "PUBLICADO" && (!data.body || data.body.length < 100)) throw new AppError("El documento debe estar completo", 409);
      return db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${data.kind}))`);
        const [latest] = await tx.select({ version: sql<number>`coalesce(max(${legalDocuments.version}), 0)` }).from(legalDocuments).where(eq(legalDocuments.kind, data.kind));
        const [row] = await tx.insert(legalDocuments).values({ kind: data.kind, version: Number(latest.version) + 1, body: data.body, status: data.status, publishedAt: data.status === "PUBLICADO" ? new Date() : null }).returning();
        await audit(tx, principal, "LEGAL_VERSION_CREATED", "legal", row.id, { kind: data.kind, version: row.version, status: row.status });
        return row;
      });
    }
    case "content.save": {
      const data = parse(z.object({ kind: z.enum(["promotion", "event", "advertisement"]), id: id.optional(), businessId: id.nullable(), title: label, description: z.string().trim().min(10).max(5000), status: z.enum(["BORRADOR", "EN_REVISION", "PUBLICADO", "RECHAZADO", "ARCHIVADO"]), startsAt: z.iso.datetime().nullable(), endsAt: z.iso.datetime().nullable() }), input);
      if (data.kind === "promotion" && !data.businessId) throw new AppError("La promoción requiere un negocio", 400);
      if (data.status === "PUBLICADO" && data.businessId) await verifyPublishableBusiness(db, data.businessId);
      if (data.status === "PUBLICADO" && data.businessId && ["promotion", "event"].includes(data.kind) && !await hasBusinessBenefit(db, data.businessId, data.kind === "promotion" ? "promotions" : "events")) throw new AppError("La suscripción activa no incluye este beneficio", 403);
      if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) throw new AppError("La fecha final debe ser posterior", 400);
      return db.transaction(async tx => {
        const values = { businessId: data.businessId, content: { title: data.title, description: data.description }, status: data.status, startsAt: data.startsAt ? new Date(data.startsAt) : null, endsAt: data.endsAt ? new Date(data.endsAt) : null, approvedBy: data.status === "PUBLICADO" ? principal.userId : null };
        let row;
        if (data.kind === "promotion") [row] = data.id ? await tx.update(promotions).set({ ...values, businessId: data.businessId! }).where(eq(promotions.id, data.id)).returning() : await tx.insert(promotions).values({ ...values, businessId: data.businessId! }).returning();
        else if (data.kind === "event") [row] = data.id ? await tx.update(events).set(values).where(eq(events.id, data.id)).returning() : await tx.insert(events).values(values).returning();
        else [row] = data.id ? await tx.update(advertisements).set(values).where(eq(advertisements.id, data.id)).returning() : await tx.insert(advertisements).values(values).returning();
        if (!row) throw new AppError("Contenido no encontrado", 404);
        await audit(tx, principal, "CONTENT_SAVED", data.kind, row.id, { status: data.status });
        return row;
      });
    }
    default: throw new AppError("Operación desconocida", 404);
  }
}

