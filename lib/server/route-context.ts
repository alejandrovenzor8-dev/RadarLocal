import { env } from "cloudflare:workers";
import { ZodError } from "zod";
import { withDb, type Database } from "@/db";
import { type Principal, requirePrincipal } from "./permissions";
import { sendAuthEmail } from "./email";
import { AppError } from "./errors";
import { logServerError } from "./safe-log";

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
    if (error instanceof SyntaxError) return Response.json({ error: "JSON inválido" }, { status: 400 });
    const databaseError = error && typeof error === "object" && "cause" in error && error.cause ? error.cause : error;
    if (databaseError && typeof databaseError === "object" && "code" in databaseError) {
      if (databaseError.code === "23505") return Response.json({ error: "Ya existe un registro con esos datos" }, { status: 409 });
      if (databaseError.code === "23503") return Response.json({ error: "La referencia seleccionada no existe" }, { status: 400 });
      if (databaseError.code === "23514") return Response.json({ error: "Los datos no cumplen las restricciones" }, { status: 400 });
    }
    logServerError("protected_operation", error);
    return Response.json({ error: "Servicio temporalmente no disponible" }, { status: 503 });
  }
}
