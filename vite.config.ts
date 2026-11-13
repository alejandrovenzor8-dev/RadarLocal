import vinext from "vinext";
import { defineConfig } from "vite";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";
const isStaging = process.env.RADAR_DEPLOY_ENV === "staging";
if (process.env.RADAR_DEPLOY_ENV && !isStaging) throw new Error("RADAR_DEPLOY_ENV no reconocido");
if (isStaging && (!process.env.RADAR_STAGING_HYPERDRIVE_ID || !process.env.RADAR_STAGING_R2_BUCKET_NAME)) {
  throw new Error("Staging requiere RADAR_STAGING_HYPERDRIVE_ID y RADAR_STAGING_R2_BUCKET_NAME propios");
}
const hyperdriveId = isStaging ? process.env.RADAR_STAGING_HYPERDRIVE_ID : process.env.RADAR_HYPERDRIVE_ID;
const bucketName = isStaging ? process.env.RADAR_STAGING_R2_BUCKET_NAME : process.env.RADAR_R2_BUCKET_NAME;

const localBindingConfig = {
  ...(isStaging ? { name: "radarlocal-staging", vars: { RADAR_ENVIRONMENT: "staging" } } : {}),
  main: "vinext/server/fetch-handler",
  compatibility_date: "2026-05-22",
  compatibility_flags: ["nodejs_compat"],
  hyperdrive: hyperdriveId
    ? [{ binding: "HYPERDRIVE_FRESH", id: hyperdriveId }]
    : [],
  r2_buckets: bucketName
    ? [{ binding: "BUCKET", bucket_name: bucketName }]
    : [],
};

export default defineConfig(async () => {
  // Use Miniflare's local Request.cf placeholder unless fetching is requested.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      ...(managedLinux ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] } : {}),
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
