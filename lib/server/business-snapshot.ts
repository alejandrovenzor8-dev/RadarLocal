import { z } from "zod";

export const businessSnapshotSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(10).max(5000),
  categoryId: z.string().uuid(),
  cityId: z.string().uuid(),
  address: z.string().trim().max(500).nullable().default(null),
  phone: z.string().trim().max(40).nullable().default(null),
  website: z.string().url().max(500).nullable().default(null),
  services: z.array(z.string().trim().min(1).max(160)).max(100).default([]),
  amenityIds: z.array(z.string().uuid()).max(100).default([]),
  mediaAssetIds: z.array(z.string().uuid()).max(50).default([]),
});

export type BusinessSnapshot = z.infer<typeof businessSnapshotSchema>;
