import { parse } from "csv-parse";
import { createReadStream } from "node:fs";
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

  // Support the misspelled column in assessment CSV files: order_amout -> order_amount
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

export async function parseOrdersCsv(
  filePath: string,
): Promise<ParseOrdersResult> {
  const validOrders: ParsedOrder[] = [];
  const invalidRows: InvalidOrderRow[] = [];

  for await (const item of iterateOrdersCsv(filePath)) {
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
