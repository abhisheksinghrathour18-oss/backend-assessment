
import { getShardId } from "../../infrastructure/database/shard-router";
import { getPool } from "../../infrastructure/database/pool";
import { insertOrdersBatch } from "./orders.repository";
import type { ParsedOrder } from "./orders.parser";

export interface ProcessOrdersResult {
  totalValidRows: number;
  insertedRows: number;
  duplicateRows: number;
  invalidRows: number;
  failedBatches: number;
}

export async function processOrders(
  orders: ParsedOrder[],
  invalidRowsCount: number,
): Promise<ProcessOrdersResult> {
  const batchesByShard: Record<1 | 2, ParsedOrder[]> = {
    1: [],
    2: [],
  };

  for (const order of orders) {
    const shardId = getShardId(order.customer_id);
    batchesByShard[shardId].push(order);
  }

  let insertedRows = 0;
  let duplicateRows = 0;
  let failedBatches = 0;

  const batchSize = Math.max(
    1,
    Number(process.env.BATCH_SIZE) || 500,
  );

  for (const shardId of [1, 2] as const) {
    const shardOrders = batchesByShard[shardId];
    const pool = getPool(shardId);

    for (let i = 0; i < shardOrders.length; i += batchSize) {
      const batch = shardOrders.slice(i, i + batchSize);

      try {
        const inserted = await insertOrdersBatch(pool, batch);
        insertedRows += inserted;
        duplicateRows += batch.length - inserted;
      } catch (error) {
        failedBatches++;

        console.error(
          `Batch failed on shard ${shardId}; size: ${batch.length}`,
          error,
        );
      }
    }
  }

  return {
    totalValidRows: orders.length,
    insertedRows,
    duplicateRows,
    invalidRows: invalidRowsCount,
    failedBatches,
  };
}
