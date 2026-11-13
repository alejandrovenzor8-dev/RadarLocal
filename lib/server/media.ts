import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { auditLog, businessPublications, businessRevisions, categories, cities, mediaAssets } from "@/db/schema";
import { businessSnapshotSchema } from "./business-snapshot";
import { AppError } from "./errors";
import { getBusinessBenefitValue, hasBusinessBenefit, requireBusinessOwner, type Principal } from "./permissions";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const supported = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type ImageKind = "photo" | "cover" | "logo";

export function validateImage(bytes: Uint8Array, claimedType: string, size: number): keyof typeof supported {
  if (size < 1 || size > MAX_IMAGE_BYTES || bytes.byteLength !== size) throw new AppError("La imagen debe pesar entre 1 byte y 5 MB", 400);
  if (!(claimedType in supported)) throw new AppError("Usa una imagen JPG, PNG o WebP", 400);
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(claimedType === "image/jpeg" && jpeg || claimedType === "image/png" && png || claimedType === "image/webp" && webp)) throw new AppError("El contenido no coincide con el tipo de imagen", 400);
  return claimedType as keyof typeof supported;
}

export async function uploadBusinessImage(db: Database, principal: Principal, businessId: string, file: File, kind: ImageKind, bucket?: R2Bucket) {
  if (!bucket) throw new AppError("La carga de imágenes aún no está configurada", 503);
  await requireBusinessOwner(db, principal, businessId);
  if (!principal.roles.includes("SUPER_ADMIN") && !await hasBusinessBenefit(db, businessId, "profile_edit")) throw new AppError("Tu plan no incluye la edición de fotografías", 403);
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) throw new AppError("La imagen debe pesar menos de 5 MB", 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = validateImage(bytes, file.type, file.size);
  const maxPhotos = principal.roles.includes("SUPER_ADMIN") ? 50 : await getBusinessBenefitValue(db, businessId, "max_photos");
  if (typeof maxPhotos !== "number" || maxPhotos < 1) throw new AppError("Tu plan no incluye fotografías", 403);
  const storageKey = `private/businesses/${businessId}/${crypto.randomUUID()}.${supported[mimeType]}`;
  let uploaded = false;
  try {
    return await db.transaction(async tx => {
      const locked = await tx.execute(sql`SELECT id FROM businesses WHERE id = ${businessId} FOR UPDATE`);
      if (!locked.rows.length) throw new AppError("Negocio no encontrado", 404);
      const pending = await tx.select({ id: mediaAssets.id }).from(mediaAssets).where(and(eq(mediaAssets.businessId, businessId), eq(mediaAssets.rights, "PENDIENTE"), isNotNull(mediaAssets.storageKey)));
      if (pending.length >= Math.min(maxPhotos, 50)) throw new AppError("Tienes demasiadas imágenes pendientes; espera su revisión", 403);
      const stored = await bucket.put(storageKey, bytes, { httpMetadata: { contentType: mimeType, cacheControl: "private, no-store" }, customMetadata: { businessId, kind } });
      if (!stored) throw new AppError("No se pudo almacenar la imagen", 503);
      uploaded = true;
      const [asset] = await tx.insert(mediaAssets).values({ businessId, storageKey, mimeType, byteSize: file.size, uploadedBy: principal.userId, kind, rights: "PENDIENTE" }).returning({ id: mediaAssets.id, kind: mediaAssets.kind, rights: mediaAssets.rights });
      await tx.insert(auditLog).values({ actorId: principal.userId, action: "MEDIA_UPLOADED_PRIVATE", entityType: "media", entityId: asset.id, details: { businessId, kind, byteSize: file.size } });
      return asset;
    });
  } catch (error) {
    if (uploaded) await bucket.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function isPublicMedia(db: Database, assetId: string, businessId: string) {
  const [published] = await db.select({ snapshot: businessRevisions.snapshot }).from(businessPublications)
    .innerJoin(businessRevisions, eq(businessPublications.revisionId, businessRevisions.id))
    .where(eq(businessPublications.businessId, businessId)).limit(1);
  if (!published) return false;
  const parsed = businessSnapshotSchema.safeParse(published.snapshot);
  if (!parsed.success || !parsed.data.mediaAssetIds.includes(assetId)) return false;
  const [category] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, parsed.data.categoryId), eq(categories.status, "PUBLICADO"))).limit(1);
  const [city] = await db.select({ id: cities.id }).from(cities).where(eq(cities.id, parsed.data.cityId)).limit(1);
  return !!category && !!city;
}

export async function discardPendingImage(db: Database, principal: Principal, businessId: string, assetId: string) {
  await requireBusinessOwner(db, principal, businessId);
  return db.transaction(async tx => {
    const [asset] = await tx.select({ rights: mediaAssets.rights, uploadedBy: mediaAssets.uploadedBy }).from(mediaAssets).where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.businessId, businessId))).limit(1);
    if (!asset) throw new AppError("Imagen no encontrada", 404);
    if (asset.rights !== "PENDIENTE" || asset.uploadedBy !== principal.userId) throw new AppError("Esta imagen se retira mediante una revisión de la ficha", 409);
    if (await isPublicMedia(tx as unknown as Database, assetId, businessId)) throw new AppError("La imagen todavía está en la ficha pública", 409);
    await tx.update(mediaAssets).set({ rights: "RECHAZADO" }).where(eq(mediaAssets.id, assetId));
    await tx.insert(auditLog).values({ actorId: principal.userId, action: "MEDIA_DISCARDED_PRIVATE", entityType: "media", entityId: assetId, details: { businessId } });
    return { ok: true };
  });
}
