import { env } from "cloudflare:workers";

export async function sendAuthEmail(to: string, subject: string, url: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error("El correo transaccional no está configurado");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text: `Abre este enlace para continuar en RadarLocal: ${url}` }),
  });
  if (!response.ok) throw new Error(`El servicio de correo respondió ${response.status}`);
}
