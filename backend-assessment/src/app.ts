import express from "express";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import helmet from "helmet";

import { swaggerSpec } from "./config/swagger";
import {logger} from "./utils/logger";
import { errorHandler } from "./middleware/error-handler";
import { ordersRouter } from "./modules/orders/orders.routes";
export const app = express();

app.disable("x-powered-by");
app.use(helmet());

app.use(pinoHttp({ logger }));
app.use(express.json({limit: "1mb"}));
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

app.use("/api/v1/orders", ordersRouter);

app.use((req, res )=> {
  res.status(404).json({
  message : "Not Found" ,
success : false,});
});

app.use(errorHandler);