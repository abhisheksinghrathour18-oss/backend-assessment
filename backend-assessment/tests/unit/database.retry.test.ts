import { describe, it, expect, vi } from "vitest";
import {
  isTransientDatabaseError,
  calculateBackoffDelay,
  withRetry,
} from "../../src/infrastructure/database/retry";

describe("Database Retry and Transient Error Policy", () => {
  describe("isTransientDatabaseError", () => {
    it("identifies PostgreSQL transient codes correctly", () => {
      expect(isTransientDatabaseError({ code: "40001" })).toBe(true); // serialization_failure
      expect(isTransientDatabaseError({ code: "40P01" })).toBe(true); // deadlock_detected
      expect(isTransientDatabaseError({ code: "57P01" })).toBe(true); // admin_shutdown
      expect(isTransientDatabaseError({ code: "53300" })).toBe(true); // too_many_connections
      expect(isTransientDatabaseError({ code: "08006" })).toBe(true); // connection_failure
    });

    it("identifies network and system transient errors", () => {
      expect(isTransientDatabaseError({ code: "ECONNRESET" })).toBe(true);
      expect(isTransientDatabaseError({ code: "ECONNREFUSED" })).toBe(true);
      expect(isTransientDatabaseError({ code: "ETIMEDOUT" })).toBe(true);
      expect(isTransientDatabaseError({ code: "EPIPE" })).toBe(true);
    });

    it("identifies transient messages even if code is missing", () => {
      expect(
        isTransientDatabaseError(new Error("deadlock detected on shard 1")),
      ).toBe(true);
      expect(
        isTransientDatabaseError(
          new Error("could not serialize access due to concurrent update"),
        ),
      ).toBe(true);
      expect(
        isTransientDatabaseError(new Error("Connection terminated unexpectedly")),
      ).toBe(true);
    });

    it("does NOT classify permanent errors as transient", () => {
      expect(isTransientDatabaseError({ code: "23505" })).toBe(false); // unique_violation
      expect(isTransientDatabaseError({ code: "23514" })).toBe(false); // check_violation
      expect(isTransientDatabaseError({ code: "23503" })).toBe(false); // foreign_key_violation
      expect(isTransientDatabaseError({ code: "42601" })).toBe(false); // syntax_error
      expect(isTransientDatabaseError({ code: "22P02" })).toBe(false); // invalid_text_representation
      expect(isTransientDatabaseError(new Error("Validation failed"))).toBe(false);
      expect(isTransientDatabaseError(null)).toBe(false);
      expect(isTransientDatabaseError(undefined)).toBe(false);
    });
  });

  describe("calculateBackoffDelay", () => {
    it("calculates canonical full jitter delay within expected bounds [0, cap]", () => {
      for (let i = 0; i < 20; i++) {
        const delay = calculateBackoffDelay(1, 100, 2000);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(100);
      }

      for (let i = 0; i < 20; i++) {
        const delay = calculateBackoffDelay(4, 100, 500);
        // Exponential without cap would be 100 * 2^3 = 800, capped at 500
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(500);
      }
    });
  });

  describe("withRetry execution", () => {
    it("returns result immediately if operation succeeds on attempt 1", async () => {
      const operation = vi.fn().mockResolvedValue("success");
      const result = await withRetry(operation, {
        maxRetries: 3,
        baseDelayMs: 10,
        maxDelayMs: 50,
      });

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("retries transient error and succeeds after subsequent attempts", async () => {
      let attempts = 0;
      const onRetry = vi.fn();

      const operation = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          const err = new Error("deadlock detected");
          (err as Record<string, unknown>).code = "40P01";
          throw err;
        }
        return `succeeded on attempt ${attempts}`;
      });

      const result = await withRetry(operation, {
        maxRetries: 4,
        baseDelayMs: 5,
        maxDelayMs: 20,
        onRetry,
      });

      expect(result).toBe("succeeded on attempt 3");
      expect(operation).toHaveBeenCalledTimes(3);
      expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it("fails immediately without retry for non-transient errors", async () => {
      const operation = vi.fn().mockImplementation(async () => {
        const err = new Error("Unique constraint violation");
        (err as Record<string, unknown>).code = "23505";
        throw err;
      });

      await expect(
        withRetry(operation, {
          maxRetries: 3,
          baseDelayMs: 5,
          maxDelayMs: 20,
        }),
      ).rejects.toThrow("Unique constraint violation");

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("exhausts maxRetries and throws if transient error persists", async () => {
      const operation = vi.fn().mockImplementation(async () => {
        const err = new Error("could not serialize access");
        (err as Record<string, unknown>).code = "40001";
        throw err;
      });

      await expect(
        withRetry(operation, {
          maxRetries: 2,
          baseDelayMs: 5,
          maxDelayMs: 20,
        }),
      ).rejects.toThrow("could not serialize access");

      // 1 initial attempt + 2 retries = 3 calls
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });
});

