import { parse } from "csv-parse";
import { createReadStream } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { orderSchema } from "./orders.validator";
import type { ParsedOrder, InvalidOrderRow } from "./orders.types";

export interface ParseOrdersResult {
  validOrders: ParsedOrder[];
  invalidRows: InvalidOrderRow[];
}

export interface StreamRowItem {
  rowNumber: number;
  order?: ParsedOrder;
  errors?: string[];
}

export function normalizeRawRow(rawRow: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawRow)) {
    const cleanKey = key.trim().toLowerCase();
    normalized[cleanKey] = typeof value === "string" ? value.trim() : value;
  }

  // Support the misspelled column in assessment CSV/Excel files: order_amout -> order_amount
  if (normalized.order_amount === undefined && normalized.order_amout !== undefined) {
    normalized.order_amount = normalized.order_amout;
  }

  return normalized;
}

export async function* iterateOrdersCsv(
  filePath: string,
): AsyncGenerator<StreamRowItem, void, unknown> {
  let rowNumber = 1;

  const parser = createReadStream(filePath).pipe(
    parse({
      columns: (header: string[]) =>
        header.map((col) => col.trim().toLowerCase()),
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
    }),
  );

  for await (const rawRow of parser) {
    rowNumber++;
    const normalized = normalizeRawRow(rawRow as Record<string, unknown>);
    const result = orderSchema.safeParse(normalized);

    if (!result.success) {
      yield {
        rowNumber,
        errors: result.error.issues.map(
          (issue) => `${issue.path.join(".")}: ${issue.message}`,
        ),
      };
      continue;
    }

    yield {
      rowNumber,
      order: {
        order_id: result.data.order_id,
        customer_id: result.data.customer_id,
        order_date: result.data.order_date,
        order_amount: result.data.order_amount,
        status: result.data.status,
      },
    };
  }
}

export async function* iterateOrdersExcel(
  filePath: string,
): AsyncGenerator<StreamRowItem, void, unknown> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: "emit",
    sharedStrings: "cache",
    worksheets: "emit",
  });

  let headerMap: string[] | null = null;

  for await (const worksheet of reader) {
    for await (const row of worksheet) {
      const rowNumber = row.number;

      if (headerMap === null) {
        const rawValues = Array.isArray(row.values) ? row.values : [];
        headerMap = rawValues.map((v) =>
          v ? String(v).trim().toLowerCase() : "",
        );
        continue;
      }

      const rawValues = Array.isArray(row.values) ? row.values : [];
      const rowObj: Record<string, unknown> = {};

      for (let colIdx = 1; colIdx < headerMap.length; colIdx++) {
        const key = headerMap[colIdx];
        if (key) {
          const cellVal = rawValues[colIdx];
          if (cellVal !== null && cellVal !== undefined) {
            if (
              typeof cellVal === "object" &&
              !(cellVal instanceof Date) &&
              "text" in (cellVal as unknown as Record<string, unknown>)
            ) {
              rowObj[key] = (cellVal as unknown as { text: unknown }).text;
            } else if (
              typeof cellVal === "object" &&
              !(cellVal instanceof Date) &&
              "result" in (cellVal as unknown as Record<string, unknown>)
            ) {
              rowObj[key] = (cellVal as unknown as { result: unknown }).result;
            } else {
              rowObj[key] = cellVal;
            }
          }
        }
      }

      if (Object.keys(rowObj).length === 0) {
        continue;
      }

      const normalized = normalizeRawRow(rowObj);
      const result = orderSchema.safeParse(normalized);

      if (!result.success) {
        yield {
          rowNumber,
          errors: result.error.issues.map(
            (issue) => `${issue.path.join(".")}: ${issue.message}`,
          ),
        };
        continue;
      }

      yield {
        rowNumber,
        order: {
          order_id: result.data.order_id,
          customer_id: result.data.customer_id,
          order_date: result.data.order_date,
          order_amount: result.data.order_amount,
          status: result.data.status,
        },
      };
    }
  }
}

export async function* iterateOrdersFile(
  filePath: string,
): AsyncGenerator<StreamRowItem, void, unknown> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".xlsx") {
    yield* iterateOrdersExcel(filePath);
  } else {
    yield* iterateOrdersCsv(filePath);
  }
}

export async function parseOrdersFile(
  filePath: string,
): Promise<ParseOrdersResult> {
  const validOrders: ParsedOrder[] = [];
  const invalidRows: InvalidOrderRow[] = [];

  for await (const item of iterateOrdersFile(filePath)) {
    if (item.order) {
      validOrders.push(item.order);
    } else if (item.errors) {
      invalidRows.push({
        row: item.rowNumber,
        errors: item.errors,
      });
    }
  }

  return { validOrders, invalidRows };
}

export const parseOrdersCsv = parseOrdersFile;
