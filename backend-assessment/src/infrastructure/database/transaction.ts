import type { Pool, PoolClient } from "pg";
import { withRetry, type RetryOptions } from "./retry";

export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
  retryOptions?: RetryOptions,
): Promise<T> {
  return withRetry(async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Suppress rollback errors if connection already terminated
      }
      throw error;
    } finally {
      client.release();
    }
  }, retryOptions);
}