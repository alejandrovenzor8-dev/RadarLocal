import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { auditLog, businessDrafts, businessMemberships, businessPublications, businessRevisions, businesses, categories, changeRequests, mediaAssets, notificationOutbox, reviewDecisions, userRoles } from "@/db/schema";
import { businessSnapshotSchema } from "./business-snapshot";
import { AppError } from "./errors";
import { requireBusinessOwner, requireReviewer, type Principal } from "./permissions";

export async function saveBusinessDraft(db: Database, principal: Principal, businessId: string, input: unknown) {
  await requireBusinessOwner(db, principal, businessId);
  const snapshot = businessSnapshotSchema.parse(input);
  const [business] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) throw new AppError("Negocio no encontrado", 404);
  const [published] = await db.select({ version: businessPublications.version }).from(businessPublications).where(eq(businessPublications.businessId, businessId)).limit(1);
  await db.insert(businessDrafts).values({ businessId, authorId: principal.userId, basedOnVersion: published?.version ?? null, snapshot })
    .onConflictDoUpdate({ target: [businessDrafts.businessId, businessDrafts.authorId], set: { basedOnVersion: published?.version ?? null, snapshot, updatedAt: new Date() } });
  return { basedOnVersion: published?.version ?? null };
}

export async function submitBusinessDraft(db: Database, principal: Principal, businessId: string) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM businesses WHERE id = ${businessId} FOR UPDATE`);
    if (!principal.roles.includes("SUPER_ADMIN")) {
      if (!principal.roles.includes("BUSINESS_OWNER")) throw new AppError("No tienes acceso a este negocio", 403);
      const [link] = await tx.select({ userId: businessMemberships.userId }).from(businessMemberships).where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.userId, principal.userId), eq(businessMemberships.status, "ACTIVO"))).limit(1);
      if (!link) throw new AppError("No tienes acceso a este negocio", 403);
    }
    const [draft] = await tx.select().from(businessDrafts).where(and(eq(businessDrafts.businessId, businessId), eq(businessDrafts.authorId, principal.userId))).limit(1);
    if (!draft) throw new AppError("No hay borrador", 404);
    const [published] = await tx.select({ version: businessPublications.version }).from(businessPublications).where(eq(businessPublications.businessId, businessId)).limit(1);
    if ((published?.version ?? null) !== draft.basedOnVersion) throw new AppError("La ficha cambió; actualiza el borrador", 409);
    const [latest] = await tx.select({ version: sql<number>`coalesce(max(${businessRevisions.version}), 0)` }).from(businessRevisions).where(eq(businessRevisions.businessId, businessId));
    const [revision] = await tx.insert(businessRevisions).values({ businessId, version: Number(latest.version) + 1, basedOnVersion: draft.basedOnVersion, snapshot: draft.snapshot, createdBy: principal.userId }).returning({ id: businessRevisions.id, version: businessRevisions.version });
    const [request] = await tx.insert(changeRequests).values({ businessId, revisionId: revision.id, submittedBy: principal.userId }).returning({ id: changeRequests.id });
    await tx.delete(businessDrafts).where(and(eq(businessDrafts.businessId, businessId), eq(businessDrafts.authorId, principal.userId)));
    await tx.insert(auditLog).values({ actorId: principal.userId, action: "BUSINESS_REVISION_SUBMITTED", entityType: "business", entityId: businessId, details: { requestId: request.id, version: revision.version } });
    return { requestId: request.id, version: revision.version };
  });
}

export type ReviewDecision = "APROBADA" | "RECHAZADA" | "CORRECCIONES_SOLICITADAS";

export async function decideBusinessChange(db: Database, principal: Principal, requestId: string, decision: ReviewDecision, reason?: string) {
  requireReviewer(principal);
  if (decision !== "APROBADA" && !reason?.trim()) throw new AppError("Explica el motivo de la decisión", 400);
  return db.transaction(async tx => {
    const locked = await tx.execute(sql`SELECT id FROM change_requests WHERE id = ${requestId} FOR UPDATE`);
    if (!locked.rows.length) throw new AppError("Solicitud no encontrada", 404);
    const [request] = await tx.select().from(changeRequests).where(eq(changeRequests.id, requestId)).limit(1);
    if (request.status !== "PENDIENTE") throw new AppError("La solicitud ya fue resuelta", 409);
    if (request.submittedBy === principal.userId) throw new AppError("No puedes revisar tu propia solicitud", 403);
    await tx.execute(sql`SELECT id FROM businesses WHERE id = ${request.businessId} FOR UPDATE`);
    const [revision] = await tx.select().from(businessRevisions).where(eq(businessRevisions.id, request.revisionId)).limit(1);
    if (!revision || revision.businessId !== request.businessId) throw new AppError("Revisión inválida", 409);
    const [published] = await tx.select({ version: businessPublications.version }).from(businessPublications).where(eq(businessPublications.businessId, request.businessId)).limit(1);
    if (decision === "APROBADA") {
      if ((published?.version ?? null) !== revision.basedOnVersion) throw new AppError("Existe una versión pública más reciente", 409);
      const [business] = await tx.select({ verification: businesses.verification }).from(businesses).where(eq(businesses.id, request.businessId)).limit(1);
      if (business.verification !== "VERIFICADO") throw new AppError("El negocio aún no está verificado", 409);
      const snapshot = businessSnapshotSchema.parse(revision.snapshot);
      const [category] = await tx.select({ status: categories.status }).from(categories).where(eq(categories.id, snapshot.categoryId)).limit(1);
      if (category?.status !== "PUBLICADO") throw new AppError("La categoría no está publicada", 409);
      const assets = snapshot.mediaAssetIds.length ? await tx.select({ id: mediaAssets.id, rights: mediaAssets.rights, businessId: mediaAssets.businessId }).from(mediaAssets).where(eq(mediaAssets.businessId, request.businessId)) : [];
      if (snapshot.mediaAssetIds.some(id => !assets.some(asset => asset.id === id && asset.rights === "AUTORIZADO"))) throw new AppError("Hay imágenes sin autorización", 409);
      await tx.insert(businessPublications).values({ businessId: request.businessId, revisionId: revision.id, version: revision.version, publishedBy: principal.userId })
        .onConflictDoUpdate({ target: businessPublications.businessId, set: { revisionId: revision.id, version: revision.version, publishedBy: principal.userId, publishedAt: new Date() } });
      await tx.update(businesses).set({ status: "PUBLICADO", updatedAt: new Date() }).where(eq(businesses.id, request.businessId));
    }
    await tx.update(changeRequests).set({ status: decision, resolvedAt: new Date() }).where(eq(changeRequests.id, requestId));
    await tx.insert(reviewDecisions).values({ requestId, reviewerId: principal.userId, decision, reason: reason?.trim() || null });
    await tx.insert(auditLog).values({ actorId: principal.userId, action: `BUSINESS_REVISION_${decision}`, entityType: "business", entityId: request.businessId, details: { requestId, version: revision.version } });
    await tx.insert(notificationOutbox).values({ userId: request.submittedBy, kind: "BUSINESS_REVIEW_DECISION", payload: { requestId, decision, reason: reason?.trim() || null } });
    return { requestId, decision, publishedVersion: decision === "APROBADA" ? revision.version : published?.version ?? null };
  });
}

export async function grantRole(db: Database, principal: Principal, targetUserId: string, role: "ADMIN" | "BUSINESS_OWNER" | "SUPER_ADMIN") {
  if (!principal.roles.includes("SUPER_ADMIN")) throw new AppError("Se requiere SUPER_ADMIN", 403);
  await db.transaction(async tx => {
    await tx.insert(userRoles).values({ userId: targetUserId, role, grantedBy: principal.userId }).onConflictDoNothing();
    await tx.insert(auditLog).values({ actorId: principal.userId, action: "ROLE_GRANTED", entityType: "user", entityId: targetUserId, details: { role } });
  });
}
