import { afterAll, beforeAll, expect, test } from "vitest";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/db/all-schema";
import { readOwnerBusiness, readOwnerDashboard } from "@/lib/server/owner-data";
import { saveBusinessDraft, submitBusinessDraft, decideBusinessChange } from "@/lib/server/revisions";
import { discardPendingImage, isPublicMedia, uploadBusinessImage, validateImage } from "@/lib/server/media";
import { saveOwnerContent } from "@/lib/server/owner-content";
import { applyAdminAction } from "@/lib/server/admin-actions";
import type { Principal } from "@/lib/server/permissions";

const url = process.env.TEST_DATABASE_URL;
const client = new Client({ connectionString: url });
const db = drizzle({ client, schema });
const id = () => crypto.randomUUID();
const owner: Principal = { userId: id(), roles: ["BUSINESS_OWNER"] };
const stranger: Principal = { userId: id(), roles: ["BUSINESS_OWNER"] };
const emptyOwner: Principal = { userId: id(), roles: ["BUSINESS_OWNER"] };
const reviewer: Principal = { userId: id(), roles: ["ADMIN"] };
const superAdmin: Principal = { userId: id(), roles: ["SUPER_ADMIN"] };
let businessId: string; let otherId: string; let categoryId: string; let cityId: string;
const pngBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const stored = new Map<string, Uint8Array>();
const bucket = { put: async (key: string, bytes: Uint8Array) => { stored.set(key, bytes); return { key }; }, delete: async (key: string) => { stored.delete(key); } } as unknown as R2Bucket;

beforeAll(async () => {
  if (!url?.includes("radarlocal_phase1_test")) throw new Error("Se requiere una base descartable radarlocal_phase1_test");
  await client.connect();
  for (const principal of [owner, stranger, emptyOwner, reviewer, superAdmin]) await db.insert(schema.user).values({ id: principal.userId, name: "Prueba de propietario", email: `${principal.userId}@example.test`, emailVerified: true });
  const [state] = await db.insert(schema.states).values({ code: `T-${id()}`, name: "Estado de prueba" }).returning({ id: schema.states.id });
  const [city] = await db.insert(schema.cities).values({ stateId: state.id, name: "Ciudad de prueba", slug: `city-${id()}` }).returning({ id: schema.cities.id }); cityId = city.id;
  const [category] = await db.insert(schema.categories).values({ slug: `category-${id()}`, name: "Categoría de prueba", status: "PUBLICADO" }).returning({ id: schema.categories.id }); categoryId = category.id;
  const [own, foreign] = await db.insert(schema.businesses).values([{ slug: `own-${id()}`, name: "Negocio de prueba", categoryId, cityId, verification: "VERIFICADO" }, { slug: `foreign-${id()}`, name: "Negocio ajeno", categoryId, cityId, verification: "VERIFICADO" }]).returning({ id: schema.businesses.id }); businessId = own.id; otherId = foreign.id;
  await db.insert(schema.businessMemberships).values([{ businessId, userId: owner.userId, status: "ACTIVO" }, { businessId: otherId, userId: stranger.userId, status: "ACTIVO" }]);
  const [plan] = await db.insert(schema.plans).values({ code: `test-${id()}`, name: "Plan de prueba", status: "PUBLICADO" }).returning({ id: schema.plans.id });
  await db.insert(schema.planBenefits).values([{ planId: plan.id, key: "profile_edit", value: true }, { planId: plan.id, key: "max_photos", value: 1 }, { planId: plan.id, key: "promotions", value: true }, { planId: plan.id, key: "events", value: false }]);
  await db.insert(schema.subscriptions).values({ businessId, planId: plan.id, status: "ACTIVA" });
});
afterAll(async () => { await client.end(); });

test("dashboard vacío y aislamiento entre negocios", async () => {
  expect((await readOwnerDashboard(db, emptyOwner)).businesses).toHaveLength(0);
  expect((await readOwnerDashboard(db, owner)).businesses.map(item => item.business.id)).toEqual([businessId]);
  await expect(readOwnerBusiness(db, owner, otherId)).rejects.toMatchObject({ status: 403 });
  await expect(readOwnerBusiness(db, stranger, businessId)).rejects.toMatchObject({ status: 403 });
});

test("autoguardado parcial, recuperación y aprobación sin publicación anticipada", async () => {
  await saveBusinessDraft(db, owner, businessId, { name: "N", description: "corto" }, true);
  const detail = await readOwnerBusiness(db, owner, businessId);
  expect(detail.draft?.snapshot.name).toBe("N");
  await expect(submitBusinessDraft(db, owner, businessId)).rejects.toBeTruthy();
  await saveBusinessDraft(db, owner, businessId, { name: "Negocio de prueba", description: "Descripción completa para revisión del negocio", categoryId, cityId }, true);
  const request = await submitBusinessDraft(db, owner, businessId);
  expect((await readOwnerBusiness(db, owner, businessId)).publication).toBeNull();
  await decideBusinessChange(db, reviewer, request.requestId, "RECHAZADA", "Falta comprobar la información");
  expect((await readOwnerBusiness(db, owner, businessId)).publication).toBeNull();
  await saveBusinessDraft(db, owner, businessId, { description: "Información comprobada y lista para revisión" }, true);
  const approvedRequest = await submitBusinessDraft(db, owner, businessId);
  await decideBusinessChange(db, reviewer, approvedRequest.requestId, "APROBADA");
  expect((await readOwnerBusiness(db, owner, businessId)).publication?.version).toBe(approvedRequest.version);
});

test("R2 privado: tipo, tamaño, cuota, aislamiento y publicación aprobada", async () => {
  expect(() => validateImage(new Uint8Array([1, 2, 3]), "image/png", 3)).toThrow();
  await expect(uploadBusinessImage(db, owner, businessId, new File([pngBytes], "test.png", { type: "image/png" }), "photo")).rejects.toMatchObject({ status: 503 });
  await expect(uploadBusinessImage(db, stranger, businessId, new File([pngBytes], "test.png", { type: "image/png" }), "photo", bucket)).rejects.toMatchObject({ status: 403 });
  const asset = await uploadBusinessImage(db, owner, businessId, new File([pngBytes], "test.png", { type: "image/png" }), "photo", bucket);
  expect(asset.rights).toBe("PENDIENTE"); expect(stored.size).toBe(1);
  await expect(uploadBusinessImage(db, owner, businessId, new File([pngBytes], "second.png", { type: "image/png" }), "photo", bucket)).rejects.toMatchObject({ status: 403 });
  const publicationBefore = (await readOwnerBusiness(db, owner, businessId)).publication?.version;
  await saveBusinessDraft(db, owner, businessId, { mediaAssetIds: [asset.id], coverAssetId: asset.id }, true);
  const submitted = await submitBusinessDraft(db, owner, businessId);
  expect(await isPublicMedia(db, asset.id, businessId)).toBe(false);
  await expect(decideBusinessChange(db, reviewer, submitted.requestId, "APROBADA")).rejects.toMatchObject({ status: 409 });
  expect((await readOwnerBusiness(db, owner, businessId)).publication?.version).toBe(publicationBefore);
  await db.update(schema.mediaAssets).set({ rights: "AUTORIZADO" }).where(eq(schema.mediaAssets.id, asset.id));
  await decideBusinessChange(db, reviewer, submitted.requestId, "APROBADA");
  expect(await isPublicMedia(db, asset.id, businessId)).toBe(true);
  const staged = await uploadBusinessImage(db, owner, businessId, new File([pngBytes], "replacement.png", { type: "image/png" }), "photo", bucket);
  await expect(discardPendingImage(db, stranger, businessId, staged.id)).rejects.toMatchObject({ status: 403 });
  await discardPendingImage(db, owner, businessId, staged.id);
  expect(await isPublicMedia(db, staged.id, businessId)).toBe(false);
  await expect(uploadBusinessImage(db, owner, businessId, new File([pngBytes], "next.png", { type: "image/png" }), "photo", bucket)).resolves.toMatchObject({ rights: "PENDIENTE" });
});

test("promociones y eventos dependen del plan y se envían sin publicación directa", async () => {
  await expect(saveOwnerContent(db, owner, businessId, { kind: "event", title: "Evento de prueba", description: "Descripción de prueba suficiente", startsAt: null, endsAt: null, action: "save" })).rejects.toMatchObject({ status: 403 });
  const draft = await saveOwnerContent(db, owner, businessId, { kind: "promotion", title: "Promoción de prueba", description: "Descripción de prueba suficiente", startsAt: null, endsAt: null, action: "save" });
  expect(draft.status).toBe("BORRADOR");
  const submitted = await saveOwnerContent(db, owner, businessId, { kind: "promotion", id: draft.id, title: "Promoción de prueba", description: "Descripción de prueba suficiente", startsAt: null, endsAt: null, action: "submit" });
  expect(submitted.status).toBe("EN_REVISION");
  await expect(saveOwnerContent(db, owner, businessId, { kind: "promotion", id: draft.id, title: "Alteración", description: "Descripción de prueba suficiente", startsAt: null, endsAt: null, action: "save" })).rejects.toMatchObject({ status: 409 });
  const approved = await applyAdminAction(db, superAdmin, "content.save", { kind: "promotion", id: draft.id, businessId, title: "Promoción de prueba", description: "Descripción de prueba suficiente", status: "PUBLICADO", startsAt: null, endsAt: null });
  expect((approved as { status: string }).status).toBe("PUBLICADO");
});
