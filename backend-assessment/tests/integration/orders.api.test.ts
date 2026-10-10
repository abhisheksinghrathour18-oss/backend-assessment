import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { closePools } from "../../src/infrastructure/database/pool";
import { writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";

describe("API integration tests", () => {
  afterAll(async () => {
    await closePools();
  });

  describe("System endpoints", () => {
    it("GET /health returns 200 and service status", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: "ok",
        service: "backend-assessment",
      });
    });

    it("returns 404 for an unknown endpoint", async () => {
      const response = await request(app).get("/unknown-route");

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe("File upload validation", () => {
    it("returns 400 when no file is uploaded", async () => {
      const response = await request(app).post("/api/v1/orders/upload");

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("Please upload a CSV or XLSX file");
    });

    it("returns 400 when a non-CSV/XLSX file is uploaded", async () => {
      const tempTxtFile = path.resolve("test-invalid-type.txt");
      await writeFile(tempTxtFile, "hello world", "utf-8");

      try {
        const response = await request(app)
          .post("/api/v1/orders/upload")
          .attach("file", tempTxtFile);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain("Only CSV and XLSX files are allowed");
      } finally {
        await unlink(tempTxtFile);
      }
    });

    it("returns 400 when an empty file is uploaded", async () => {
      const tempEmptyCsv = path.resolve("test-empty-upload.csv");
      await writeFile(tempEmptyCsv, "", "utf-8");

      try {
        const response = await request(app)
          .post("/api/v1/orders/upload")
          .attach("file", tempEmptyCsv);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain("Uploaded file is empty");
      } finally {
        await unlink(tempEmptyCsv);
      }
    });
  });

  describe("CSV Order Ingestion, Storage Provider & Sharding", () => {
    const cust1 = `CUST_TEST_${Date.now()}_A`;
    const cust2 = `CUST_TEST_${Date.now()}_B`;
    const orderId1 = randomUUID();
    const orderId2 = randomUUID();

    const sampleCsv = path.resolve(`test-upload-${Date.now()}.csv`);

    beforeAll(async () => {
      const csvLines = [
        "order_id,customer_id,order_date,order_amount,status",
        `${orderId1},${cust1},2026-10-01,1500.50,confirmed`,
        `${orderId2},${cust2},2026-10-02,2500.00,pending`,
      ].join("\n");

      await writeFile(sampleCsv, csvLines, "utf-8");
    });

    afterAll(async () => {
      try {
        await unlink(sampleCsv);
      } catch {
        // ignore
      }
    });

    it("successfully uploads valid orders and stores original file in stub storage", async () => {
      const response = await request(app)
        .post("/api/v1/orders/upload")
        .attach("file", sampleCsv);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.validRows).toBe(2);
      expect(response.body.data.insertedRows).toBe(2);
      expect(response.body.data.duplicateRows).toBe(0);
      expect(response.body.data.invalidRows).toBe(0);
      expect(response.body.data.failedBatches).toBe(0);

      // Verify stub storage reference
      expect(response.body.data.storage).toBeDefined();
      expect(response.body.data.storage.provider).toBe("stub");
      expect(existsSync(response.body.data.storage.location)).toBe(true);
    });

    it("retrieves the uploaded order by orderId", async () => {
      const response = await request(app).get(`/api/v1/orders/${orderId1}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.order_id).toBe(orderId1);
      expect(response.body.data.customer_id).toBe(cust1);
      expect(Number(response.body.data.order_amount)).toBe(1500.5);
      expect([1, 2]).toContain(response.body.shardId);
    });

    it("retrieves orders for a customer with consistent shard routing", async () => {
      const response = await request(app).get(`/api/v1/orders/customer/${cust1}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBeGreaterThanOrEqual(1);
      expect(response.body.data[0].customer_id).toBe(cust1);
    });

    it("is idempotent: uploading the same CSV again detects duplicates", async () => {
      const response = await request(app)
        .post("/api/v1/orders/upload")
        .attach("file", sampleCsv);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.validRows).toBe(2);
      expect(response.body.data.insertedRows).toBe(0);
      expect(response.body.data.duplicateRows).toBe(2);
    });
  });

  describe("Assessment alias endpoint POST /upload-orders with XLSX", () => {
    const custXlsx = `CUST_XLSX_${Date.now()}`;
    const orderIdXlsx = randomUUID();
    const sampleXlsx = path.resolve(`test-upload-${Date.now()}.xlsx`);

    beforeAll(async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Orders");
      ws.addRow(["order_id", "customer_id", "order_date", "order_amount", "status"]);
      ws.addRow([orderIdXlsx, custXlsx, new Date("2026-10-08"), 3400.0, "confirmed"]);
      await wb.xlsx.writeFile(sampleXlsx);
    });

    afterAll(async () => {
      try {
        await unlink(sampleXlsx);
      } catch {
        // ignore
      }
    });

    it("POST /upload-orders processes XLSX successfully through streaming pipeline", async () => {
      const response = await request(app)
        .post("/upload-orders")
        .attach("file", sampleXlsx);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.validRows).toBe(1);
      expect(response.body.data.insertedRows).toBe(1);
      expect(response.body.data.storage.provider).toBe("stub");
      expect(existsSync(response.body.data.storage.location)).toBe(true);
    });
  });

  describe("Invalid row handling and error reporting", () => {
    it("processes valid orders while isolating and reporting invalid rows", async () => {
      const invalidCsvPath = path.resolve("test-invalid-orders.csv");
      const response = await request(app)
        .post("/api/v1/orders/upload")
        .attach("file", invalidCsvPath);

      expect(response.status).toBe(200);
      expect(response.body.data.invalidRows).toBeGreaterThan(0);
      expect(response.body.data.errors.length).toBeGreaterThan(0);
      expect(response.body.data.errors[0]).toHaveProperty("row");
      expect(response.body.data.errors[0]).toHaveProperty("errors");
    });
  });

  describe("Query error handling", () => {
    it("returns 400 for an invalid UUID format in getOrderById", async () => {
      const response = await request(app).get("/api/v1/orders/invalid-uuid-123");

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("order_id must be a valid UUID");
    });

    it("returns 404 for a non-existent UUID in getOrderById", async () => {
      const randomId = randomUUID();
      const response = await request(app).get(`/api/v1/orders/${randomId}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("Order not found");
    });
  });
});
