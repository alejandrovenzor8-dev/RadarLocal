import { afterAll, beforeAll, expect, test } from "vitest";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/all-schema";
import { applyAdminAction } from "@/lib/server/admin-actions";
import { readAdminSection } from "@/lib/server/admin-data";
import { hasBusinessBenefit, requireBusinessOwner, type Principal } from "@/lib/server/permissions";
import { saveBusinessDraft } from "@/lib/server/revisions";

const url = process.env.TEST_DATABASE_URL;
const client = new Client({ connectionString: url });
const db = drizzle({ client, schema });
const admin: Principal = { userId: crypto.randomUUID(), roles: ["SUPER_ADMIN"] };
const owner: Principal = { userId: crypto.randomUUID(), roles: ["BUSINESS_OWNER"] };
const other: Principal = { userId: crypto.randomUUID(), roles: ["BUSINESS_OWNER"] };
const unique = () => crypto.randomUUID().slice(0, 8);

beforeAll(async () => {
  if (!url?.includes("radarlocal_phase1_test")) throw new Error("Se requiere base descartable radarlocal_phase1_test");
  await client.connect();
  for (const principal of [admin, owner, other]) await db.insert(schema.user).values({ id: principal.userId, name: "Prueba administrativa", email: `${principal.userId}@example.test`, emailVerified: true });
});
afterAll(async () => { await client.end(); });

test("panel administrativo: autorización, configuración, planes, negocios, permisos y auditoría", async () => {
  await expect(applyAdminAction(db, owner, "setting.save", { key: "commercial_name", value: "RadarLocal", status: "PUBLICADO" })).rejects.toMatchObject({ status: 403 });
  const setting = await applyAdminAction(db, admin, "setting.save", { key: "description", value: null, status: "PENDIENTE_CONFIGURACION" }) as { status: string };
  expect(setting.status).toBe("PENDIENTE_CONFIGURACION");
  await expect(applyAdminAction(db, admin, "setting.save", { key: "description", value: null, status: "PUBLICADO" })).rejects.toMatchObject({ status: 409 });

  const state = await applyAdminAction(db, admin, "state.save", { code: `T${unique()}`, name: "Estado de prueba" }) as { id: string };
  const city = await applyAdminAction(db, admin, "city.save", { stateId: state.id, name: "Ciudad de prueba", slug: `ciudad-${unique()}` }) as { id: string };
  const category = await applyAdminAction(db, admin, "category.save", { name: "Categoría de prueba", slug: `categoria-${unique()}`, parentId: null, status: "PUBLICADO" }) as { id: string };
  const subcategory = await applyAdminAction(db, admin, "category.save", { name: "Subcategoría", slug: `subcategoria-${unique()}`, parentId: category.id, status: "PUBLICADO" }) as { parentId: string };
  expect(subcategory.parentId).toBe(category.id);

  const business = await applyAdminAction(db, admin, "business.create", { name: "Negocio por verificar", slug: `negocio-${unique()}`, categoryId: category.id, cityId: city.id, sourceUrl: null, sourceNotes: "Prueba aislada" }) as { id: string; status: string };
  expect(business.status).toBe("PENDIENTE_CONFIGURACION");
  const suspended = await applyAdminAction(db, admin, "business.update", { id: business.id, name: "Negocio por verificar", categoryId: category.id, cityId: city.id, sourceUrl: null, sourceNotes: "Prueba aislada", status: "PENDIENTE_CONFIGURACION", verification: "VERIFICADO", suspended: true }) as { suspendedAt: Date };
  expect(suspended.suspendedAt).toBeTruthy();
  const restored = await applyAdminAction(db, admin, "business.update", { id: business.id, name: "Negocio por verificar", categoryId: category.id, cityId: city.id, sourceUrl: null, sourceNotes: "Prueba aislada", status: "PENDIENTE_CONFIGURACION", verification: "VERIFICADO", suspended: false }) as { suspendedAt: Date | null };
  expect(restored.suspendedAt).toBeNull();
  await expect(applyAdminAction(db, admin, "business.update", { id: business.id, name: "Negocio por verificar", categoryId: category.id, cityId: city.id, sourceUrl: null, sourceNotes: "Prueba aislada", status: "PUBLICADO", verification: "VERIFICADO", suspended: false })).rejects.toMatchObject({ status: 409 });
  await expect(applyAdminAction(db, owner, "business.update", {})).rejects.toMatchObject({ status: 403 });
  await expect(requireBusinessOwner(db, other, business.id)).rejects.toMatchObject({ status: 403 });
  await applyAdminAction(db, admin, "business.owner", { businessId: business.id, userId: owner.userId, status: "ACTIVO" });
  await expect(requireBusinessOwner(db, owner, business.id)).resolves.toBeUndefined();
  await expect(requireBusinessOwner(db, other, business.id)).rejects.toMatchObject({ status: 403 });

  const [existingPlan] = await db.select({ id: schema.plans.id }).from(schema.plans).where(eq(schema.plans.code, "GRATUITO")).limit(1);
  const plan = await applyAdminAction(db, admin, "plan.save", { ...(existingPlan ? { id: existingPlan.id } : {}), code: "GRATUITO", name: "Gratuito", priceMinor: null, currency: null, status: "PENDIENTE_CONFIGURACION" }) as { id: string };
  await expect(applyAdminAction(db, admin, "plan.save", { id: plan.id, code: "GRATUITO", name: "Gratuito", priceMinor: null, currency: null, status: "PUBLICADO" })).rejects.toMatchObject({ status: 409 });
  await applyAdminAction(db, admin, "benefit.save", { planId: plan.id, key: "max_photos", value: 3 });
  await applyAdminAction(db, admin, "benefit.save", { planId: plan.id, key: "promotions", value: false });
  if (!existingPlan) await expect(applyAdminAction(db, admin, "plan.save", { id: plan.id, code: "GRATUITO", name: "Gratuito", priceMinor: 0, currency: "MXN", status: "PUBLICADO" })).rejects.toMatchObject({ status: 409 });
  for (const key of ["profile_edit", "expanded_gallery", "events", "statistics", "featured_placement"]) await applyAdminAction(db, admin, "benefit.save", { planId: plan.id, key, value: false });
  await applyAdminAction(db, admin, "plan.save", { id: plan.id, code: "GRATUITO", name: "Gratuito", priceMinor: 0, currency: "MXN", status: "PUBLICADO" });
  const subscription = await applyAdminAction(db, admin, "subscription.save", { businessId: business.id, planId: plan.id, status: "ACTIVA", startsAt: null, endsAt: null }) as { id: string };
  expect(await hasBusinessBenefit(db, business.id, "max_photos")).toBe(true);
  expect(await hasBusinessBenefit(db, business.id, "promotions")).toBe(false);
  const correction = { name: "Negocio por verificar", description: "Corrección esencial en revisión administrativa", categoryId: category.id, cityId: city.id, services: [], amenityIds: [], mediaAssetIds: [] };
  await expect(saveBusinessDraft(db, owner, business.id, { ...correction, services: ["Servicio nuevo"] })).rejects.toMatchObject({ status: 403 });
  await expect(saveBusinessDraft(db, owner, business.id, correction)).resolves.toMatchObject({ basedOnVersion: null });
  await expect(applyAdminAction(db, admin, "subscription.save", { businessId: business.id, planId: plan.id, status: "ACTIVA", startsAt: null, endsAt: null })).rejects.toMatchObject({ cause: { code: "23505" } });

  const persisted = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, subscription.id));
  expect(persisted).toHaveLength(1);
  const audit = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.entityType, "business"), eq(schema.auditLog.entityId, business.id)));
  expect(audit.some(row => row.action === "BUSINESS_CREATED")).toBe(true);
  const list = await readAdminSection(db, "businesses") as { businesses: { id: string }[] };
  expect(list.businesses.some(row => row.id === business.id)).toBe(true);
});
