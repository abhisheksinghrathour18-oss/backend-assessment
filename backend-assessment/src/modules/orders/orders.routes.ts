import { Router } from "express";
import {uploadCsv} from "../../middleware/upload.middleware";
import { uploadOrdersController } from "./orders.controller";

export const ordersRouter = Router();
/**
 * @openapi
 * /api/v1/orders/upload:
 *   post:
 *     tags:
 *       - Orders
 *     summary: Upload an orders CSV file
 *     description: Accepts a CSV file for order ingestion. Processing will be enabled in the next implementation step.
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
 *       400:
 *         description: Missing or invalid upload
 *       501:
 *         description: Order processing is not implemented yet
 */
ordersRouter.post(
  "/upload",
  uploadCsv,
  uploadOrdersController,
);