
import { parse } from "csv-parse";
import { createReadStream } from "node:fs";
import { orderSchema } from "./orders.validator";

export interface ParsedOrder {
  order_id: string;
  customer_id: string;
  order_date: Date;
  order_amount: number;
  status: string;
}

export interface InvalidOrderRow {
  row: number;
  errors: string[];
}

export interface ParseOrdersResult {
  validOrders: ParsedOrder[];
  invalidRows: InvalidOrderRow[];
}

export async function parseOrdersCsv(
  filePath: string
): Promise<ParseOrdersResult> {
  const validOrders: ParsedOrder[] = [];
  const invalidRows: InvalidOrderRow[] = [];
  let rowNumber = 1;

  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true,
      trim: true,
      skip_empty_lines: true,
    })
  );

  for await (const rawRow of parser) {
    rowNumber++;

    // Support the misspelled column in some assessment CSV files.
    if (rawRow.order_amount === undefined && rawRow.order_amout !== undefined) {
      rawRow.order_amount = rawRow.order_amout;
    }

    const result = orderSchema.safeParse(rawRow);

    if (!result.success) {
      invalidRows.push({
        row: rowNumber,
        errors: result.error.issues.map(
          (issue) => `${issue.path.join(".")}: ${issue.message}`
        ),
      });
      continue;
    }

    validOrders.push({
      order_id: result.data.order_id,
      customer_id: result.data.customer_id,
      order_date: result.data.order_date,
      order_amount: result.data.order_amount,
      status: result.data.status,
    });
  }

  return { validOrders, invalidRows };
}
