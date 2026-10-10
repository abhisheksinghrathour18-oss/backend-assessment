import { env } from "../../config/env";
import { logger } from "../../utils/logger";

const TRANSIENT_PG_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "57P01", // admin_shutdown
  "57014", // query_canceled
  "53300", // too_many_connections
  "53200", // out_of_memory
  "08006", // connection_failure
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08003", // connection_does_not_exist
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
]);

const TRANSIENT_SYSTEM_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  isTransient?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Determines whether an error is transient and safe to retry.
 * Permanent errors (unique constraint violations, validation errors,
 * syntax errors, invalid data types) return false.
 */
export function isTransientDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as Record<string, unknown>;

  // Check Postgres SQLSTATE error code
  if (typeof err.code === "string") {
    if (TRANSIENT_PG_CODES.has(err.code)) {
      return true;
    }
    if (TRANSIENT_SYSTEM_CODES.has(err.code)) {
      return true;
    }
  }

  // Check error message patterns for disconnects and deadlocks
  if (typeof err.message === "string") {
    const msg = err.message.toLowerCase();
    if (
      msg.includes("deadlock detected") ||
      msg.includes("could not serialize access") ||
      msg.includes("connection terminated") ||
      msg.includes("connection closed") ||
      msg.includes("server closed the connection") ||
      msg.includes("terminating connection due to administrator command")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Calculates exponential backoff delay with canonical full jitter.
 * Formula: sleep = Math.round(Math.random() * Math.min(maxDelayMs, baseDelayMs * 2^(attempt - 1)))
 *
 * Full jitter draws uniformly from [0, min(maxDelayMs, baseDelayMs * 2^(attempt - 1))],
 * completely desynchronizing retry attempts across concurrent database clients.
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const cappedExponential = Math.min(
    maxDelayMs,
    baseDelayMs * Math.pow(2, Math.max(0, attempt - 1)),
  );
  return Math.round(Math.random() * cappedExponential);
}

/**
 * Executes an asynchronous operation with bounded exponential backoff and jitter for transient errors.
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? env.DB_MAX_RETRIES ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? env.DB_RETRY_BASE_MS ?? 100;
  const maxDelayMs = options?.maxDelayMs ?? env.DB_RETRY_MAX_MS ?? 2000;
  const checkTransient = options?.isTransient ?? isTransientDatabaseError;

  let attempt = 0;

  while (true) {
    try {
      return await operation(attempt + 1);
    } catch (error) {
      attempt++;

      if (attempt > maxRetries || !checkTransient(error)) {
        throw error;
      }

      const delayMs = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs);

      if (options?.onRetry) {
        options.onRetry(error, attempt, delayMs);
      } else {
        logger.warn(
          {
            err: error,
            attempt,
            maxRetries,
            delayMs,
          },
          "Transient database error encountered. Retrying with backoff",
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

