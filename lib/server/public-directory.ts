import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lte, gt, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db";
import { amenities, businessLocations, businessPublications, businessRevisions, businesses, categories, cities, events, mediaAssets, promotions, states } from "@/db/schema";
import { businessSnapshotSchema, type BusinessSnapshot } from "./business-snapshot";

export const directoryFilterSchema = z.object({
  q: z.string().trim().max(100).default(""),
  category: z.string().uuid().optional(),
  state: z.string().uuid().optional(),
  city: z.string().uuid().optional(),
  service: z.string().trim().max(100).optional(),
  amenity: z.string().uuid().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
}).refine(value => (!value.lat && value.lat !== 0) === (!value.lng && value.lng !== 0), "Indica latitud y longitud juntas");
export type DirectoryFilter = z.infer<typeof directoryFilterSchema>;

export type PublicBusiness = {
  id: string; slug: string; name: string; description: string; category: { id: string; name: string; parentId: string | null };
  city: { id: string; name: string }; state: { id: string; name: string }; address: string | null;
  latitude: number | null; longitude: number | null; imageUrl: string | null;
};
export type DirectoryResult = { items: PublicBusiness[]; total: number; page: number; pages: number };

const eligibility = and(
  eq(businesses.status, "PUBLICADO"), eq(businesses.verification, "VERIFICADO"), isNull(businesses.suspendedAt),
  eq(categories.status, "PUBLICADO"),
  sql`${businessRevisions.businessId} = ${businesses.id}`,
  sql`${businessRevisions.snapshot}->>'categoryId' = ${categories.id}::text`,
  sql`${businessRevisions.snapshot}->>'cityId' = ${cities.id}::text`,
);

function baseRows(db: Database) {
  return db.select({ business: businesses, snapshot: businessRevisions.snapshot, category: categories, city: cities, state: states })
    .from(businesses)
    .innerJoin(businessPublications, eq(businessPublications.businessId, businesses.id))
    .innerJoin(businessRevisions, eq(businessRevisions.id, businessPublications.revisionId))
    .innerJoin(categories, sql`${categories.id}::text = ${businessRevisions.snapshot}->>'categoryId'`)
    .innerJoin(cities, sql`${cities.id}::text = ${businessRevisions.snapshot}->>'cityId'`)
    .innerJoin(states, eq(states.id, cities.stateId));
}

function whereFilters(filter: DirectoryFilter) {
  const conditions = [eligibility];
  if (filter.q) conditions.push(sql`(${businessRevisions.snapshot}->>'name' ILIKE ${`%${filter.q}%`} OR ${businessRevisions.snapshot}->>'description' ILIKE ${`%${filter.q}%`})`);
  if (filter.category) conditions.push(sql`(${categories.id} = ${filter.category}::uuid OR ${categories.parentId} = ${filter.category}::uuid)`);
  if (filter.state) conditions.push(eq(states.id, filter.state));
  if (filter.city) conditions.push(eq(cities.id, filter.city));
  if (filter.service) conditions.push(sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(${businessRevisions.snapshot}->'services', '[]'::jsonb)) AS service(value) WHERE service.value ILIKE ${`%${filter.service}%`})`);
  if (filter.amenity) conditions.push(sql`${businessRevisions.snapshot}->'amenityIds' ? ${filter.amenity}`);
  if (filter.lat !== undefined && filter.lng !== undefined) conditions.push(sql`EXISTS (SELECT 1 FROM ${businessLocations} location WHERE location.business_id = ${businesses.id} AND location.verified = true AND location.latitude = (${businessRevisions.snapshot}->>'latitude')::double precision AND location.longitude = (${businessRevisions.snapshot}->>'longitude')::double precision AND 6371 * 2 * asin(sqrt(power(sin(radians((location.latitude - ${filter.lat}) / 2)), 2) + cos(radians(${filter.lat})) * cos(radians(location.latitude)) * power(sin(radians((location.longitude - ${filter.lng}) / 2)), 2))) <= ${filter.radiusKm ?? 25})`);
  return and(...conditions);
}

async function authorizedImages(db: Database, businessId: string, snapshot: BusinessSnapshot) {
  if (!snapshot.mediaAssetIds.length) return [];
  const assets = await db.select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey, altText: mediaAssets.altText }).from(mediaAssets)
    .where(and(eq(mediaAssets.businessId, businessId), eq(mediaAssets.rights, "AUTORIZADO"), inArray(mediaAssets.id, snapshot.mediaAssetIds)));
  const byId = new Map(assets.filter(asset => asset.storageKey).map(asset => [asset.id, asset]));
  return snapshot.mediaAssetIds.flatMap(id => byId.has(id) ? [{ id, url: `/api/media/${id}`, altText: byId.get(id)?.altText ?? snapshot.name }] : []);
}

async function toPublic(db: Database, row: Awaited<ReturnType<ReturnType<typeof baseRows>["limit"]>>[number]): Promise<PublicBusiness | null> {
  const parsed = businessSnapshotSchema.safeParse(row.snapshot);
  if (!parsed.success) return null;
  const snapshot = parsed.data;
  const photos = await authorizedImages(db, row.business.id, snapshot);
  const [verifiedLocation] = snapshot.latitude !== null && snapshot.longitude !== null
    ? await db.select({ id: businessLocations.id }).from(businessLocations).where(and(eq(businessLocations.businessId, row.business.id), eq(businessLocations.verified, true), eq(businessLocations.latitude, snapshot.latitude), eq(businessLocations.longitude, snapshot.longitude))).limit(1)
    : [];
  return { id: row.business.id, slug: row.business.slug, name: snapshot.name, description: snapshot.description,
    category: { id: row.category.id, name: row.category.name, parentId: row.category.parentId },
    city: { id: row.city.id, name: row.city.name }, state: { id: row.state.id, name: row.state.name },
    address: snapshot.address, latitude: verifiedLocation ? snapshot.latitude : null, longitude: verifiedLocation ? snapshot.longitude : null,
    imageUrl: photos.find(photo => photo.id === snapshot.coverAssetId)?.url ?? photos[0]?.url ?? null };
}

export async function listPublicBusinesses(db: Database, raw: unknown): Promise<DirectoryResult> {
  const filter = directoryFilterSchema.parse(raw);
  const pageSize = 12;
  const [aggregate] = await db.select({ value: count() }).from(businesses)
    .innerJoin(businessPublications, eq(businessPublications.businessId, businesses.id))
    .innerJoin(businessRevisions, eq(businessRevisions.id, businessPublications.revisionId))
    .innerJoin(categories, sql`${categories.id}::text = ${businessRevisions.snapshot}->>'categoryId'`)
    .innerJoin(cities, sql`${cities.id}::text = ${businessRevisions.snapshot}->>'cityId'`)
    .innerJoin(states, eq(states.id, cities.stateId)).where(whereFilters(filter));
  const rows = await baseRows(db).where(whereFilters(filter)).orderBy(sql`${businessRevisions.snapshot}->>'name' ASC`, asc(businesses.id)).limit(pageSize).offset((filter.page - 1) * pageSize);
  const parsedRows = rows.flatMap(row => { const parsed = businessSnapshotSchema.safeParse(row.snapshot); return parsed.success ? [{ row, snapshot: parsed.data }] : []; });
  const ids = parsedRows.map(item => item.row.business.id);
  const photoIds = parsedRows.flatMap(item => item.snapshot.mediaAssetIds);
  const assetRows = photoIds.length ? await db.select({ id: mediaAssets.id, businessId: mediaAssets.businessId, storageKey: mediaAssets.storageKey }).from(mediaAssets)
    .where(and(inArray(mediaAssets.id, photoIds), eq(mediaAssets.rights, "AUTORIZADO"))) : [];
  const locationRows = ids.length ? await db.select({ businessId: businessLocations.businessId, latitude: businessLocations.latitude, longitude: businessLocations.longitude }).from(businessLocations)
    .where(and(inArray(businessLocations.businessId, ids), eq(businessLocations.verified, true))) : [];
  const converted = parsedRows.map(({ row, snapshot }) => {
    const orderedPhotos = snapshot.coverAssetId ? [snapshot.coverAssetId, ...snapshot.mediaAssetIds.filter(id => id !== snapshot.coverAssetId)] : snapshot.mediaAssetIds;
    const image = orderedPhotos.map(id => assetRows.find(asset => asset.id === id && asset.businessId === row.business.id && asset.storageKey)).find(Boolean);
    const point = locationRows.find(location => location.businessId === row.business.id && location.latitude === snapshot.latitude && location.longitude === snapshot.longitude);
    return { id: row.business.id, slug: row.business.slug, name: snapshot.name, description: snapshot.description,
      category: { id: row.category.id, name: row.category.name, parentId: row.category.parentId },
      city: { id: row.city.id, name: row.city.name }, state: { id: row.state.id, name: row.state.name }, address: snapshot.address,
      latitude: point?.latitude ?? null, longitude: point?.longitude ?? null,
      imageUrl: image ? `/api/media/${image.id}` : null } satisfies PublicBusiness;
  });
  return { items: converted, total: aggregate.value, page: filter.page, pages: Math.ceil(aggregate.value / pageSize) };
}

export async function getPublicBusiness(db: Database, slug: string) {
  const [row] = await baseRows(db).where(and(eligibility, eq(businesses.slug, slug))).limit(1);
  if (!row) return null;
  const card = await toPublic(db, row);
  if (!card) return null;
  const snapshot = businessSnapshotSchema.parse(row.snapshot);
  const images = await authorizedImages(db, row.business.id, snapshot);
  const amenityRows = snapshot.amenityIds.length ? await db.select({ id: amenities.id, name: amenities.name }).from(amenities).where(and(inArray(amenities.id, snapshot.amenityIds), eq(amenities.status, "PUBLICADO"))) : [];
  const now = new Date();
  const approved = and(eq(promotions.businessId, row.business.id), eq(promotions.status, "PUBLICADO"), isNotNull(promotions.approvedBy), or(isNull(promotions.startsAt), lte(promotions.startsAt, now)), or(isNull(promotions.endsAt), gt(promotions.endsAt, now)));
  const promoRows = await db.select({ id: promotions.id, content: promotions.content, endsAt: promotions.endsAt }).from(promotions).where(approved).orderBy(desc(promotions.startsAt)).limit(20);
  const eventRows = await db.select({ id: events.id, content: events.content, startsAt: events.startsAt, endsAt: events.endsAt }).from(events).where(and(eq(events.businessId, row.business.id), eq(events.status, "PUBLICADO"), isNotNull(events.approvedBy), isNotNull(events.startsAt), or(gt(events.startsAt, now), gt(events.endsAt, now)))).orderBy(asc(events.startsAt)).limit(20);
  return { ...card, contact: { phone: snapshot.phone, whatsapp: snapshot.whatsapp, email: snapshot.email, website: snapshot.website, instagram: snapshot.instagram, facebook: snapshot.facebook, tiktok: snapshot.tiktok },
    hours: snapshot.hours, services: snapshot.services, amenities: amenityRows, images,
    promotions: promoRows.map(contentEntry), events: eventRows.map(contentEntry) };
}

function contentEntry(row: { id: string; content: Record<string, unknown>; startsAt?: Date | null; endsAt: Date | null }) {
  return { id: row.id, title: typeof row.content.title === "string" ? row.content.title : "", description: typeof row.content.description === "string" ? row.content.description : "", startsAt: row.startsAt?.toISOString() ?? null, endsAt: row.endsAt?.toISOString() ?? null };
}

export async function listPublicTaxonomy(db: Database) {
  const categoryRows = await db.select({ id: categories.id, name: categories.name, parentId: categories.parentId }).from(categories).where(eq(categories.status, "PUBLICADO")).orderBy(asc(categories.name));
  const stateRows = await db.select({ id: states.id, name: states.name }).from(states).orderBy(asc(states.name));
  const cityRows = await db.select({ id: cities.id, name: cities.name, stateId: cities.stateId }).from(cities).orderBy(asc(cities.name));
  const amenityRows = await db.select({ id: amenities.id, name: amenities.name }).from(amenities).where(eq(amenities.status, "PUBLICADO")).orderBy(asc(amenities.name));
  return { categories: categoryRows, states: stateRows, cities: cityRows, amenities: amenityRows };
}

export async function listPublicContent(db: Database) {
  const now = new Date();
  const visibleBusiness = and(eligibility);
  const publicationJoin = eq(businessPublications.businessId, businesses.id);
  const revisionJoin = eq(businessRevisions.id, businessPublications.revisionId);
  const categoryJoin = sql`${categories.id}::text = ${businessRevisions.snapshot}->>'categoryId'`;
  const cityJoin = sql`${cities.id}::text = ${businessRevisions.snapshot}->>'cityId'`;
  const promoRows = await db.select({ id: promotions.id, content: promotions.content, startsAt: promotions.startsAt, endsAt: promotions.endsAt, slug: businesses.slug, businessName: sql<string>`${businessRevisions.snapshot}->>'name'` })
      .from(promotions).innerJoin(businesses, eq(promotions.businessId, businesses.id)).innerJoin(businessPublications, publicationJoin)
      .innerJoin(businessRevisions, revisionJoin).innerJoin(categories, categoryJoin).innerJoin(cities, cityJoin).innerJoin(states, eq(states.id, cities.stateId))
      .where(and(visibleBusiness, eq(promotions.status, "PUBLICADO"), isNotNull(promotions.approvedBy), or(isNull(promotions.startsAt), lte(promotions.startsAt, now)), or(isNull(promotions.endsAt), gt(promotions.endsAt, now))))
      .orderBy(desc(promotions.startsAt)).limit(24);
  const eventRows = await db.select({ id: events.id, content: events.content, startsAt: events.startsAt, endsAt: events.endsAt, slug: businesses.slug, businessName: sql<string>`${businessRevisions.snapshot}->>'name'` })
      .from(events).innerJoin(businesses, eq(events.businessId, businesses.id)).innerJoin(businessPublications, publicationJoin)
      .innerJoin(businessRevisions, revisionJoin).innerJoin(categories, categoryJoin).innerJoin(cities, cityJoin).innerJoin(states, eq(states.id, cities.stateId))
      .where(and(visibleBusiness, eq(events.status, "PUBLICADO"), isNotNull(events.approvedBy), isNotNull(events.startsAt), or(gt(events.startsAt, now), gt(events.endsAt, now))))
      .orderBy(asc(events.startsAt)).limit(24);
  return { promotions: promoRows.map(row => ({ ...contentEntry(row), slug: row.slug, businessName: row.businessName })),
    events: eventRows.map(row => ({ ...contentEntry(row), slug: row.slug, businessName: row.businessName })) };
}
