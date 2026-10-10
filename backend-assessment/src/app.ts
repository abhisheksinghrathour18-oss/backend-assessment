import express from "express";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import helmet from "helmet";

import { swaggerSpec } from "./config/swagger";
import { logger } from "./utils/logger";
import { errorHandler } from "./middleware/error-handler";
import { ordersRouter } from "./modules/orders/orders.routes";
import { uploadFile } from "./middleware/upload.middleware";
import {
  uploadOrdersController,
  uploadOrdersAsyncController,
  getOrderJobStatusController,
} from "./modules/orders/orders.controller";
import { asyncHandler } from "./utils/async-handler";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());

app.use(pinoHttp({ logger }));
app.use(express.json({ limit: "1mb" }));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @openapi
 * /health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Check API health
 *     description: Returns the current service health status.
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 service:
 *                   type: string
 *                   example: backend-assessment
 */
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "backend-assessment",
  });
});

/**
 * @openapi
 * /upload-orders:
 *   post:
 *     tags:
 *       - Orders (Synchronous)
 *     summary: Assessment specification synchronous upload endpoint
 *     description: Ingests and processes order records synchronously across PostgreSQL database shards.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Processing complete
 *       400:
 *         description: Invalid or empty file
 */
app.post(
  "/upload-orders",
  uploadFile,
  asyncHandler(uploadOrdersController),
);

/**
 * @openapi
 * /upload-orders/async:
 *   post:
 *     tags:
 *       - Orders (Asynchronous Queue)
 *     summary: Assessment specification background asynchronous upload
 *     description: Stores the uploaded file and enqueues a background job via BullMQ and Redis. Returns HTTP 202 with job tracking ID.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       202:
 *         description: File queued for background processing
 *       400:
 *         description: Invalid or empty file
 */
app.post(
  "/upload-orders/async",
  uploadFile,
  asyncHandler(uploadOrdersAsyncController),
);

/**
 * @openapi
 * /upload-orders/jobs/{jobId}:
 *   get:
 *     tags:
 *       - Orders (Asynchronous Queue)
 *     summary: Poll background ingestion job status and metrics
 *     description: Returns the real-time processing state (queued, active, completed, failed) and metrics.
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: Job identifier
 *     responses:
 *       200:
 *         description: Job status and results
 *       404:
 *         description: Job not found
 */
app.get(
  "/upload-orders/jobs/:jobId",
  asyncHandler(getOrderJobStatusController),
);

// Standard versioned orders router: /api/v1/orders/*
app.use("/api/v1/orders", ordersRouter);

app.use((_req, res) => {
  res.status(404).json({
    message: "Not Found",
    success: false,
  });
});

app.use(errorHandler);