import type { Request, Response, NextFunction } from "express";
import { unlink, stat } from "node:fs/promises";
import { z } from "zod";

import { processOrdersStream, getOrdersByCustomer, getOrderById } from "./orders.service";
import { storageService } from "../../infrastructure/storage/storage.service";
import type { StorageReference } from "../../infrastructure/storage/storage.types";
import {
  addOrderIngestionJob,
  getOrderJobStatus,
} from "../../infrastructure/queue/order-queue";
import { logger } from "../../utils/logger";

function getSingleParam(param: string | string[] | undefined): string | undefined {
  if (Array.isArray(param)) {
    return param[0];
  }
  return param;
}

export async function uploadOrdersController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.file) {
    res.status(400).json({
      success: false,
      message: "Please upload a CSV or XLSX file using the 'file' field",
    });
    return;
  }

  const filePath = req.file.path;

  try {
    const fileStats = await stat(filePath);
    if (fileStats.size === 0) {
      res.status(400).json({
        success: false,
        message: "Uploaded file is empty",
      });
      return;
    }

    // Store original file via configured storage provider (stub or GCS)
    let storageRef: StorageReference | null = null;
    try {
      storageRef = await storageService.store(
        filePath,
        req.file.originalname,
        req.file.mimetype,
      );
    } catch (storageError) {
      logger.error(
        { err: storageError },
        "Storage provider failed to store original file",
      );
      // If GCS was specifically requested but failed, report actionable error
      if (storageService.getProvider().name === "gcs") {
        throw storageError;
      }
    }

    const result = await processOrdersStream(filePath);

    res.status(200).json({
      success: result.failedBatches === 0,
      message:
        result.failedBatches === 0
          ? "File processing completed"
          : "File processing completed with some failed batches",
      data: {
        storage: storageRef
          ? {
              provider: storageRef.provider,
              objectKey: storageRef.objectKey,
              location: storageRef.location,
              sizeBytes: storageRef.sizeBytes,
              storedAt: storageRef.storedAt,
            }
          : undefined,
        totalRowsProcessed: result.totalRowsProcessed,
        validRows: result.validRows,
        insertedRows: result.insertedRows,
        duplicateRows: result.duplicateRows,
        invalidRows: result.invalidRows,
        failedBatches: result.failedBatches,
        failedRows: result.failedRows,
        errors: result.errors,
        shardDistribution: result.shardDistribution,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (
      err &&
      (err.name === "CSV_RECORD_INCONSISTENT_COLUMNS" ||
        err.message?.includes("Invalid Record Length") ||
        err.message?.includes("Quote") ||
        err.message?.includes("workbook") ||
        err.message?.includes("corrupted") ||
        err.message?.includes("Malformed"))
    ) {
      res.status(400).json({
        success: false,
        message: `Malformed file: ${err.message}`,
      });
      return;
    }

    logger.error({ err: error }, "Order file processing failed");
    next(error);
  } finally {
    try {
      await unlink(filePath);
    } catch (cleanupError) {
      logger.warn(
        { err: cleanupError, filePath },
        "Could not remove temporary upload file",
      );
    }
  }
}

export async function getOrdersByCustomerController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const customerId = getSingleParam(req.params.customerId)?.trim();
  if (!customerId) {
    res.status(400).json({
      success: false,
      message: "Customer ID is required",
    });
    return;
  }

  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  try {
    const { orders, shardId } = await getOrdersByCustomer(customerId, limit, offset);

    res.status(200).json({
      success: true,
      shardId,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    next(error);
  }
}

export async function getOrderByIdController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const orderId = getSingleParam(req.params.orderId)?.trim();
  const uuidValidation = z.string().uuid().safeParse(orderId);

  if (!uuidValidation.success) {
    res.status(400).json({
      success: false,
      message: "order_id must be a valid UUID",
    });
    return;
  }

  try {
    const { order, shardId } = await getOrderById(orderId!);

    if (!order) {
      res.status(404).json({
        success: false,
        message: "Order not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      shardId,
      data: order,
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadOrdersAsyncController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.file) {
    res.status(400).json({
      success: false,
      message: "Please upload a CSV or XLSX file using the 'file' field",
    });
    return;
  }

  const filePath = req.file.path;

  try {
    const fileStats = await stat(filePath);
    if (fileStats.size === 0) {
      res.status(400).json({
        success: false,
        message: "Uploaded file is empty",
      });
      return;
    }

    // Persist the file first via the configured Storage Provider so workers can access it reliably
    const storageRef = await storageService.store(
      filePath,
      req.file.originalname,
      req.file.mimetype,
    );

    const job = await addOrderIngestionJob({
      objectKey: storageRef.objectKey,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
    });

    res.status(202).json({
      success: true,
      message: "Order file accepted for background processing",
      data: {
        jobId: job.id,
        status: "queued",
        originalFilename: req.file.originalname,
        objectKey: storageRef.objectKey,
        storageProvider: storageRef.provider,
        pollUrl: `/api/v1/orders/jobs/${job.id}`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to queue order file for background processing");
    next(error);
  } finally {
    try {
      await unlink(filePath);
    } catch {
      // Temp file cleanup best-effort
    }
  }
}

export async function getOrderJobStatusController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const jobId = getSingleParam(req.params.jobId)?.trim();
  if (!jobId) {
    res.status(400).json({
      success: false,
      message: "jobId parameter is required",
    });
    return;
  }

  try {
    const status = await getOrderJobStatus(jobId);

    if (!status) {
      res.status(404).json({
        success: false,
        message: `Job not found: ${jobId}`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error({ err: error, jobId }, "Failed to retrieve job status");
    next(error);
  }
}

