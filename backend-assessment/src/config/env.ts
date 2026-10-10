import "dotenv/config";
import { z } from "zod";

const defaultShard1 = "postgresql://app:password@localhost:5437/shard1";
const defaultShard2 = "postgresql://app:password@localhost:5438/shard2";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3010),
  PG_SHARD_1_DB_URL: z
    .string()
    .optional()
    .transform((val) => val || process.env.SHARD_1_DB_URL || defaultShard1),
  PG_SHARD_2_DB_URL: z
    .string()
    .optional()
    .transform((val) => val || process.env.SHARD_2_DB_URL || defaultShard2),
  UPLOAD_MAX_BYTES: z.coerce.number().default(10 * 1024 * 1024),
  BATCH_SIZE: z.coerce.number().default(500),
  GCS_BUCKET_NAME: z.string().optional().default(""),
  LOG_LEVEL: z.string().default("info"),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new Error(`Invalid environment configuration: ${errorDetails}`);
  }

  return result.data;
}

export const env = loadEnv();
