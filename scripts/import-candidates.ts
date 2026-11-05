import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { businesses as demoBusinesses, categories as demoCategories } from "../lib/radar-data";
import { auditLog, businessLocations, businesses, categories, cities, mediaAssets, states } from "../db/schema";

const candidates = demoBusinesses.filter(b => !b.fictional && b.sourceUrl && b.imageSource);
if (candidates.length !== 8) throw new Error(`Se esperaban 8 candidatos documentados; se encontraron ${candidates.length}`);
if (!process.argv.includes("--apply")) {
  console.log(JSON.stringify({ mode: "dry-run", count: candidates.length, slugs: candidates.map(b => b.slug), published: 0 }, null, 2));
  process.exit(0);
}
if (!process.argv.includes("--confirm-private-import")) throw new Error("Falta --confirm-private-import");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL no está configurada");
const client = new Client({ connectionString: url });
await client.connect();
try {
  const db = drizzle(client);
  const importedCandidates = await db.transaction(async tx => {
    let imported = 0;
    const [state] = await tx.insert(states).values({ code: "CHH", name: "Chihuahua" }).onConflictDoUpdate({ target: states.code, set: { name: "Chihuahua" } }).returning({ id: states.id });
    const [city] = await tx.insert(cities).values({ stateId: state.id, name: "Chihuahua", slug: "chihuahua" }).onConflictDoNothing().returning({ id: cities.id });
    const cityId = city?.id ?? (await tx.select({ id: cities.id }).from(cities).where(and(eq(cities.stateId, state.id), eq(cities.slug, "chihuahua"))).limit(1))[0].id;
    const categoryIds = new Map<string, string>();
    for (const c of demoCategories.filter(c => ["food", "realestate", "events", "wine"].includes(c.id))) {
      const [inserted] = await tx.insert(categories).values({ slug: c.slug, name: c.name }).onConflictDoNothing().returning({ id: categories.id });
      categoryIds.set(c.id, inserted?.id ?? (await tx.select({ id: categories.id }).from(categories).where(eq(categories.slug, c.slug)).limit(1))[0].id);
    }
    for (const candidate of candidates) {
      const [inserted] = await tx.insert(businesses).values({ slug: candidate.slug, name: candidate.name, categoryId: categoryIds.get(candidate.categoryId), cityId, sourceUrl: candidate.sourceUrl, sourceNotes: "Candidato de la demo; verificar participación, ficha, marca y fotografía antes de publicar" }).onConflictDoNothing().returning({ id: businesses.id });
      if (!inserted) continue;
      imported++;
      await tx.insert(businessLocations).values({ businessId: inserted.id, zone: candidate.zone, verified: false });
      await tx.insert(mediaAssets).values({ businessId: inserted.id, sourceUrl: candidate.imageSource, kind: "candidate_cover", rights: "PENDIENTE" });
      await tx.insert(auditLog).values({ action: "PRIVATE_CANDIDATE_IMPORTED", entityType: "business", entityId: inserted.id, details: { sourceUrl: candidate.sourceUrl } });
    }
    return imported;
  });
  console.log(JSON.stringify({ importedCandidates, publicRecordsCreated: 0 }));
} finally {
  await client.end();
}
