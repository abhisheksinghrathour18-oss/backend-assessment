import { describe, it, expect } from "vitest";
import {
  normalizeRawRow,
  parseOrdersCsv,
  parseOrdersFile,
} from "../../src/modules/orders/orders.parser";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

describe("normalizeRawRow", () => {
  it("maps typo order_amout to order_amount", () => {
    const raw = {
      order_id: "550e8400-e29b-41d4-a716-446655440000",
      customer_id: "CUST001",
      order_date: "2026-10-01",
      order_amout: "1500.50",
      status: "confirmed",
    };

    const normalized = normalizeRawRow(raw);
    expect(normalized.order_amount).toBe("1500.50");
  });

  it("normalizes trimmed and lowercase keys", () => {
    const raw = {
      " ORDER_ID ": "550e8400-e29b-41d4-a716-446655440000",
      " Customer_Id ": "CUST001",
      "Order_Date": "2026-10-01",
      "Order_Amount": "100.00",
      "Status": "pending",
    };

    const normalized = normalizeRawRow(raw);
    expect(normalized.order_id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(normalized.customer_id).toBe("CUST001");
    expect(normalized.order_amount).toBe("100.00");
  });
});

describe("parseOrdersCsv", () => {
  it("parses valid CSV and reports invalid rows with line numbers", async () => {
    const tempFile = path.resolve("test-temp-parser.csv");
    const csvContent = [
      "order_id,customer_id,order_date,order_amount,status",
      "550e8400-e29b-41d4-a716-446655440001,CUST001,2026-10-01,1500.50,confirmed",
      "invalid-uuid,CUST002,2026-10-02,200.00,pending",
      "550e8400-e29b-41d4-a716-446655440003,CUST003,2026-10-03,300.00,delivered",
    ].join("\n");

    await writeFile(tempFile, csvContent, "utf-8");

    try {
      const result = await parseOrdersCsv(tempFile);
      expect(result.validOrders.length).toBe(2);
      expect(result.invalidRows.length).toBe(1);
      expect(result.invalidRows[0].row).toBe(3);
      expect(result.invalidRows[0].errors.some((e) => e.includes("order_id"))).toBe(true);
    } finally {
      await unlink(tempFile);
    }
  });

  it("gracefully handles CSV with only header row", async () => {
    const tempFile = path.resolve("test-temp-empty.csv");
    await writeFile(tempFile, "order_id,customer_id,order_date,order_amount,status\n", "utf-8");

    try {
      const result = await parseOrdersCsv(tempFile);
      expect(result.validOrders.length).toBe(0);
      expect(result.invalidRows.length).toBe(0);
    } finally {
      await unlink(tempFile);
    }
  });
});

describe("parseOrdersFile (Excel XLSX)", () => {
  it("streams and parses valid XLSX records and maps order_amout", async () => {
    const tempXlsx = path.resolve("test-temp-orders.xlsx");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Orders");
    ws.addRow(["order_id", "customer_id", "order_date", "order_amout", "status"]);
    ws.addRow([
      "550e8400-e29b-41d4-a716-446655440010",
      "CUST_XLSX_1",
      new Date("2026-10-05"),
      2200.5,
      "confirmed",
    ]);
    ws.addRow([
      "invalid-uuid-xlsx",
      "CUST_XLSX_2",
      new Date("2026-10-06"),
      500,
      "pending",
    ]);
    await wb.xlsx.writeFile(tempXlsx);

    try {
      const result = await parseOrdersFile(tempXlsx);
      expect(result.validOrders.length).toBe(1);
      expect(result.invalidRows.length).toBe(1);
      expect(result.validOrders[0].customer_id).toBe("CUST_XLSX_1");
      expect(result.validOrders[0].order_amount).toBe(2200.5);
      expect(result.invalidRows[0].row).toBe(3);
    } finally {
      await unlink(tempXlsx);
    }
  });
});
