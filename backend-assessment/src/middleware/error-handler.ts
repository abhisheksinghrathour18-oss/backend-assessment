
import type {
  ErrorRequestHandler,
} from "express";

import { logger } from "../utils/logger";

export const errorHandler: ErrorRequestHandler = (
  err,
  req,
  res,
  _next,
) => {
  const statusCode =
    typeof err.statusCode === "number" &&
    err.statusCode >= 400 &&
    err.statusCode < 600
      ? err.statusCode
      : 500;

  logger.error(
    {
      err,
      method: req.method,
      path: req.originalUrl,
    },
    "Request failed",
  );

  res.status(statusCode).json({
    success: false,
    message:
      statusCode === 500
        ? "Internal server error"
        : err.message || "Request failed",
  });
};
