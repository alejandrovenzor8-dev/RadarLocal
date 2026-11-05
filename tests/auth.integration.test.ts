import { afterAll, beforeAll, expect, test } from "vitest";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/db/all-schema";
import { createAuth } from "@/lib/server/auth";

const url = process.env.TEST_DATABASE_URL;
const client = new Client({ connectionString: url });
const db = drizzle({ client, schema });
const sent: { to: string; url: string }[] = [];
const baseURL = "http://localhost:5173";
const auth = createAuth(db, { secret: "isolated-test-secret-with-at-least-32-characters", baseURL, sendEmail: async (to, _subject, link) => { sent.push({ to, url: link }); } });
const email = `phase1-${crypto.randomUUID()}@example.test`;
const password = "TestingPassword2026!";

beforeAll(async () => {
  if (!url || !url.includes("radarlocal_phase1_test")) throw new Error("TEST_DATABASE_URL debe apuntar a la base descartable radarlocal_phase1_test");
  await client.connect();
});
afterAll(async () => { await client.end(); });

async function post(path: string, body: Record<string, unknown>, cookie?: string, ip = "198.51.100.1") {
  return auth.handler(new Request(`${baseURL}/api/auth/${path}`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }));
}

test("registro CUSTOMER, verificación, sesión y recuperación", async () => {
  const signUp = await post("sign-up/email", { name: "Cuenta de prueba", email, password });
  expect(signUp.status).toBe(200);
  const [created] = await db.select({ id: schema.user.id, verified: schema.user.emailVerified }).from(schema.user).where(eq(schema.user.email, email));
  expect(created.verified).toBe(false);
  const roles = await db.select({ role: schema.userRoles.role }).from(schema.userRoles).where(eq(schema.userRoles.userId, created.id));
  expect(roles.map(x => x.role)).toEqual(["CUSTOMER"]);
  expect(sent.at(-1)?.to).toBe(email);
  const denied = await post("sign-in/email", { email, password });
  expect(denied.status).toBe(403);
  const verification = await auth.handler(new Request(sent.at(-1)!.url));
  expect([200, 302]).toContain(verification.status);
  const signIn = await post("sign-in/email", { email, password });
  expect(signIn.status).toBe(200);
  const cookie = signIn.headers.get("set-cookie")?.split(";")[0];
  expect(cookie).toContain("session_token");
  const session = await auth.api.getSession({ headers: new Headers({ cookie: cookie! }) });
  expect(session?.user.email).toBe(email);
  const reset = await post("request-password-reset", { email, redirectTo: `${baseURL}/login` });
  expect(reset.status).toBe(200);
  expect(sent.at(-1)?.to).toBe(email);
  const resetLink = await auth.handler(new Request(sent.at(-1)!.url));
  expect(resetLink.status).toBe(302);
  const token = new URL(resetLink.headers.get("location")!, baseURL).searchParams.get("token");
  expect(token).toBeTruthy();
  const newPassword = "ChangedPassword2026!";
  const changed = await post("reset-password", { token, newPassword });
  expect(changed.status).toBe(200);
  const revoked = await auth.api.getSession({ headers: new Headers({ cookie: cookie! }) });
  expect(revoked).toBeNull();
  expect((await post("sign-in/email", { email, password })).status).not.toBe(200);
  const signedInAgain = await post("sign-in/email", { email, password: newPassword }, undefined, "198.51.100.2");
  expect(signedInAgain.status).toBe(200);
  const newCookie = signedInAgain.headers.get("set-cookie")?.split(";")[0];
  expect((await post("sign-out", {}, newCookie)).status).toBe(200);
  expect(await auth.api.getSession({ headers: new Headers({ cookie: newCookie! }) })).toBeNull();
});
