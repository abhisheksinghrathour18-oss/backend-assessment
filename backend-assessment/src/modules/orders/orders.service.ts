import { getShardId, type shardId } from "../../infrastructure/database/shard-router";
import { getPool } from "../../infrastructure/database/pool";
import {
  insertOrdersBatch,
  findOrdersByCustomerId,
  findOrderById,
} from "./orders.repository";
import { iterateOrdersFile } from "./orders.parser";
import type {
  ParsedOrder,
  ProcessOrdersResult,
  InvalidOrderRow,
  Order,
} from "./orders.types";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

const MAX_REPORTED_ERRORS = 100;

export async function processOrdersStream(
  filePath: string,
  options?: { batchSize?: number },
): Promise<ProcessOrdersResult> {
  const batchSize = Math.max(1, options?.batchSize || env.BATCH_SIZE || 500);

  const shardBuffers: Record<shardId, ParsedOrder[]> = {
    1: [],
    2: [],
  };

  const shardDistribution: Record<shardId, { inserted: number; duplicates: number }> = {
    1: { inserted: 0, duplicates: 0 },
    2: { inserted: 0, duplicates: 0 },
  };

  let validRows = 0;
  let invalidRows = 0;
  let insertedRows = 0;
  let duplicateRows = 0;
  let failedBatches = 0;
  let failedRows = 0;
  const errors: InvalidOrderRow[] = [];

  const flushBatch = async (shardId: shardId) => {
    const batch = shardBuffers[shardId];
    if (batch.length === 0) return;

    // Reset buffer immediately to bound memory
    shardBuffers[shardId] = [];

    const pool = getPool(shardId);
    try {
      const inserted = await insertOrdersBatch(pool, batch);
      const duplicates = batch.length - inserted;

      insertedRows += inserted;
      duplicateRows += duplicates;

      shardDistribution[shardId].inserted += inserted;
      shardDistribution[shardId].duplicates += duplicates;
    } catch (error) {
      failedBatches++;
      failedRows += batch.length;
      logger.error(
        { err: error, shardId, batchSize: batch.length },
        "Database batch insert failed on shard",
      );
    }
  };

  for await (const item of iterateOrdersFile(filePath)) {
    if (item.order) {
      validRows++;
      const shardId = getShardId(item.order.customer_id);
      shardBuffers[shardId].push(item.order);

      if (shardBuffers[shardId].length >= batchSize) {
        await flushBatch(shardId);
      }
    } else if (item.errors) {
      invalidRows++;
      if (errors.length < MAX_REPORTED_ERRORS) {
        errors.push({
          row: item.rowNumber,
          errors: item.errors,
        });
      }
    }
  }

  // Flush any remaining buffered records for both shards
  await flushBatch(1);
  await flushBatch(2);

  return {
    totalRowsProcessed: validRows + invalidRows,
    validRows,
    insertedRows,
    duplicateRows,
    invalidRows,
    failedBatches,
    failedRows,
    errors,
    shardDistribution,
  };
}

export async function processOrders(
  orders: ParsedOrder[],
  invalidRowsCount: number,
): Promise<ProcessOrdersResult> {
  const batchSize = Math.max(1, env.BATCH_SIZE || 500);

  const batchesByShard: Record<shardId, ParsedOrder[]> = {
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
  let failedRows = 0;

  const shardDistribution: Record<shardId, { inserted: number; duplicates: number }> = {
    1: { inserted: 0, duplicates: 0 },
    2: { inserted: 0, duplicates: 0 },
  };

  for (const shardId of [1, 2] as const) {
    const shardOrders = batchesByShard[shardId];
    const pool = getPool(shardId);

    for (let i = 0; i < shardOrders.length; i += batchSize) {
      const batch = shardOrders.slice(i, i + batchSize);

      try {
        const inserted = await insertOrdersBatch(pool, batch);
        const duplicates = batch.length - inserted;

        insertedRows += inserted;
        duplicateRows += duplicates;

        shardDistribution[shardId].inserted += inserted;
        shardDistribution[shardId].duplicates += duplicates;
      } catch (error) {
        failedBatches++;
        failedRows += batch.length;
        logger.error(
          { err: error, shardId, batchSize: batch.length },
          "Batch insertion failed on shard",
        );
      }
    }
  }

  return {
    totalRowsProcessed: orders.length + invalidRowsCount,
    validRows: orders.length,
    insertedRows,
    duplicateRows,
    invalidRows: invalidRowsCount,
    failedBatches,
    failedRows,
    errors: [],
    shardDistribution,
  };
}

export async function getOrdersByCustomer(
  customerId: string,
  limit = 50,
  offset = 0,
): Promise<{ orders: Order[]; shardId: shardId }> {
  const shardId = getShardId(customerId);
  const pool = getPool(shardId);
  const orders = await findOrdersByCustomerId(pool, customerId, limit, offset);

  return { orders, shardId };
}

export async function getOrderById(
  orderId: string,
): Promise<{ order: Order | null; shardId: shardId | null }> {
  const [orderShard1, orderShard2] = await Promise.all([
    findOrderById(getPool(1), orderId),
    findOrderById(getPool(2), orderId),
  ]);

  if (orderShard1) {
    return { order: orderShard1, shardId: 1 };
  }
  if (orderShard2) {
    return { order: orderShard2, shardId: 2 };
  }

  return { order: null, shardId: null };
}
