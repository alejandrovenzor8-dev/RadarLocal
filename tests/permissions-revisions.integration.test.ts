import { afterAll, beforeAll, expect, test } from "vitest";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/db/all-schema";
import { hasBusinessBenefit, requireBusinessOwner, type Principal } from "@/lib/server/permissions";
import { decideBusinessChange, saveBusinessDraft, submitBusinessDraft } from "@/lib/server/revisions";

const url = process.env.TEST_DATABASE_URL;
const client = new Client({ connectionString: url });
const db = drizzle({ client, schema });
const id = () => crypto.randomUUID();
const owner: Principal = { userId: id(), roles: ["BUSINESS_OWNER"] };
const otherOwner: Principal = { userId: id(), roles: ["BUSINESS_OWNER"] };
const admin: Principal = { userId: id(), roles: ["ADMIN"] };
let businessId: string;
let otherBusinessId: string;
let categoryId: string;
let cityId: string;

beforeAll(async () => {
  if (!url || !url.includes("radarlocal_phase1_test")) throw new Error("Se requiere la base descartable radarlocal_phase1_test");
  await client.connect();
  for (const principal of [owner, otherOwner, admin]) {
    await db.insert(schema.user).values({ id: principal.userId, name: "Prueba", email: `${principal.userId}@example.test` });
    await db.insert(schema.userRoles).values({ userId: principal.userId, role: principal.roles[0] });
  }
  const [state] = await db.insert(schema.states).values({ code: `T-${id()}`, name: "Estado de prueba" }).returning({ id: schema.states.id });
  const [city] = await db.insert(schema.cities).values({ stateId: state.id, name: "Ciudad de prueba", slug: `city-${id()}` }).returning({ id: schema.cities.id });
  cityId = city.id;
  const [category] = await db.insert(schema.categories).values({ slug: `category-${id()}`, name: "Categoría de prueba", status: "PUBLICADO" }).returning({ id: schema.categories.id });
  categoryId = category.id;
  const [business, other] = await db.insert(schema.businesses).values([
    { slug: `business-${id()}`, name: "Negocio propio", cityId, categoryId, verification: "VERIFICADO" },
    { slug: `business-${id()}`, name: "Negocio ajeno", cityId, categoryId, verification: "VERIFICADO" },
  ]).returning({ id: schema.businesses.id });
  businessId = business.id;
  otherBusinessId = other.id;
  await db.insert(schema.businessMemberships).values([
    { businessId, userId: owner.userId, status: "ACTIVO" },
    { businessId, userId: otherOwner.userId, status: "ACTIVO" },
    { businessId: otherBusinessId, userId: otherOwner.userId, status: "ACTIVO" },
  ]);
});
afterAll(async () => { await client.end(); });

const snapshot = () => ({ name: "Negocio propio", description: "Descripción real pendiente de revisión", categoryId, cityId, services: [], amenityIds: [], mediaAssetIds: [] });

test("aísla negocios y aplica beneficios configurados", async () => {
  await expect(requireBusinessOwner(db, owner, businessId)).resolves.toBeUndefined();
  await expect(requireBusinessOwner(db, owner, otherBusinessId)).rejects.toMatchObject({ status: 403 });
  expect(await hasBusinessBenefit(db, businessId, "promotions.publish")).toBe(false);
  const [plan] = await db.insert(schema.plans).values({ code: `test-${id()}`, name: "Plan de prueba", status: "PUBLICADO" }).returning({ id: schema.plans.id });
  await db.insert(schema.planBenefits).values({ planId: plan.id, key: "promotions.publish", value: true });
  await db.insert(schema.subscriptions).values({ businessId, planId: plan.id, status: "ACTIVA", startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 86400000) });
  expect(await hasBusinessBenefit(db, businessId, "promotions.publish")).toBe(true);
  expect(await hasBusinessBenefit(db, otherBusinessId, "promotions.publish")).toBe(false);
});

test("el borrador es privado y dos solicitudes basadas en la misma versión no pueden publicarse", async () => {
  await expect(saveBusinessDraft(db, owner, otherBusinessId, snapshot())).rejects.toMatchObject({ status: 403 });
  await saveBusinessDraft(db, owner, businessId, snapshot());
  await saveBusinessDraft(db, otherOwner, businessId, snapshot());
  expect(await db.select().from(schema.businessPublications).where(eq(schema.businessPublications.businessId, businessId))).toHaveLength(0);
  const first = await submitBusinessDraft(db, owner, businessId);
  const second = await submitBusinessDraft(db, otherOwner, businessId);
  await expect(decideBusinessChange(db, owner, first.requestId, "APROBADA")).rejects.toMatchObject({ status: 403 });
  const approved = await decideBusinessChange(db, admin, first.requestId, "APROBADA");
  expect(approved.publishedVersion).toBe(first.version);
  await expect(decideBusinessChange(db, admin, second.requestId, "APROBADA")).rejects.toMatchObject({ status: 409 });
  const [publicRow] = await db.select().from(schema.businessPublications).where(eq(schema.businessPublications.businessId, businessId));
  expect(publicRow.version).toBe(first.version);
  expect(await db.select().from(schema.reviewDecisions).where(eq(schema.reviewDecisions.requestId, first.requestId))).toHaveLength(1);
  expect(await db.select().from(schema.notificationOutbox).where(eq(schema.notificationOutbox.userId, owner.userId))).toHaveLength(1);
});

test("dos aprobaciones simultáneas resuelven una sola solicitud", async () => {
  await saveBusinessDraft(db, owner, businessId, snapshot());
  const next = await submitBusinessDraft(db, owner, businessId);
  const secondClient = new Client({ connectionString: url });
  await secondClient.connect();
  try {
    const secondDb = drizzle({ client: secondClient, schema });
    const results = await Promise.allSettled([
      decideBusinessChange(db, admin, next.requestId, "APROBADA"),
      decideBusinessChange(secondDb, admin, next.requestId, "APROBADA"),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await db.select().from(schema.reviewDecisions).where(eq(schema.reviewDecisions.requestId, next.requestId))).toHaveLength(1);
  } finally {
    await secondClient.end();
  }
});
