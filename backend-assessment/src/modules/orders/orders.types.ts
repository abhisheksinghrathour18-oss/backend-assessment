import type { shardId } from "../../infrastructure/database/shard-router";

export interface Order {
  order_id: string;
  customer_id: string;
  order_date: Date;
  order_amount: number;
  status: string;
  created_at: Date;
}

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

export interface ProcessOrdersResult {
  totalRowsProcessed: number;
  validRows: number;
  insertedRows: number;
  duplicateRows: number;
  invalidRows: number;
  failedBatches: number;
  failedRows: number;
  errors: InvalidOrderRow[];
  shardDistribution: Record<shardId, { inserted: number; duplicates: number }>;
}

