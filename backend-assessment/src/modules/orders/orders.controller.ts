import type { Request, Response, NextFunction } from "express";
import { unlink, stat } from "node:fs/promises";
import { z } from "zod";

import { processOrdersStream, getOrdersByCustomer, getOrderById } from "./orders.service";
import { storageService } from "../../infrastructure/gcs/storage.service";
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
      message: "Please upload a CSV file using the 'file' field",
    });
    return;
  }

  const filePath = req.file.path;

  try {
    const fileStats = await stat(filePath);
    if (fileStats.size === 0) {
      res.status(400).json({
        success: false,
        message: "Uploaded CSV file is empty",
      });
      return;
    }

    let gcsUri: string | null = null;
    if (storageService.isConfigured()) {
      try {
        const destination = `orders/${Date.now()}-${req.file.originalname}`;
        gcsUri = await storageService.uploadFile(filePath, destination);
      } catch (gcsError) {
        logger.warn({ err: gcsError }, "GCS archive upload failed, proceeding with DB ingestion");
      }
    }

    const result = await processOrdersStream(filePath);

    res.status(200).json({
      success: result.failedBatches === 0,
      message:
        result.failedBatches === 0
          ? "CSV processing completed"
          : "CSV processing completed with some failed batches",
      data: {
        totalRowsProcessed: result.totalRowsProcessed,
        validRows: result.validRows,
        insertedRows: result.insertedRows,
        duplicateRows: result.duplicateRows,
        invalidRows: result.invalidRows,
        failedBatches: result.failedBatches,
        failedRows: result.failedRows,
        errors: result.errors,
        shardDistribution: result.shardDistribution,
        ...(gcsUri ? { gcsUri } : {}),
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (
      err &&
      (err.name === "CSV_RECORD_INCONSISTENT_COLUMNS" ||
        err.message?.includes("Invalid Record Length") ||
        err.message?.includes("Quote"))
    ) {
      res.status(400).json({
        success: false,
        message: `Malformed CSV file: ${err.message}`,
      });
      return;
    }

    logger.error({ err: error }, "CSV order processing failed");
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
