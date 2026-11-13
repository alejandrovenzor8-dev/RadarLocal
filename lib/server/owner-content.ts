import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db";
import { auditLog, events, promotions } from "@/db/schema";
import { AppError } from "./errors";
import { hasBusinessBenefit, requireBusinessOwner, type Principal } from "./permissions";

const contentInput = z.object({ kind: z.enum(["promotion", "event"]), id: z.uuid().optional(), title: z.string().trim().min(2).max(160), description: z.string().trim().min(10).max(5000), startsAt: z.iso.datetime().nullable(), endsAt: z.iso.datetime().nullable(), action: z.enum(["save", "submit"]) });

export async function saveOwnerContent(db: Database, principal: Principal, businessId: string, input: unknown) {
  await requireBusinessOwner(db, principal, businessId);
  const data = contentInput.parse(input);
  if (!await hasBusinessBenefit(db, businessId, data.kind === "promotion" ? "promotions" : "events")) throw new AppError("Tu plan no incluye esta función", 403);
  if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) throw new AppError("La fecha final debe ser posterior", 400);
  const table = data.kind === "promotion" ? promotions : events;
  return db.transaction(async tx => {
    if (data.id) {
      const [existing] = await tx.select({ status: table.status }).from(table).where(and(eq(table.id, data.id), eq(table.businessId, businessId))).limit(1);
      if (!existing) throw new AppError("Contenido no encontrado", 404);
      if (!["BORRADOR", "RECHAZADO"].includes(existing.status)) throw new AppError("Este contenido ya está en revisión o publicado", 409);
    }
    const values = { businessId, content: { title: data.title, description: data.description }, status: data.action === "submit" ? "EN_REVISION" as const : "BORRADOR" as const, startsAt: data.startsAt ? new Date(data.startsAt) : null, endsAt: data.endsAt ? new Date(data.endsAt) : null, approvedBy: null };
    const [row] = data.id ? await tx.update(table).set(values).where(and(eq(table.id, data.id), eq(table.businessId, businessId))).returning() : await tx.insert(table).values(values).returning();
    await tx.insert(auditLog).values({ actorId: principal.userId, action: data.action === "submit" ? "OWNER_CONTENT_SUBMITTED" : "OWNER_CONTENT_DRAFT_SAVED", entityType: data.kind, entityId: row.id, details: { businessId } });
    return row;
  });
}
