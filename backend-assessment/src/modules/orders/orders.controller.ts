
import type { Request, Response, NextFunction } from "express";
import { unlink } from "node:fs/promises";

import { parseOrdersCsv } from "./orders.parser";
import { processOrders } from "./orders.service";
import { logger } from "../../utils/logger";

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
    const { validOrders, invalidRows } =
      await parseOrdersCsv(filePath);

    const result = await processOrders(
      validOrders,
      invalidRows.length,
    );

    res.status(200).json({
      success: result.failedBatches === 0,
      message:
        result.failedBatches === 0
          ? "CSV processing completed"
          : "CSV processing completed with some failed batches",
      data: {
        totalRowsProcessed:
          result.totalValidRows + result.invalidRows,
        validRows: result.totalValidRows,
        insertedRows: result.insertedRows,
        duplicateRows: result.duplicateRows,
        invalidRows: result.invalidRows,
        failedBatches: result.failedBatches,
        errors: invalidRows.slice(0, 100),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "CSV order processing failed");
    next(error);
  } finally {
    try {
      await unlink(filePath);
    } catch (error) {
      logger.warn(
        { err: error, filePath },
        "Could not remove temporary upload file",
      );
    }
  }
}
