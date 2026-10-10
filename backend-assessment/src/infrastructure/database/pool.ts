import { Pool } from "pg";
import type { shardId } from "./shard-router";
import { env } from "../../config/env";

const pools: Partial<Record<shardId, Pool>> = {};

function createPool(connectionString: string | undefined): Pool {
  if (!connectionString) {
    throw new Error("Missing PostgreSQL connection string");
  }

  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

export function getPool(shardId: shardId): Pool {
  if (!pools[shardId]) {
    const connectionString =
      shardId === 1
        ? env.PG_SHARD_1_DB_URL
        : env.PG_SHARD_2_DB_URL;

    pools[shardId] = createPool(connectionString);
  }

  return pools[shardId]!;
}

export async function closePools(): Promise<void> {
  await Promise.all(
    Object.values(pools).map((pool) => pool!.end()),
  );

  for (const shardId of [1, 2] as const) {
    delete pools[shardId];
  }
}
