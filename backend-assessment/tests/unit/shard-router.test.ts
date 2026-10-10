
import { describe, it, expect } from "vitest";
import { getShardId } from "../../src/infrastructure/database/shard-router";

describe("getShardId", () => {
  it("returns a valid shard ID", () => {
    const shardId = getShardId("customer-123");

    expect([1, 2]).toContain(shardId);
  });

  it("routes the same customer consistently", () => {
    expect(getShardId("customer-123")).toBe(
      getShardId("customer-123")
    );
  });

  it("rejects an empty customer ID", () => {
    expect(() => getShardId("")).toThrow();
  });

  it("rejects a whitespace-only customer ID", () => {
    expect(() => getShardId("   ")).toThrow();
  });
});
