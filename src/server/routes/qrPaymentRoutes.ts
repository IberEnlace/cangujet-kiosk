import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { QrPaymentCreateRequest } from "../../shared/orders";
import { QrPaymentFailure, QrPaymentService, createQrPaymentServiceFromEnvironment } from "../services/qrPaymentService";

export function createQrPaymentRouter(factory: () => QrPaymentService = createQrPaymentServiceFromEnvironment) {
  const router = Router();
  let service: QrPaymentService | null = null;
  const resolve = () => service ??= factory();

  router.post("/orders/:orderId/payments/qr", route(async (request, response) => {
    const scope = await resolve().authenticate(bearer(request));
    const session = await resolve().create(scope, param(request.params.orderId), request.body as QrPaymentCreateRequest);
    response.status(session.duplicate ? 200 : 201).json(session);
  }));

  router.get("/orders/:orderId/payments/qr/:sessionId", route(async (request, response) => {
    const scope = await resolve().authenticate(bearer(request));
    const session = await resolve().get(scope, param(request.params.orderId), param(request.params.sessionId));
    if (!session) throw new QrPaymentFailure("order_not_found", 404, "QR payment session not found.");
    response.setHeader("Cache-Control", "no-store");
    response.json(session);
  }));

  router.post("/orders/:orderId/payments/qr/:sessionId/cancel", route(async (request, response) => {
    const scope = await resolve().authenticate(bearer(request));
    response.json(await resolve().cancel(scope, param(request.params.orderId), param(request.params.sessionId)));
  }));

  router.get("/qr-payments/:sessionId", route(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json(await resolve().getMock(param(request.params.sessionId)));
  }));

  router.post("/qr-payments/:sessionId/mock-success", route(async (request, response) => {
    response.json(await resolve().mockSuccess(param(request.params.sessionId)));
  }));

  router.post("/qr-payments/:sessionId/mock-fail", route(async (request, response) => {
    response.json(await resolve().mockFail(param(request.params.sessionId)));
  }));

  router.post("/qr-payments/:sessionId/cancel", route(async (request, response) => {
    response.json(await resolve().mockCancel(param(request.params.sessionId)));
  }));

  return router;
}

export function createPaymentWebhookRouter(factory: () => QrPaymentService = createQrPaymentServiceFromEnvironment) {
  const router = Router();
  let service: QrPaymentService | null = null;
  const resolve = () => service ??= factory();
  router.post("/webhooks/payment", route(async (request, response) => {
    const rawBody = (request as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) throw new QrPaymentFailure("invalid_order_request", 400, "Raw webhook body is unavailable.");
    const session = await resolve().handleWebhook(rawBody, request.header("x-payment-signature"));
    response.json({ received: true, paymentSessionId: session.paymentSessionId, status: session.status });
  }));
  return router;
}

export const qrPaymentRouter = createQrPaymentRouter();
export const paymentWebhookRouter = createPaymentWebhookRouter();

function route(handler: (request: Request, response: Response) => Promise<void>) {
  return async (request: Request, response: Response) => {
    const requestId = request.header("x-request-id") || randomUUID();
    response.setHeader("x-request-id", requestId);
    try { await handler(request, response); }
    catch (caught) {
      const failure = caught instanceof QrPaymentFailure
        ? caught
        : new QrPaymentFailure("server_error", 500, "The QR payment service could not complete the request.");
      if (failure.status >= 500) console.error("[cangujet QR payment]", { requestId, path: request.originalUrl, code: failure.code, error: caught });
      if (!response.headersSent) response.status(failure.status).json({ code: failure.code, message: failure.message, requestId });
    }
  };
}

function bearer(request: Request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.header("authorization")?.trim() ?? "");
  if (!match) throw new QrPaymentFailure("unauthorized", 401, "Authentication is required.");
  return match[1];
}

function param(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
