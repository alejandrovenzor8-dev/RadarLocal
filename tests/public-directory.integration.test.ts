import { afterAll, beforeAll, expect, test } from "vitest";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/all-schema";
import { accountDestination } from "@/lib/account-destination";
import { getPublicBusiness, listPublicBusinesses, listPublicContent } from "@/lib/server/public-directory";

const url = process.env.TEST_DATABASE_URL;
const client = new Client({ connectionString: url });
const db = drizzle({ client, schema });
const unique = () => crypto.randomUUID();
let stateId: string; let cityId: string; let categoryId: string; let amenityId: string; let publicSlug: string; let privateSlug: string; let publishedId: string; let approvedMediaId: string; let pendingMediaId: string;
const now = Date.now();

beforeAll(async () => {
  if (!url?.includes("radarlocal_phase1_test")) throw new Error("Usa exclusivamente radarlocal_phase1_test");
  await client.connect();
  const userId = unique();
  await db.insert(schema.user).values({ id: userId, name: "Revisor de prueba", email: `${userId}@example.test`, emailVerified: true });
  const [state] = await db.insert(schema.states).values({ code: `P-${unique()}`, name: "Estado de prueba pública" }).returning({ id: schema.states.id }); stateId = state.id;
  const [city] = await db.insert(schema.cities).values({ stateId, name: "Ciudad de prueba pública", slug: `city-${unique()}` }).returning({ id: schema.cities.id }); cityId = city.id;
  const [category] = await db.insert(schema.categories).values({ slug: `cat-${unique()}`, name: "Restaurantes", status: "PUBLICADO" }).returning({ id: schema.categories.id }); categoryId = category.id;
  const [amenity] = await db.insert(schema.amenities).values({ slug: `amenity-${unique()}`, name: "Terraza", status: "PUBLICADO" }).returning({ id: schema.amenities.id }); amenityId = amenity.id;
  publicSlug = `public-${unique()}`; privateSlug = `private-${unique()}`;
  const [published, unpublished, unverified, suspended] = await db.insert(schema.businesses).values([
    { slug: publicSlug, name: "Restaurante aprobado", categoryId, cityId, status: "PUBLICADO", verification: "VERIFICADO" },
    { slug: privateSlug, name: "Negocio pendiente", categoryId, cityId, status: "PENDIENTE_CONFIGURACION", verification: "VERIFICADO" },
    { slug: `unverified-${unique()}`, name: "Negocio no verificado", categoryId, cityId, status: "PUBLICADO", verification: "PENDIENTE_VERIFICACION" },
    { slug: `suspended-${unique()}`, name: "Negocio suspendido", categoryId, cityId, status: "PUBLICADO", verification: "VERIFICADO", suspendedAt: new Date() },
  ]).returning({ id: schema.businesses.id }); publishedId = published.id;
  const [approvedMedia, pendingMedia] = await db.insert(schema.mediaAssets).values([
    { businessId: published.id, kind: "photo", rights: "AUTORIZADO", storageKey: `private/test/${unique()}.png` },
    { businessId: published.id, kind: "photo", rights: "PENDIENTE", storageKey: `private/test/${unique()}.png` },
  ]).returning({ id: schema.mediaAssets.id }); approvedMediaId = approvedMedia.id; pendingMediaId = pendingMedia.id;
  const makeSnapshot = (name: string) => ({ name, description: "Descripción aprobada y verificable del negocio", categoryId, cityId, address: "Dirección de prueba", phone: null, website: null, services: ["Comida local"], amenityIds: [amenityId], mediaAssetIds: [approvedMedia.id, pendingMedia.id], latitude: 28.63, longitude: -106.06 });
  for (const [business, name] of [[published, "Restaurante aprobado"], [unpublished, "Negocio pendiente"], [unverified, "Negocio no verificado"], [suspended, "Negocio suspendido"]] as const) {
    const [revision] = await db.insert(schema.businessRevisions).values({ businessId: business.id, version: 1, snapshot: makeSnapshot(name), createdBy: userId }).returning({ id: schema.businessRevisions.id });
    await db.insert(schema.businessPublications).values({ businessId: business.id, revisionId: revision.id, version: 1, publishedBy: userId });
  }
  await db.insert(schema.businessLocations).values({ businessId: published.id, latitude: 28.63, longitude: -106.06, verified: true });
  await db.insert(schema.promotions).values([
    { businessId: published.id, content: { title: "Promoción aprobada", description: "Vigente" }, status: "PUBLICADO", approvedBy: userId, startsAt: new Date(now - 1000), endsAt: new Date(now + 86400000) },
    { businessId: published.id, content: { title: "Promoción vencida" }, status: "PUBLICADO", approvedBy: userId, endsAt: new Date(now - 1000) },
    { businessId: published.id, content: { title: "Promoción pendiente" }, status: "EN_REVISION" },
    { businessId: unpublished.id, content: { title: "Promoción de ficha privada" }, status: "PUBLICADO", approvedBy: userId },
  ]);
  await db.insert(schema.events).values([{ businessId: published.id, content: { title: "Evento aprobado", description: "Próximo" }, status: "PUBLICADO", approvedBy: userId, startsAt: new Date(now + 86400000) }]);
});
afterAll(async () => { await client.end(); });

test("excluye negocios pendientes, no verificados y suspendidos", async () => {
  const result = await listPublicBusinesses(db, { q: "Negocio" });
  expect(result.items.some(item => item.slug === privateSlug)).toBe(false);
  expect(await getPublicBusiness(db, privateSlug)).toBeNull();
  expect((await listPublicBusinesses(db, { q: "Restaurante aprobado" })).items.some(item => item.slug === publicSlug)).toBe(true);
});
test("búsqueda, filtros, ubicación verificada y paginación", async () => {
  const filter = { q: "Restaurante aprobado", category: categoryId, state: stateId, city: cityId, service: "comida", amenity: amenityId, lat: 28.63, lng: -106.06, radiusKm: 5 };
  const result = await listPublicBusinesses(db, filter);
  expect(result.items.map(item => item.slug)).toEqual([publicSlug]);
  expect(result.items[0].latitude).toBe(28.63);
  expect((await listPublicBusinesses(db, { ...filter, service: "inexistente" })).items).toHaveLength(0);
  expect((await listPublicBusinesses(db, { ...filter, page: 2 })).items).toHaveLength(0);
});
test("la ficha excluye fotografías sin derechos y conserva solo contenido aprobado", async () => {
  const detail = await getPublicBusiness(db, publicSlug);
  expect(detail?.id).toBe(publishedId);
  expect(detail?.images.map(image => image.id)).toEqual([approvedMediaId]);
  expect(detail?.images.some(image => image.id === pendingMediaId)).toBe(false);
  expect(detail?.promotions.map(item => item.title)).toEqual(["Promoción aprobada"]);
  expect(detail?.events.map(item => item.title)).toEqual(["Evento aprobado"]);
  const content = await listPublicContent(db);
  expect(content.promotions.some(item => item.title === "Promoción pendiente" || item.title === "Promoción de ficha privada" || item.title === "Promoción vencida")).toBe(false);
});
test("la redirección procede de roles consultados en servidor", () => {
  expect(accountDestination(["CUSTOMER"])).toBe("/mi-cuenta");
  expect(accountDestination(["BUSINESS_OWNER", "CUSTOMER"])).toBe("/panel-negocio");
  expect(accountDestination(["SUPER_ADMIN"])).toBe("/super-admin");
});
