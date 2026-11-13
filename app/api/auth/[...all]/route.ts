import { env } from "cloudflare:workers";
import { withDb } from "@/db";
import { createAuth } from "@/lib/server/auth";
import { sendAuthEmail } from "@/lib/server/email";
import { logServerError } from "@/lib/server/safe-log";

async function handle(request: Request): Promise<Response> {
  if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) {
    return Response.json({ error: "Autenticación sin configurar" }, { status: 503 });
  }
  const path = new URL(request.url).pathname;
  if (/\/(sign-up|request-password-reset|send-verification-email)(\/|$)/.test(path) && (!env.RESEND_API_KEY || !env.EMAIL_FROM)) {
    return Response.json({ error: "Registro y correo sin configurar" }, { status: 503 });
  }
  try {
    return await withDb(db => createAuth(db, {
      secret: env.BETTER_AUTH_SECRET!,
      baseURL: env.BETTER_AUTH_URL!,
      sendEmail: sendAuthEmail,
    }).handler(request));
  } catch (error) {
    logServerError("auth", error);
    return Response.json({ error: "Servicio temporalmente no disponible" }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
