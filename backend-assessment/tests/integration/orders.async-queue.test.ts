import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { startOrderWorker, stopOrderWorker } from "../../src/infrastructure/queue/order-worker";
import { closeOrderQueue } from "../../src/infrastructure/queue/order-queue";
import { closePools } from "../../src/infrastructure/database/pool";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

describe("Background Queue and Worker Integration Tests", () => {
  let worker: ReturnType<typeof startOrderWorker>;

  beforeAll(async () => {
    worker = startOrderWorker(2);
  });

  afterAll(async () => {
    await stopOrderWorker();
    await closeOrderQueue();
    await closePools();
  });

  it("POST /api/v1/orders/upload/async accepts CSV and processes in background", async () => {
    const orderId1 = randomUUID();
    const orderId2 = randomUUID();

    const csvContent = [
      "order_id,customer_id,order_date,order_amount,status",
      `${orderId1},cust-async-1,2026-03-01T10:00:00Z,250.75,PENDING`,
      `${orderId2},cust-async-2,2026-03-01T11:00:00Z,89.50,DELIVERED`,
    ].join("\n");

    const uploadRes = await request(app)
      .post("/api/v1/orders/upload/async")
      .attach("file", Buffer.from(csvContent), "test-async.csv");

    expect(uploadRes.status).toBe(202);
    expect(uploadRes.body.success).toBe(true);
    expect(uploadRes.body.message).toContain("accepted");
    expect(uploadRes.body.data.jobId).toBeDefined();
    expect(uploadRes.body.data.status).toBe("queued");
    expect(uploadRes.body.data.pollUrl).toContain(uploadRes.body.data.jobId);

    const jobId = uploadRes.body.data.jobId;

    // Poll until completed (timeout after 5 seconds)
    let completed = false;
    let pollRes;
    for (let i = 0; i < 25; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      pollRes = await request(app).get(`/api/v1/orders/jobs/${jobId}`);
      expect(pollRes.status).toBe(200);

      if (pollRes.body.data.status === "completed") {
        completed = true;
        break;
      }
    }

    expect(completed).toBe(true);
    expect(pollRes?.body.data.result).toBeDefined();
    expect(pollRes?.body.data.result.totalRowsProcessed).toBe(2);
    expect(pollRes?.body.data.result.validRows).toBe(2);
    expect(pollRes?.body.data.result.insertedRows).toBe(2);
    expect(pollRes?.body.data.result.duplicateRows).toBe(0);
    expect(pollRes?.body.data.result.invalidRows).toBe(0);

    // Repeated upload: verify duplicate-job & idempotency counters
    const uploadRes2 = await request(app)
      .post("/api/v1/orders/upload/async")
      .attach("file", Buffer.from(csvContent), "test-async-duplicate.csv");

    expect(uploadRes2.status).toBe(202);
    const jobId2 = uploadRes2.body.data.jobId;

    let completed2 = false;
    let pollRes2;
    for (let i = 0; i < 25; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      pollRes2 = await request(app).get(`/api/v1/orders/jobs/${jobId2}`);
      if (pollRes2.body.data.status === "completed") {
        completed2 = true;
        break;
      }
    }

    expect(completed2).toBe(true);
    expect(pollRes2?.body.data.result.totalRowsProcessed).toBe(2);
    expect(pollRes2?.body.data.result.validRows).toBe(2);
    expect(pollRes2?.body.data.result.insertedRows).toBe(0);
    expect(pollRes2?.body.data.result.duplicateRows).toBe(2);
    expect(pollRes2?.body.data.result.invalidRows).toBe(0);
  });

  it("POST /upload-orders/async alias processes XLSX through background worker", async () => {
    const orderId = randomUUID();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Orders");
    worksheet.addRow([
      "order_id",
      "customer_id",
      "order_date",
      "order_amount",
      "status",
    ]);
    worksheet.addRow([
      orderId,
      "cust-async-xlsx",
      "2026-03-01T12:00:00Z",
      199.99,
      "PROCESSING",
    ]);

    const tempFilePath = path.join(
      os.tmpdir(),
      `test-async-${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    try {
      const uploadRes = await request(app)
        .post("/upload-orders/async")
        .attach("file", tempFilePath);

      expect(uploadRes.status).toBe(202);
      expect(uploadRes.body.success).toBe(true);
      const jobId = uploadRes.body.data.jobId;

      let completed = false;
      let pollRes;
      for (let i = 0; i < 25; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        pollRes = await request(app).get(`/upload-orders/jobs/${jobId}`);
        expect(pollRes.status).toBe(200);

        if (pollRes.body.data.status === "completed") {
          completed = true;
          break;
        }
      }

      expect(completed).toBe(true);
      expect(pollRes?.body.data.result.validRows).toBe(1);
      expect(pollRes?.body.data.result.insertedRows).toBe(1);
    } finally {
      await fs.unlink(tempFilePath).catch(() => {});
    }
  });

  it("returns 404 for non-existent job polling", async () => {
    const res = await request(app).get("/api/v1/orders/jobs/non-existent-job-id");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("Job not found");
  });

  it("returns 400 when no file is uploaded to async endpoint", async () => {
    const res = await request(app).post("/api/v1/orders/upload/async");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("Please upload a CSV or XLSX file");
  });

  it("returns 400 when empty file is uploaded to async endpoint", async () => {
    const res = await request(app)
      .post("/api/v1/orders/upload/async")
      .attach("file", Buffer.from(""), "empty.csv");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("Uploaded file is empty");
  });
});

