declare namespace Cloudflare {
  interface Env {
    RADAR_ENVIRONMENT?: "staging";
    HYPERDRIVE_FRESH?: Hyperdrive;
    DATABASE_URL?: string;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    BUCKET?: R2Bucket;
  }
}
