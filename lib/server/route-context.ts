import { env } from "cloudflare:workers";
import { ZodError } from "zod";
import { withDb, type Database } from "@/db";
import { type Principal, requirePrincipal } from "./permissions";
import { sendAuthEmail } from "./email";
import { AppError } from "./errors";

export async function withPrincipal(request: Request, run: (db: Database, principal: Principal) => Promise<Response>): Promise<Response> {
  if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) return Response.json({ error: "Autenticación sin configurar" }, { status: 503 });
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: "Origen no autorizado" }, { status: 403 });
  }
  try {
    return await withDb(async db => {
      const principal = await requirePrincipal(db, request.headers, {
        secret: env.BETTER_AUTH_SECRET!, baseURL: env.BETTER_AUTH_URL!, sendEmail: sendAuthEmail,
      });
      return run(db, principal);
    });
  } catch (error) {
    if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) return Response.json({ error: "Datos inválidos", issues: error.issues }, { status: 400 });
    console.error("Error en operación protegida", error);
    return Response.json({ error: "Servicio temporalmente no disponible" }, { status: 503 });
  }
}
