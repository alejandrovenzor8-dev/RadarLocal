import { sql } from "drizzle-orm";
import { boolean, check, doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, time, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const role = pgEnum("radar_role", ["SUPER_ADMIN", "ADMIN", "BUSINESS_OWNER", "CUSTOMER"]);
export const configurationStatus = pgEnum("configuration_status", ["PENDIENTE_CONFIGURACION", "PUBLICADO", "ARCHIVADO"]);
export const editorialStatus = pgEnum("editorial_status", ["BORRADOR", "EN_REVISION", "PUBLICADO", "RECHAZADO", "ARCHIVADO"]);
export const verificationStatus = pgEnum("verification_status", ["PENDIENTE_VERIFICACION", "VERIFICADO", "RECHAZADO"]);
export const membershipStatus = pgEnum("membership_status", ["PENDIENTE", "ACTIVO", "REVOCADO"]);
export const requestStatus = pgEnum("request_status", ["PENDIENTE", "APROBADA", "RECHAZADA", "CORRECCIONES_SOLICITADAS"]);
export const subscriptionStatus = pgEnum("subscription_status", ["PENDIENTE", "ACTIVA", "SUSPENDIDA", "CANCELADA", "VENCIDA"]);
export const rightsStatus = pgEnum("rights_status", ["PENDIENTE", "AUTORIZADO", "RECHAZADO"]);

export const userRoles = pgTable("user_roles", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: role("role").notNull(),
  grantedBy: text("granted_by").references(() => user.id),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.userId, table.role] }), index("user_roles_role_idx").on(table.role)]);

export const states = pgTable("states", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
});
export const cities = pgTable("cities", {
  id: uuid("id").primaryKey().defaultRandom(),
  stateId: uuid("state_id").notNull().references(() => states.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
}, table => [uniqueIndex("cities_state_slug_uq").on(table.stateId, table.slug)]);
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: configurationStatus("status").notNull().default("PENDIENTE_CONFIGURACION"),
});

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  categoryId: uuid("category_id").references(() => categories.id),
  cityId: uuid("city_id").references(() => cities.id),
  status: configurationStatus("status").notNull().default("PENDIENTE_CONFIGURACION"),
  verification: verificationStatus("verification").notNull().default("PENDIENTE_VERIFICACION"),
  sourceUrl: text("source_url"),
  sourceNotes: text("source_notes"),
  sourceCheckedAt: timestamp("source_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("businesses_city_category_idx").on(table.cityId, table.categoryId), index("businesses_status_idx").on(table.status)]);

export const businessMemberships = pgTable("business_memberships", {
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  status: membershipStatus("status").notNull().default("PENDIENTE"),
  linkedBy: text("linked_by").references(() => user.id),
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.businessId, table.userId] }), index("business_memberships_user_idx").on(table.userId, table.status)]);

export const businessLocations = pgTable("business_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  address: text("address"),
  zone: text("zone"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  googlePlaceId: text("google_place_id"),
  verified: boolean("verified").notNull().default(false),
}, table => [index("business_locations_business_idx").on(table.businessId), check("business_location_lat_chk", sql`${table.latitude} IS NULL OR ${table.latitude} BETWEEN -90 AND 90`), check("business_location_lng_chk", sql`${table.longitude} IS NULL OR ${table.longitude} BETWEEN -180 AND 180`)]);
export const businessHours = pgTable("business_hours", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(),
  opensAt: time("opens_at"),
  closesAt: time("closes_at"),
  closed: boolean("closed").notNull().default(false),
}, table => [index("business_hours_business_idx").on(table.businessId), check("business_hours_weekday_chk", sql`${table.weekday} BETWEEN 0 AND 6`) ]);
export const amenities = pgTable("amenities", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: configurationStatus("status").notNull().default("PENDIENTE_CONFIGURACION"),
});
export const businessAmenities = pgTable("business_amenities", {
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  amenityId: uuid("amenity_id").notNull().references(() => amenities.id),
}, table => [primaryKey({ columns: [table.businessId, table.amenityId] })]);
export const businessServices = pgTable("business_services", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
}, table => [index("business_services_business_idx").on(table.businessId)]);
export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  storageKey: text("storage_key"),
  sourceUrl: text("source_url"),
  altText: text("alt_text"),
  kind: text("kind").notNull(),
  rights: rightsStatus("rights").notNull().default("PENDIENTE"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("media_assets_business_idx").on(table.businessId)]);

export const businessRevisions = pgTable("business_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  basedOnVersion: integer("based_on_version"),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("business_revision_version_uq").on(table.businessId, table.version), index("business_revision_created_idx").on(table.createdAt), check("business_revision_version_chk", sql`${table.version} > 0`)]);
export const businessDrafts = pgTable("business_drafts", {
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id),
  basedOnVersion: integer("based_on_version"),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.businessId, table.authorId] })]);
export const businessPublications = pgTable("business_publications", {
  businessId: uuid("business_id").primaryKey().references(() => businesses.id, { onDelete: "cascade" }),
  revisionId: uuid("revision_id").notNull().references(() => businessRevisions.id),
  version: integer("version").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  publishedBy: text("published_by").notNull().references(() => user.id),
});
export const changeRequests = pgTable("change_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  revisionId: uuid("revision_id").notNull().references(() => businessRevisions.id),
  status: requestStatus("status").notNull().default("PENDIENTE"),
  submittedBy: text("submitted_by").notNull().references(() => user.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, table => [index("change_requests_queue_idx").on(table.status, table.submittedAt), uniqueIndex("change_requests_revision_uq").on(table.revisionId)]);
export const reviewDecisions = pgTable("review_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull().references(() => changeRequests.id, { onDelete: "cascade" }),
  reviewerId: text("reviewer_id").notNull().references(() => user.id),
  decision: text("decision").notNull(),
  reason: text("reason"),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("review_decisions_request_idx").on(table.requestId), check("review_decision_chk", sql`${table.decision} IN ('APROBADA','RECHAZADA','CORRECCIONES_SOLICITADAS')`)]);
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: text("actor_id").references(() => user.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("audit_entity_idx").on(table.entityType, table.entityId), index("audit_actor_idx").on(table.actorId)]);
export const notificationOutbox = pgTable("notification_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id),
  kind: text("kind").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, table => [index("notification_pending_idx").on(table.sentAt, table.createdAt)]);

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name"),
  priceMinor: integer("price_minor"),
  currency: text("currency"),
  status: configurationStatus("status").notNull().default("PENDIENTE_CONFIGURACION"),
}, table => [check("plans_price_chk", sql`${table.priceMinor} IS NULL OR ${table.priceMinor} >= 0`)]);
export const planBenefits = pgTable("plan_benefits", {
  planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: jsonb("value").$type<boolean | number | string>().notNull(),
}, table => [primaryKey({ columns: [table.planId, table.key] })]);
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  planId: uuid("plan_id").notNull().references(() => plans.id),
  status: subscriptionStatus("status").notNull().default("PENDIENTE"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("subscriptions_business_idx").on(table.businessId, table.status), check("subscriptions_dates_chk", sql`${table.endsAt} IS NULL OR ${table.startsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`)]);

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>(),
  status: configurationStatus("status").notNull().default("PENDIENTE_CONFIGURACION"),
  updatedBy: text("updated_by").references(() => user.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const contactChannels = pgTable("contact_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  value: text("value"),
  status: configurationStatus("status").notNull().default("PENDIENTE_CONFIGURACION"),
  updatedBy: text("updated_by").references(() => user.id),
});
export const legalDocuments = pgTable("legal_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  version: integer("version").notNull(),
  body: text("body"),
  status: configurationStatus("status").notNull().default("PENDIENTE_CONFIGURACION"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, table => [uniqueIndex("legal_kind_version_uq").on(table.kind, table.version)]);
export const advertisingRates = pgTable("advertising_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  priceMinor: integer("price_minor"),
  currency: text("currency"),
  status: configurationStatus("status").notNull().default("PENDIENTE_CONFIGURACION"),
}, table => [check("ad_rate_price_chk", sql`${table.priceMinor} IS NULL OR ${table.priceMinor} >= 0`)]);

export const promotions = pgTable("promotions", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  status: editorialStatus("status").notNull().default("BORRADOR"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  approvedBy: text("approved_by").references(() => user.id),
}, table => [index("promotions_business_status_idx").on(table.businessId, table.status)]);
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").references(() => businesses.id),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  status: editorialStatus("status").notNull().default("BORRADOR"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  approvedBy: text("approved_by").references(() => user.id),
}, table => [index("events_status_start_idx").on(table.status, table.startsAt)]);
export const advertisements = pgTable("advertisements", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").references(() => businesses.id),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  status: editorialStatus("status").notNull().default("BORRADOR"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  approvedBy: text("approved_by").references(() => user.id),
}, table => [index("ads_status_idx").on(table.status)]);
