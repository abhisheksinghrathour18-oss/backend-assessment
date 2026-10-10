import { describe, it, expect, afterAll } from "vitest";
import { processOrdersStream } from "../../src/modules/orders/orders.service";
import { closePools, getPool } from "../../src/infrastructure/database/pool";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import ExcelJS from "exceljs";

describe("10,000-row streaming and memory benchmark", () => {
  const csvFilePath = path.resolve("test-10000-orders.csv");
  const xlsxFilePath = path.resolve("test-10000-orders.xlsx");
  const testCustomerPrefix = `PERF_CUST_${Date.now()}_`;
  const totalRows = 10000;

  afterAll(async () => {
    try {
      await unlink(csvFilePath);
    } catch {
      // ignore
    }

    try {
      await unlink(xlsxFilePath);
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

  it("processes 10,000 CSV rows with bounded memory usage and correct shard distribution", async () => {
    // Generate 10,000 rows CSV using write stream
    const writeStream = createWriteStream(csvFilePath, { encoding: "utf-8" });
    writeStream.write("order_id,customer_id,order_date,order_amount,status\n");

    for (let i = 0; i < totalRows; i++) {
      const orderId = randomUUID();
      const customerId = `${testCustomerPrefix}CSV_${i % 100}`;
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
    let peakHeapUsed = initialHeapUsed;

    // Continuously monitor heap memory every 20ms during streaming ingestion
    const memorySampler = setInterval(() => {
      const current = process.memoryUsage().heapUsed;
      if (current > peakHeapUsed) {
        peakHeapUsed = current;
      }
    }, 20);

    let result;
    try {
      result = await processOrdersStream(csvFilePath, { batchSize: 500 });
    } finally {
      clearInterval(memorySampler);
    }

    if (global.gc) {
      global.gc();
    }
    const finalHeapUsed = process.memoryUsage().heapUsed;
    const finalDiffMB = (finalHeapUsed - initialHeapUsed) / (1024 * 1024);
    const peakGrowthMB = (peakHeapUsed - initialHeapUsed) / (1024 * 1024);

    expect(result.totalRowsProcessed).toBe(totalRows);
    expect(result.validRows).toBe(totalRows);
    expect(result.insertedRows).toBe(totalRows);
    expect(result.duplicateRows).toBe(0);
    expect(result.invalidRows).toBe(0);
    expect(result.failedBatches).toBe(0);
    expect(result.failedRows).toBe(0);

    // Verify both shards received rows
    expect(result.shardDistribution[1].inserted).toBeGreaterThan(0);
    expect(result.shardDistribution[2].inserted).toBeGreaterThan(0);
    expect(
      result.shardDistribution[1].inserted + result.shardDistribution[2].inserted
    ).toBe(totalRows);

    console.log(`[CSV Performance] 10,000 rows processed in streaming mode:`);
    console.log(`- Shard 1 inserted: ${result.shardDistribution[1].inserted}`);
    console.log(`- Shard 2 inserted: ${result.shardDistribution[2].inserted}`);
    console.log(`- Initial Heap: ${(initialHeapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`- Peak Heap: ${(peakHeapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`- Final Heap: ${(finalHeapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`- Peak Growth: ${peakGrowthMB.toFixed(2)} MB`);
    console.log(`- Net Heap Delta: ${finalDiffMB.toFixed(2)} MB`);

    // Verify bounded memory: peak growth does not blow up proportionally to 10k rows
    expect(peakGrowthMB).toBeLessThan(75);
  }, 60000);

  it("processes 10,000 XLSX rows with streaming reader and correct shard distribution", async () => {
    // Generate 10,000 rows XLSX using streaming WorkbookWriter
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: xlsxFilePath,
      useStyles: false,
    });
    const worksheet = workbook.addWorksheet("Orders");
    worksheet.addRow(["order_id", "customer_id", "order_date", "order_amount", "status"]).commit();

    for (let i = 0; i < totalRows; i++) {
      const orderId = randomUUID();
      const customerId = `${testCustomerPrefix}XLSX_${i % 100}`;
      const amount = 10 + (i % 500);
      worksheet.addRow([orderId, customerId, "2026-10-10", amount, "confirmed"]).commit();
    }
    await worksheet.commit();
    await workbook.commit();

    if (global.gc) {
      global.gc();
    }
    const initialHeapUsed = process.memoryUsage().heapUsed;
    let peakHeapUsed = initialHeapUsed;

    // Continuously monitor heap memory every 20ms during XLSX streaming ingestion
    const memorySampler = setInterval(() => {
      const current = process.memoryUsage().heapUsed;
      if (current > peakHeapUsed) {
        peakHeapUsed = current;
      }
    }, 20);

    let result;
    try {
      result = await processOrdersStream(xlsxFilePath, { batchSize: 500 });
    } finally {
      clearInterval(memorySampler);
    }

    if (global.gc) {
      global.gc();
    }
    const finalHeapUsed = process.memoryUsage().heapUsed;
    const finalDiffMB = (finalHeapUsed - initialHeapUsed) / (1024 * 1024);
    const peakGrowthMB = (peakHeapUsed - initialHeapUsed) / (1024 * 1024);

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

    console.log(`[XLSX Performance] 10,000 rows processed in streaming mode:`);
    console.log(`- Shard 1 inserted: ${result.shardDistribution[1].inserted}`);
    console.log(`- Shard 2 inserted: ${result.shardDistribution[2].inserted}`);
    console.log(`- Initial Heap: ${(initialHeapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`- Peak Heap: ${(peakHeapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`- Final Heap: ${(finalHeapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`- Peak Growth: ${peakGrowthMB.toFixed(2)} MB`);
    console.log(`- Net Heap Delta: ${finalDiffMB.toFixed(2)} MB`);

    // Verify bounded memory during XLSX streaming
    expect(peakGrowthMB).toBeLessThan(120);
  }, 90000);
});
