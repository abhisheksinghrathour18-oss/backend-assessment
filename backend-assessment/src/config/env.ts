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
  STORAGE_PROVIDER: z.enum(["stub", "gcs"]).default("stub"),
  STORAGE_STUB_DIR: z.string().default("./storage"),
  GCS_BUCKET_NAME: z.string().optional().default(""),
  GCP_PROJECT_ID: z.string().optional().default(""),
  LOG_LEVEL: z.string().default("info"),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6380),
  REDIS_PASSWORD: z.string().optional().default(""),
  QUEUE_NAME: z.string().default("orders-ingestion"),
  ENABLE_IN_PROCESS_WORKER: z.coerce.boolean().default(true),
  DB_MAX_RETRIES: z.coerce.number().default(3),
  DB_RETRY_BASE_MS: z.coerce.number().default(100),
  DB_RETRY_MAX_MS: z.coerce.number().default(2000),
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
