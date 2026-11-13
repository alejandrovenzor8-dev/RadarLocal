import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"));
const hyperdrive = config.hyperdrive?.find(binding => binding.binding === "HYPERDRIVE_FRESH");
const bucket = config.r2_buckets?.find(binding => binding.binding === "BUCKET");

if (config.name !== "radarlocal-staging" || config.vars?.RADAR_ENVIRONMENT !== "staging") {
  throw new Error("El build no está identificado como staging");
}
if (!hyperdrive?.id || !bucket?.bucket_name) throw new Error("Faltan vínculos de staging");
if (hyperdrive.id !== process.env.RADAR_STAGING_HYPERDRIVE_ID || bucket.bucket_name !== process.env.RADAR_STAGING_R2_BUCKET_NAME) {
  throw new Error("Los vínculos generados no coinciden con los recursos de staging");
}
if (process.env.RADAR_HYPERDRIVE_ID && hyperdrive.id === process.env.RADAR_HYPERDRIVE_ID) throw new Error("Hyperdrive coincide con el de otro entorno");
if (process.env.RADAR_R2_BUCKET_NAME && bucket.bucket_name === process.env.RADAR_R2_BUCKET_NAME) throw new Error("R2 coincide con el de otro entorno");
if (config.vars?.DATABASE_URL || config.vars?.BETTER_AUTH_SECRET || config.vars?.RESEND_API_KEY) {
  throw new Error("El build contiene secretos en variables públicas");
}
console.log("Build de staging verificado: nombre, aislamiento y vínculos presentes.");
