import type { ProcessOrdersResult } from "../../modules/orders/orders.types";

export interface OrderIngestionJobData {
  objectKey: string;
  originalFilename: string;
  mimeType: string;
  batchSize?: number;
  uploadedAt: string;
}

export type JobStatusState =
  | "queued"
  | "active"
  | "completed"
  | "failed"
  | "delayed"
  | "unknown";

export interface OrderIngestionJobStatus {
  jobId: string;
  status: JobStatusState;
  progress: number;
  data: OrderIngestionJobData;
  result: ProcessOrdersResult | null;
  failedReason: string | null;
  createdAt: number;
  processedOn: number | null;
  finishedOn: number | null;
}

