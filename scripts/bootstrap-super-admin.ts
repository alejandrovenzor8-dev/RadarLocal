import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { user } from "../db/auth-schema";
import { auditLog, userRoles } from "../db/schema";

const emailIndex = process.argv.indexOf("--email");
const email = emailIndex >= 0 ? process.argv[emailIndex + 1]?.trim().toLowerCase() : undefined;
if (!email || !process.argv.includes("--confirm-first-super-admin")) {
  throw new Error("Uso: --email correo_verificado --confirm-first-super-admin");
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL no está configurada");
const client = new Client({ connectionString: url });
await client.connect();
try {
  const db = drizzle(client);
  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(824706213)`);
    const [existing] = await tx.select({ userId: userRoles.userId }).from(userRoles).where(eq(userRoles.role, "SUPER_ADMIN")).limit(1);
    if (existing) throw new Error("Ya existe SUPER_ADMIN; use el flujo de asignación autorizado");
    const [target] = await tx.select({ id: user.id, verified: user.emailVerified }).from(user).where(eq(user.email, email)).limit(1);
    if (!target?.verified) throw new Error("La cuenta debe existir y tener el correo verificado");
    await tx.insert(userRoles).values({ userId: target.id, role: "SUPER_ADMIN" });
    await tx.insert(auditLog).values({ actorId: target.id, action: "FIRST_SUPER_ADMIN_BOOTSTRAPPED", entityType: "user", entityId: target.id, details: {} });
    return { userId: target.id };
  });
  console.log(JSON.stringify({ created: true, userId: result.userId }));
} finally {
  await client.end();
}
