import { z } from "zod";
import OwnerGate from "@/lib/server/owner-gate";
export const dynamic = "force-dynamic";
export default async function OwnerContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return <main className="p-8">Negocio no encontrado.</main>;
  return <OwnerGate businessId={id} contentMode />;
}
