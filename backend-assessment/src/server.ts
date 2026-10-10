import { env } from "./config/env";
import { app } from "./app";
import { closePools } from "./infrastructure/database/pool";
import { startOrderWorker, stopOrderWorker } from "./infrastructure/queue/order-worker";
import { closeOrderQueue } from "./infrastructure/queue/order-queue";
import { logger } from "./utils/logger";

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  logger.info(`Server is running at http://localhost:${PORT}`);
  logger.info(`Health check endpoint is available at http://localhost:${PORT}/health`);
  logger.info(`Swagger docs are available at http://localhost:${PORT}/api-docs`);
});

// Start in-process background worker if enabled
if (env.ENABLE_IN_PROCESS_WORKER) {
  logger.info("Initializing in-process BullMQ order worker");
  startOrderWorker();
}

async function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Initiating graceful shutdown...");

  server.close(async () => {
    logger.info("HTTP server closed to new requests");

    try {
      if (env.ENABLE_IN_PROCESS_WORKER) {
        await stopOrderWorker();
      }
      await closeOrderQueue();
      await closePools();
      logger.info("All background workers, queues, and database pools closed cleanly");
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, "Error during graceful shutdown");
      process.exit(1);
    }
  });

  // Force exit after 10s timeout
  setTimeout(() => {
    logger.error("Forced exit due to graceful shutdown timeout");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

