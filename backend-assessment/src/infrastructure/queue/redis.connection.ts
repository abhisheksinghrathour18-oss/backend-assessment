import type { ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

export function getRedisOptions(): ConnectionOptions {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
}

let redisInstance: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    });

    redisInstance.on("connect", () => {
      logger.info(
        { host: env.REDIS_HOST, port: env.REDIS_PORT },
        "Connected to Redis server",
      );
    });

    redisInstance.on("error", (err) => {
      logger.error({ err }, "Redis connection error");
    });
  }

  return redisInstance;
}
