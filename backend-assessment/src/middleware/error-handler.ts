import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { logger } from "../utils/logger";

export const errorHandler: ErrorRequestHandler = (
  err,
  req,
  res,
  _next,
) => {
  // Handle Multer upload errors
  if (err instanceof multer.MulterError) {
    const statusCode = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "File size exceeds the allowed limit"
        : err.message || "File upload error";

    logger.warn(
      { code: err.code, message: err.message, path: req.originalUrl },
      "Multer upload error",
    );

    res.status(statusCode).json({
      success: false,
      message,
    });
    return;
  }

  const statusCode =
    typeof err.statusCode === "number" &&
    err.statusCode >= 400 &&
    err.statusCode < 600
      ? err.statusCode
      : 500;

  logger.error(
    {
      err: statusCode === 500 ? err : undefined,
      message: err.message,
      statusCode,
      method: req.method,
      path: req.originalUrl,
    },
    "Request error",
  );

  res.status(statusCode).json({
    success: false,
    message:
      statusCode === 500
        ? "Internal server error"
        : err.message || "Request failed",
  });
};
