import { describe, it, expect, afterAll } from "vitest";
import { processOrdersStream } from "../../src/modules/orders/orders.service";
import { closePools, getPool } from "../../src/infrastructure/database/pool";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { once } from "node:events";

describe("10,000-row streaming and memory benchmark", () => {
  const filePath = path.resolve("test-10000-orders.csv");
  const testCustomerPrefix = `PERF_CUST_${Date.now()}_`;
  const totalRows = 10000;

  afterAll(async () => {
    try {
      await unlink(filePath);
    } catch {
      // ignore
    }

    // Clean up inserted performance test rows from both shards
    try {
      await Promise.all([
        getPool(1).query("DELETE FROM orders WHERE customer_id LIKE $1", [`${testCustomerPrefix}%`]),
        getPool(2).query("DELETE FROM orders WHERE customer_id LIKE $1", [`${testCustomerPrefix}%`]),
      ]);
    } catch {
      // ignore
    }

    await closePools();
  });

  it("processes 10,000 rows with bounded memory usage and correct shard distribution", async () => {
    const writeStream = createWriteStream(filePath, { encoding: "utf-8" });
    writeStream.write("order_id,customer_id,order_date,order_amount,status\n");

    for (let i = 0; i < totalRows; i++) {
      const orderId = randomUUID();
      const customerId = `${testCustomerPrefix}${i % 100}`;
      const amount = (10 + (i % 500)).toFixed(2);
      const row = `${orderId},${customerId},2026-10-10,${amount},confirmed\n`;

      if (!writeStream.write(row)) {
        await once(writeStream, "drain");
      }
    }
    writeStream.end();
    await once(writeStream, "finish");

    if (global.gc) {
      global.gc();
    }
    const initialHeapUsed = process.memoryUsage().heapUsed;

    const result = await processOrdersStream(filePath, { batchSize: 500 });

    if (global.gc) {
      global.gc();
    }
    const finalHeapUsed = process.memoryUsage().heapUsed;
    const heapDiffMB = (finalHeapUsed - initialHeapUsed) / (1024 * 1024);

    expect(result.totalRowsProcessed).toBe(totalRows);
    expect(result.validRows).toBe(totalRows);
    expect(result.insertedRows).toBe(totalRows);
    expect(result.duplicateRows).toBe(0);
    expect(result.invalidRows).toBe(0);
    expect(result.failedBatches).toBe(0);
    expect(result.failedRows).toBe(0);

    expect(result.shardDistribution[1].inserted).toBeGreaterThan(0);
    expect(result.shardDistribution[2].inserted).toBeGreaterThan(0);
    expect(
      result.shardDistribution[1].inserted + result.shardDistribution[2].inserted
    ).toBe(totalRows);

    console.log(`[Performance Report] 10,000 rows processed in streaming mode:`);
    console.log(`- Shard 1 inserted: ${result.shardDistribution[1].inserted}`);
    console.log(`- Shard 2 inserted: ${result.shardDistribution[2].inserted}`);
    console.log(`- Initial Heap: ${(initialHeapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`- Final Heap: ${(finalHeapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`- Heap Delta: ${heapDiffMB.toFixed(2)} MB`);

    expect(heapDiffMB).toBeLessThan(50);
  }, 60000);
});

