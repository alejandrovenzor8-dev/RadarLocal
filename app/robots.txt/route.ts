import { env } from "cloudflare:workers";

export function GET(): Response {
  const staging = env.RADAR_ENVIRONMENT === "staging";
  return new Response(staging ? "User-agent: *\nDisallow: /\n" : "User-agent: *\nAllow: /\n", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      ...(staging ? { "x-robots-tag": "noindex, nofollow" } : {}),
    },
  });
}
