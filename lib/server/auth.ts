import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "@/db";
import { userRoles } from "@/db/schema";

export type AuthSettings = {
  secret: string;
  baseURL: string;
  sendEmail: (to: string, subject: string, url: string) => Promise<void>;
};

export function createAuth(db: Database, settings: AuthSettings) {
  if (settings.secret.length < 32) throw new Error("BETTER_AUTH_SECRET debe tener al menos 32 caracteres");
  const origin = new URL(settings.baseURL).origin;
  return betterAuth({
    secret: settings.secret,
    baseURL: origin,
    trustedOrigins: [origin],
    database: drizzleAdapter(db, { provider: "pg", transaction: true }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      minPasswordLength: 12,
      sendResetPassword: async ({ user, url }) => {
        await settings.sendEmail(user.email, "Restablece tu contraseña de RadarLocal", url);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await settings.sendEmail(user.email, "Verifica tu correo de RadarLocal", url);
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 20,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    databaseHooks: {
      user: {
        create: {
          after: async created => {
            await db.insert(userRoles).values({ userId: created.id, role: "CUSTOMER" }).onConflictDoNothing();
          },
        },
      },
    },
  });
}
