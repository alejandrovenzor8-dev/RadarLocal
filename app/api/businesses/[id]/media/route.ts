import { env } from "cloudflare:workers";
import { z } from "zod";
import { withPrincipal } from "@/lib/server/route-context";
import { uploadBusinessImage } from "@/lib/server/media";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "ID inválido" }, { status: 400 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 6 * 1024 * 1024) return Response.json({ error: "La imagen supera el tamaño permitido" }, { status: 413 });
  return withPrincipal(request, async (db, principal) => {
    const form = await request.formData();
    const file = form.get("file");
    const kind = z.enum(["photo", "cover", "logo"]).parse(form.get("kind") ?? "photo");
    if (!(file instanceof File)) return Response.json({ error: "Selecciona una imagen" }, { status: 400 });
    const result = await uploadBusinessImage(db, principal, id, file, kind, env.BUCKET);
    return Response.json(result, { status: 201, headers: { "cache-control": "no-store" } });
  });
}
