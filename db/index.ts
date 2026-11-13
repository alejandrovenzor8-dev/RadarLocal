import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "./all-schema";

function createDb(client: Client) {
  return drizzle({ client, schema });
}

export type Database = ReturnType<typeof createDb>;

export async function withDb<T>(run: (db: Database) => Promise<T>): Promise<T> {
  if (env.RADAR_ENVIRONMENT === "staging" && !env.HYPERDRIVE_FRESH) {
    throw new Error("Staging requiere Hyperdrive");
  }
  const connectionString = env.HYPERDRIVE_FRESH?.connectionString ?? env.DATABASE_URL;
  if (!connectionString) throw new Error("PostgreSQL no está configurado");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await run(createDb(client));
  } finally {
    await client.end();
  }
}
