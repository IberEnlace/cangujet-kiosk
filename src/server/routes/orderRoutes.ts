import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type {
  OrderApiError,
  OrderCreateRequest,
  OrderPaymentRequest,
  OrderQuoteRequest,
  OrderTransitionRequest,
  ProductionOrderStatus,
} from "../../shared/orders";
import {
  createSupabaseOrderRepositoryFromEnvironment,
  type OrderActor,
  OrderRepositoryOperationError,
} from "../repositories/orderRepository";
import {
  OrderDomainFailure,
  OrderDomainService,
} from "../services/orderDomainService";
import { createDeviceIdentityServiceFromEnvironment } from "./deviceRoutes";

export function createOrderRouter(
  serviceFactory: () => OrderDomainService = createOrderServiceFromEnvironment,
) {
  const router = Router();
  router.use((_request, response, next) => {
    try { response.app?.disable?.("etag"); } catch { /* noop */ }
    next();
  });
  let service: OrderDomainService | null = null;
  const resolve = () => service ??= serviceFactory();

  router.post("/orders/quote", asyncRoute(async (request, response, requestId) => {
    let actor: OrderActor | undefined;
    try {
      actor = await resolve().authenticate(readBearerToken(request));
      const workflowAttemptId = sanitizeHeader(request.header("x-workflow-attempt-id"));
      diagnostic("order_quote_requested", requestId, actor, undefined, "ok", { workflowAttemptId });
      const result = await resolve().quote(actor, request.body as OrderQuoteRequest);
      response.json(result);
    } catch (error) {
      if (error instanceof OrderDomainFailure) throw error;
      throw new OrderDomainFailure(
        "order_quote_failed",
        500,
        "The order service could not calculate the order quote.",
        undefined,
        undefined,
        process.env.NODE_ENV !== "production"
          ? { details: String(error instanceof Error ? error.stack || error.message : error) }
          : undefined,
        error,
      );
    }
  }));

  router.post("/orders", asyncRoute(async (request, response, requestId) => {
    console.info("[SERVER ROUTE ENTRY POST /orders]", { idempotencyKey: (request.body as any)?.idempotencyKey, path: request.originalUrl });
    const actor = await resolve().authenticate(readBearerToken(request));
    const workflowAttemptId = sanitizeHeader(request.header("x-workflow-attempt-id"));
    const body = request.body as OrderCreateRequest;
    const result = await resolve().create(actor, body);
    diagnostic(
      result.duplicate ? "duplicate_idempotent_request" : "order_created",
      requestId,
      actor,
      result.order.id,
      "ok",
      {
        workflowAttemptId,
        operation: "create_order",
        idempotencyKey: body.idempotencyKey,
        reusedKey: result.duplicate,
      },
    );
    response.status(result.duplicate ? 200 : 201).json(result.order);
  }));

  router.get("/orders/active", asyncRoute(async (request, response) => {
    const actor = await resolve().authenticate(readBearerToken(request));
    response.json(await resolve().active(actor, "cashier"));
  }));

  router.get("/cashier/pending-orders", asyncRoute(async (request, response) => {
    const actor = await resolve().authenticate(readBearerToken(request));
    response.setHeader("Cache-Control", "no-store");
    response.json(await resolve().pendingCashierOrders(actor));
  }));

  router.get("/orders/display", asyncRoute(async (request, response) => {
    const actor = await resolve().authenticate(readBearerToken(request));
    const orders = await resolve().display(actor);
    response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    response.setHeader("Pragma", "no-cache");
    response.removeHeader("ETag");
    response.json(orders);
  }));

  router.get("/kitchen/orders", asyncRoute(async (request, response, requestId) => {
    const actor = await resolve().authenticate(readBearerToken(request));
    const orders = await resolve().active(actor, "kitchen");
    diagnostic("kitchen_reconciliation", requestId, actor, undefined, "ok");
    response.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
    response.setHeader("Surrogate-Control", "no-store");
    response.removeHeader("ETag");
    response.setHeader("Last-Modified", new Date().toUTCString());

    console.info("kitchen_orders_response", {
      restaurantId: actor.restaurantId,
      branchId: actor.branchId,
      orderCount: orders.length,
      firstOrderId: orders[0]?.id ?? null,
      firstOrderStatus: orders[0]?.status ?? null,
      firstOrderPaymentStatus: orders[0]?.paymentStatus ?? null,
      actorRole: actor.role,
      actorDeviceType: actor.deviceType ?? null,
    });

    response.status(200).json(orders);
  }));

  router.get("/kitchen/orders/:orderId", asyncRoute(async (request, response) => {
    const actor = await resolve().authenticate(readBearerToken(request));
    if (!["kitchen", "admin"].includes(actor.role)) throw new OrderDomainFailure("unauthorized", 403, "Kitchen access is required.");
    response.json(await resolve().get(actor, routeParam(request.params.orderId)));
  }));

  router.get("/orders/tracking/:customerReference", asyncRoute(async (request, response) => {
    response.json(await resolve().tracking(routeParam(request.params.customerReference)));
  }));

  router.get("/orders/:orderId", asyncRoute(async (request, response) => {
    const actor = await resolve().authenticate(readBearerToken(request));
    response.json(await resolve().get(actor, routeParam(request.params.orderId)));
  }));

  router.post("/orders/:orderId/payments", asyncRoute(async (request, response, requestId) => {
    const actor = await resolve().authenticate(readBearerToken(request));
    const orderId = routeParam(request.params.orderId);
    const body = request.body as OrderPaymentRequest;
    diagnostic("payment_capture_requested", requestId, actor, orderId);
    try {
      const result = await resolve().pay(actor, orderId, body);
      if (body.method !== "pay_at_cashier" && (result.paymentStatus !== "captured" || result.order.status !== "paid")) {
        throw new OrderDomainFailure("payment_failed", 422, "Payment capture could not be confirmed.");
      }
      if (result.order.status === "paid") {
        diagnostic("order_paid", requestId, actor, result.order.id);
      }
      diagnostic(
        result.duplicate ? "duplicate_idempotent_request" : "payment_captured",
        requestId,
        actor,
        result.order.id,
      );
      response.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      diagnostic(
        "payment_capture_failed",
        requestId,
        actor,
        orderId,
        error instanceof OrderDomainFailure ? error.code : "server_error",
      );
      throw error;
    }
  }));

  router.post("/orders/:orderId/submit", asyncRoute(async (request, response, requestId) => {
    const actor = await resolve().authenticate(readBearerToken(request));
    const orderId = routeParam(request.params.orderId);
    const expectedVersion = integer(request.body?.expectedVersion);
    diagnostic("order_submit_requested", requestId, actor, orderId);
    try {
      const order = await resolve().submit(actor, orderId, expectedVersion);
      diagnostic("order_submitted", requestId, actor, order.id);
      response.json(order);
    } catch (error) {
      diagnostic(
        "order_submit_failed",
        requestId,
        actor,
        orderId,
        error instanceof OrderDomainFailure ? error.code : "server_error",
      );
      throw error;
    }
  }));

  router.post("/orders/:orderId/status", asyncRoute(async (request, response, requestId) => {
    const actor = await resolve().authenticate(readBearerToken(request));
    const body = request.body as Partial<OrderTransitionRequest>;
    const order = await resolve().transition(
      actor,
      routeParam(request.params.orderId),
      String(body.nextStatus) as ProductionOrderStatus,
      integer(body.expectedVersion),
      typeof body.reason === "string" ? body.reason : null,
    );
    diagnostic("status_transition", requestId, actor, order.id, "ok");
    response.json(order);
  }));

  router.post("/orders/:orderId/cancel", asyncRoute(async (request, response, requestId) => {
    const actor = await resolve().authenticate(readBearerToken(request));
    const order = await resolve().cancel(
      actor,
      routeParam(request.params.orderId),
      integer(request.body?.expectedVersion),
      typeof request.body?.reason === "string" ? request.body.reason : "",
    );
    diagnostic("order_cancelled", requestId, actor, order.id);
    response.json(order);
  }));

  return router;
}

export const orderRouter = createOrderRouter();

function createOrderServiceFromEnvironment() {
  const repository = createSupabaseOrderRepositoryFromEnvironment();
  return new OrderDomainService(repository, createDeviceIdentityServiceFromEnvironment());
}

function asyncRoute(
  handler: (request: Request, response: Response, requestId: string) => Promise<void>,
) {
  return async (request: Request, response: Response<OrderApiError | unknown>) => {
    const requestId = validRequestId(request.header("x-request-id")) ?? randomUUID();
    response.setHeader("x-request-id", requestId);
    try {
      await handler(request, response, requestId);
    } catch (error) {
      const failure = error instanceof OrderDomainFailure
        ? error
        : new OrderDomainFailure(
          "server_error",
          500,
          "The order service could not complete the request.",
          undefined,
          undefined,
          undefined,
          error,
        );
      if (failure.status >= 500) logInternalOrderError(requestId, request, failure);
      if (
        failure.code === "invalid_order_transition"
        || failure.code === "order_conflict"
        || failure.code === "idempotency_conflict"
      ) {
        const actor = safeActor(request);
        diagnostic(
          failure.code === "idempotency_conflict" ? "idempotency_conflict" : "transition_rejected",
          requestId,
          actor,
          routeParam(request.params.orderId),
          failure.code,
          failure.details,
        );
      }
      // Guard against writing to a socket that was already closed (e.g., Vite
      // proxy ECONNRESET). Without this check, calling response.json() on a
      // finished socket throws, which would become an unhandled rejection and
      // crash or silently swallow the error in Node.js.
      if (!response.headersSent) {
        try {
          const body = failure.toJSON(requestId) as OrderApiError;
          // Promote existingOrderId from details so the client can read it
          // without having to parse the opaque `details` field.
          const existingOrderId = typeof failure.details?.existingOrderId === "string"
            ? failure.details.existingOrderId
            : undefined;
          response.status(failure.status).json({ ...body, ...(existingOrderId ? { existingOrderId } : {}) });
        } catch (sendError) {
          console.error("[MORROW order] Failed to send error response after socket closed", { requestId, sendError });
        }
      }
    }
  };
}

function readBearerToken(request: Request) {
  const authorization = request.header("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) throw new OrderDomainFailure("unauthorized", 401, "Authentication is required.");
  return match[1];
}

function integer(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new OrderDomainFailure("invalid_order_request", 400, "A valid expected order version is required.");
  }
  return Number(value);
}

function validRequestId(value: string | undefined) {
  return value && /^[A-Za-z0-9_-]{8,100}$/.test(value) ? value : null;
}

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

/** Returns a safe, log-friendly copy of a request header or undefined. */
function sanitizeHeader(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // Allow UUIDs, alphanumeric, hyphens, underscores — reject anything else.
  return /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : undefined;
}

function diagnostic(
  event: string,
  requestId: string,
  actor: { actorType: string; actorId: string; restaurantId: string; branchId: string; deviceId: string | null },
  orderId?: string,
  resultCode = "ok",
  extra?: Record<string, unknown>,
) {
  console.info("[MORROW order]", {
    event,
    requestId,
    orderId,
    restaurantId: actor.restaurantId,
    branchId: actor.branchId,
    deviceId: actor.deviceId,
    actorType: actor.actorType,
    actorId: actor.actorId,
    resultCode,
    ...extra,
  });
}

function safeActor(_request: Request) {
  return { actorType: "unknown", actorId: "unknown", restaurantId: "unknown", branchId: "unknown", deviceId: null };
}

function logInternalOrderError(
  requestId: string,
  request: Request,
  failure: OrderDomainFailure,
  actor?: { actorType: string; actorId: string; restaurantId: string; branchId: string; deviceId: string | null },
) {
  const chain = errorChain(failure);
  const repositoryError = chain.find(
    (value): value is OrderRepositoryOperationError => value instanceof OrderRepositoryOperationError,
  );
  const raw = repositoryError?.supabaseError ?? errorRecord(chain[chain.length - 1]);
  const diagnosticData = {
    event: "internal_order_error",
    requestId,
    restaurantId: actor?.restaurantId ?? "unknown",
    branchId: actor?.branchId ?? "unknown",
    deviceId: actor?.deviceId ?? null,
    actorType: actor?.actorType ?? "unknown",
    actorId: actor?.actorId ?? "unknown",
    method: request.method,
    path: request.originalUrl || request.url,
    errorName: failure.name,
    errorMessage: failure.message,
    stack: chain.map(value => value instanceof Error ? value.stack ?? null : null),
    exceptionChain: chain.map(value => ({
      constructor: value && typeof value === "object" ? value.constructor?.name ?? null : typeof value,
      name: value instanceof Error ? value.name : null,
      message: value instanceof Error ? value.message : errorRecord(value).message ?? String(value),
    })),
    supabaseError: repositoryError?.supabaseError ?? null,
    postgresqlErrorCode: textField(raw, "code"),
    sqlMessage: textField(raw, "message"),
    sqlDetail: textField(raw, "details") ?? textField(raw, "detail"),
    sqlHint: textField(raw, "hint"),
    constraint: textField(raw, "constraint"),
    table: textField(raw, "table"),
    column: textField(raw, "column"),
    function: textField(raw, "function") ?? repositoryError?.rpcName ?? null,
    rpcName: repositoryError?.rpcName ?? null,
    operation: repositoryError?.operation ?? null,
    failingQuery: repositoryError?.query ?? null,
  };
  console.error("[MORROW order internal error]", diagnosticData, chain[chain.length - 1]);
}

function errorChain(error: unknown) {
  const values: unknown[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current);
    values.push(current);
    if (current instanceof OrderDomainFailure && current.internalCause !== undefined) {
      current = current.internalCause;
      continue;
    }
    const cause = errorRecord(current).cause;
    if (cause === undefined) break;
    current = cause;
  }
  return values;
}

function errorRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function textField(value: unknown, key: string) {
  const record = errorRecord(value);
  return typeof record[key] === "string" && record[key] ? record[key] as string : null;
}
