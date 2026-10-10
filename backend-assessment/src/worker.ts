import { startOrderWorker, stopOrderWorker } from "./infrastructure/queue/order-worker";
import { closePools } from "./infrastructure/database/pool";
import { closeOrderQueue } from "./infrastructure/queue/order-queue";
import { logger } from "./utils/logger";

logger.info("Starting standalone order background worker process...");

const worker = startOrderWorker();

async function handleShutdown(signal: string) {
  logger.info({ signal }, "Gracefully shutting down worker process...");
  try {
    await stopOrderWorker();
    await closeOrderQueue();
    await closePools();
    logger.info("Worker process exited cleanly");
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, "Error during worker process shutdown");
    process.exit(1);
  }
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

