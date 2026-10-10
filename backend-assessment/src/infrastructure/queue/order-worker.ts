import { Worker, type Job } from "bullmq";
import { env } from "../../config/env";
import { getRedisOptions } from "./redis.connection";
import { storageService } from "../storage/storage.service";
import { processOrdersStream } from "../../modules/orders/orders.service";
import type { OrderIngestionJobData } from "./order-queue.types";
import type { ProcessOrdersResult } from "../../modules/orders/orders.types";
import { logger } from "../../utils/logger";

let workerInstance: Worker | null = null;

export async function processOrderJob(
  job: Job<OrderIngestionJobData, ProcessOrdersResult>,
): Promise<ProcessOrdersResult> {
  logger.info(
    {
      jobId: job.id,
      objectKey: job.data.objectKey,
      filename: job.data.originalFilename,
    },
    "Background worker started processing order ingestion job",
  );

  const filePath = await storageService.getFilePath(job.data.objectKey);
  const result = await processOrdersStream(filePath, {
    batchSize: job.data.batchSize,
  });

  logger.info(
    {
      jobId: job.id,
      totalRowsProcessed: result.totalRowsProcessed,
      validRows: result.validRows,
      insertedRows: result.insertedRows,
      duplicateRows: result.duplicateRows,
      invalidRows: result.invalidRows,
      failedBatches: result.failedBatches,
    },
    "Background worker successfully finished order ingestion job",
  );

  return result;
}

export function startOrderWorker(concurrency = 2): Worker {
  if (workerInstance) {
    return workerInstance;
  }

  const worker = new Worker(env.QUEUE_NAME, processOrderJob, {
    connection: getRedisOptions(),
    concurrency,
  });

  workerInstance = worker;

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Job completed successfully");
  });

  workerInstance.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, err },
      "Job failed in background worker",
    );
  });

  workerInstance.on("error", (err) => {
    logger.error({ err }, "BullMQ Worker encountered an error");
  });

  logger.info(
    { queue: env.QUEUE_NAME, concurrency },
    "Order ingestion background worker started",
  );

  return workerInstance;
}

export async function stopOrderWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
    logger.info("Order ingestion background worker stopped");
  }
}
