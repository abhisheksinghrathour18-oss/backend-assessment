import { Queue, type Job } from "bullmq";
import { env } from "../../config/env";
import { getRedisOptions } from "./redis.connection";
import type {
  OrderIngestionJobData,
  OrderIngestionJobStatus,
  JobStatusState,
} from "./order-queue.types";
import type { ProcessOrdersResult } from "../../modules/orders/orders.types";
import { logger } from "../../utils/logger";

let orderQueueInstance: Queue | null = null;

export function getOrderQueue(): Queue {
  if (!orderQueueInstance) {
    const queue = new Queue(env.QUEUE_NAME, {
      connection: getRedisOptions(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: {
          age: 24 * 3600, // keep completed jobs for 24 hours
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // keep failed jobs for 7 days
        },
      },
    });

    queue.on("error", (err) => {
      logger.error({ err }, "BullMQ Queue error");
    });

    orderQueueInstance = queue;
  }

  return orderQueueInstance;
}

export async function addOrderIngestionJob(
  data: OrderIngestionJobData,
  customJobId?: string,
): Promise<Job<OrderIngestionJobData, ProcessOrdersResult>> {
  const queue = getOrderQueue();
  // Ensure duplicate-job safety: use customJobId or deterministic objectKey ID
  const jobId =
    customJobId ||
    (data.objectKey
      ? `job-${data.objectKey}`
      : `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

  const job = await queue.add("ingest-orders", data, {
    jobId,
  });

  logger.info(
    {
      jobId: job.id,
      originalFilename: data.originalFilename,
      objectKey: data.objectKey,
    },
    "Enqueued order ingestion job to BullMQ",
  );

  return job;
}

export async function getOrderJobStatus(
  jobId: string,
): Promise<OrderIngestionJobStatus | null> {
  const queue = getOrderQueue();
  const job = await queue.getJob(jobId);

  if (!job) {
    return null;
  }

  const rawState = (await job.getState()) as string;
  let status: JobStatusState = "unknown";

  if (rawState === "waiting" || rawState === "wait" || rawState === "prioritized") {
    status = "queued";
  } else if (rawState === "active") {
    status = "active";
  } else if (rawState === "completed") {
    status = "completed";
  } else if (rawState === "failed") {
    status = "failed";
  } else if (rawState === "delayed") {
    status = "delayed";
  }

  const progress = typeof job.progress === "number" ? job.progress : 0;

  return {
    jobId: String(job.id),
    status,
    progress,
    data: job.data,
    result: job.returnvalue || null,
    failedReason: job.failedReason || null,
    createdAt: job.timestamp,
    processedOn: job.processedOn || null,
    finishedOn: job.finishedOn || null,
  };
}

export async function closeOrderQueue(): Promise<void> {
  if (orderQueueInstance) {
    await orderQueueInstance.close();
    orderQueueInstance = null;
    logger.info("BullMQ order queue closed");
  }
}
