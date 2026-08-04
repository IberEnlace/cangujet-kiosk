import express, { type NextFunction, type Request, type Response } from "express";
import { noriRouter } from "./routes/noriRoutes";
import { menuRouter } from "./routes/menuRoutes";
import { deviceRouter } from "./routes/deviceRoutes";
import { orderRouter } from "./routes/orderRoutes";
import { paymentWebhookRouter, qrPaymentRouter } from "./routes/qrPaymentRoutes";
import { deviceManagementRouter } from "./routes/deviceManagementRoutes";
import { notificationRouter } from "./routes/notificationRoutes";
import type { DeviceApiError } from "../shared/deviceBootstrap";
import type { NoriChatError } from "./types/noriChat";

export const serverApp = express();
serverApp.disable("x-powered-by");
serverApp.disable("etag");
serverApp.use(express.json({
  limit: "7mb",
  verify: (request, _response, buffer) => {
    if (request.url?.split("?", 1)[0] === "/webhooks/payment") (request as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  },
}));
serverApp.use(paymentWebhookRouter);
serverApp.use("/api/v1", deviceRouter);
serverApp.use("/api/v1", deviceManagementRouter);
serverApp.use("/api/v1", notificationRouter);
serverApp.use("/api/v1", orderRouter);
serverApp.use("/api/v1", qrPaymentRouter);
serverApp.use("/api/nori", noriRouter);
serverApp.use("/api", menuRouter);
serverApp.get("/api/health", (_request, response) => response.json({ status: "ok" }));
serverApp.use((_request: Request, response: Response<NoriChatError>) => response.status(404).json({ error: "Route not found." }));
serverApp.use((error: unknown, request: Request, response: Response<DeviceApiError | NoriChatError>, _next: NextFunction) => {
  if (error instanceof SyntaxError && "body" in error && request.originalUrl.startsWith("/api/v1/")) {
    if (request.originalUrl.includes("/orders") || request.originalUrl.includes("/kitchen")) {
      response.status(400).json({ code: "invalid_order_request", message: "A valid JSON request body is required.", requestId: randomRequestId() } as never);
      return;
    }
    response.status(400).json({ code: "invalid_setup_request", message: "A valid JSON request body is required." });
    return;
  }
  console.error(error);
  response.status(500).json({ error: "Nori service failed to process the request." });
});

function randomRequestId() {
  return crypto.randomUUID();
}
