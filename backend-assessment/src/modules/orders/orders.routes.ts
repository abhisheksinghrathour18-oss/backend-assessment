import { Router } from "express";
import { uploadFile } from "../../middleware/upload.middleware";
import {
  uploadOrdersController,
  uploadOrdersAsyncController,
  getOrderJobStatusController,
  getOrdersByCustomerController,
  getOrderByIdController,
} from "./orders.controller";
import { asyncHandler } from "../../utils/async-handler";

export const ordersRouter = Router();

/**
 * @openapi
 * /api/v1/orders/upload:
 *   post:
 *     tags:
 *       - Orders
 *     summary: Upload and process an orders CSV file
 *     description: Ingests, validates, and streams order records across PostgreSQL database shards with batch processing and conflict-safe inserts.
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
 *                 description: CSV file containing orders (order_id, customer_id, order_date, order_amount, status)
 *     responses:
 *       200:
 *         description: CSV processing completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: CSV processing completed
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalRowsProcessed:
 *                       type: integer
 *                       example: 100
 *                     validRows:
 *                       type: integer
 *                       example: 98
 *                     insertedRows:
 *                       type: integer
 *                       example: 98
 *                     duplicateRows:
 *                       type: integer
 *                       example: 0
 *                     invalidRows:
 *                       type: integer
 *                       example: 2
 *                     failedBatches:
 *                       type: integer
 *                       example: 0
 *                     failedRows:
 *                       type: integer
 *                       example: 0
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Missing or invalid file, empty file, or unsupported file type
 *       413:
 *         description: File size exceeds the configured maximum limit
 *       500:
 *         description: Internal server error
 */
ordersRouter.post(
  "/upload",
  uploadFile,
  asyncHandler(uploadOrdersController),
);

/**
 * @openapi
 * /api/v1/orders/upload/async:
 *   post:
 *     tags:
 *       - Orders
 *     summary: Asynchronously upload and process an orders file in the background
 *     description: Stores the uploaded file in configured storage and queues a background worker job via Redis and BullMQ. Returns HTTP 202 Accepted with a job ID for polling.
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
 *         description: File successfully accepted and queued
 *       400:
 *         description: Missing or empty file
 */
ordersRouter.post(
  "/upload/async",
  uploadFile,
  asyncHandler(uploadOrdersAsyncController),
);

/**
 * @openapi
 * /api/v1/orders/jobs/{jobId}:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get background ingestion job status and results
 *     description: Returns the real-time processing status, progress, timestamps, and row statistics for a background job.
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: BullMQ job identifier
 *     responses:
 *       200:
 *         description: Job details and status
 *       404:
 *         description: Job not found
 */
ordersRouter.get(
  "/jobs/:jobId",
  asyncHandler(getOrderJobStatusController),
);

/**
 * @openapi
 * /api/v1/orders/customer/{customerId}:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get orders by customer ID
 *     description: Uses consistent shard routing to query orders for a specific customer from the target database shard.
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique customer identifier
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of orders to return (1-100)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 *       400:
 *         description: Invalid customer ID
 */
ordersRouter.get(
  "/customer/:customerId",
  asyncHandler(getOrdersByCustomerController),
);

/**
 * @openapi
 * /api/v1/orders/{orderId}:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get order by order UUID
 *     description: Queries database shards to locate and return the order details.
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Order UUID
 *     responses:
 *       200:
 *         description: Order details
 *       400:
 *         description: Invalid UUID format
 *       404:
 *         description: Order not found
 */
ordersRouter.get(
  "/:orderId",
  asyncHandler(getOrderByIdController),
);