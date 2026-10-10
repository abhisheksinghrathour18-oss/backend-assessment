
import { createHash } from "node:crypto";

export type shardId = 1 | 2;

export function getShardId(customerId: string): shardId {
  if (!customerId.trim()) {
    throw new Error("Invalid customer ID");
  }

  const hash = createHash("sha256")
    .update(customerId)
    .digest();

  return ((hash.readUInt32BE(0) % 2) + 1) as shardId;
}
