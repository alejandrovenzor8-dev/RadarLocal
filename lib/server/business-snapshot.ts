import { z } from "zod";

const optionalUrl = z.url().max(500).nullable().default(null);
const businessHourSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  closed: z.boolean(),
  opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
}).refine(value => value.closed || (!!value.opensAt && !!value.closesAt && value.opensAt < value.closesAt), "Revisa el horario de apertura y cierre");

export const businessSnapshotSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(10).max(5000),
  categoryId: z.string().uuid(),
  cityId: z.string().uuid(),
  address: z.string().trim().max(500).nullable().default(null),
  phone: z.string().trim().max(40).nullable().default(null),
  whatsapp: z.string().trim().max(40).nullable().default(null),
  email: z.email().max(250).nullable().default(null),
  website: optionalUrl,
  instagram: optionalUrl,
  facebook: optionalUrl,
  tiktok: optionalUrl,
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  hours: z.array(businessHourSchema).max(7).refine(values => new Set(values.map(value => value.weekday)).size === values.length, "No repitas días en el horario").default([]),
  services: z.array(z.string().trim().min(1).max(160)).max(100).default([]),
  amenityIds: z.array(z.string().uuid()).max(100).default([]),
  mediaAssetIds: z.array(z.string().uuid()).max(50).default([]),
  coverAssetId: z.string().uuid().nullable().default(null),
  logoAssetId: z.string().uuid().nullable().default(null),
}).refine(value => !value.coverAssetId || value.mediaAssetIds.includes(value.coverAssetId), "La portada debe estar en la galería").refine(value => !value.logoAssetId || value.mediaAssetIds.includes(value.logoAssetId), "El logotipo debe estar en la galería");

export const businessDraftPatchSchema = z.object({
  name: z.string().trim().max(160).optional(),
  description: z.string().trim().max(5000).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  cityId: z.string().uuid().nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  whatsapp: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().max(250).nullable().optional(),
  website: z.string().trim().max(500).nullable().optional(),
  instagram: z.string().trim().max(500).nullable().optional(),
  facebook: z.string().trim().max(500).nullable().optional(),
  tiktok: z.string().trim().max(500).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  hours: z.array(z.object({ weekday: z.number().int().min(0).max(6), closed: z.boolean(), opensAt: z.string().nullable(), closesAt: z.string().nullable() })).max(7).optional(),
  services: z.array(z.string().trim().min(1).max(160)).max(100).optional(),
  amenityIds: z.array(z.string().uuid()).max(100).optional(),
  mediaAssetIds: z.array(z.string().uuid()).max(50).optional(),
  coverAssetId: z.string().uuid().nullable().optional(),
  logoAssetId: z.string().uuid().nullable().optional(),
});

export type BusinessSnapshot = z.infer<typeof businessSnapshotSchema>;
export type BusinessDraftPatch = z.infer<typeof businessDraftPatchSchema>;
