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
  let service: OrderDomainService | null = null;
  const resolve = () => service ??= serviceFactory();

  router.post("/orders/quote", asyncRoute(async (request, response, requestId) => {
    const actor = await resolve().authenticate(readBearerToken(request));
    diagnostic("order_quote_requested", requestId, actor);
    response.json(await resolve().quote(actor, request.body as OrderQuoteRequest));
  }));

  router.post("/orders", asyncRoute(async (request, response, requestId) => {
    const actor = await resolve().authenticate(readBearerToken(request));
    const result = await resolve().create(actor, request.body as OrderCreateRequest);
    diagnostic(result.duplicate ? "duplicate_idempotent_request" : "order_created", requestId, actor, result.order.id);
    response.status(result.duplicate ? 200 : 201).json(result.order);
  }));

  router.get("/orders/active", asyncRoute(async (request, response) => {
    const actor = await resolve().authenticate(readBearerToken(request));
    response.json(await resolve().active(actor, "cashier"));
  }));

  router.get("/orders/display", asyncRoute(async (request, response) => {
    const actor = await resolve().authenticate(readBearerToken(request));
    response.json(await resolve().display(actor));
  }));

  router.get("/kitchen/orders", asyncRoute(async (request, response, requestId) => {
    const actor = await resolve().authenticate(readBearerToken(request));
    const orders = await resolve().active(actor, "kitchen");
    diagnostic("kitchen_reconciliation", requestId, actor, undefined, "ok");
    response.json(orders);
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
    diagnostic("payment_initiated", requestId, actor, orderId);
    const result = await resolve().pay(actor, orderId, request.body as OrderPaymentRequest);
    diagnostic(result.duplicate ? "duplicate_idempotent_request" : result.paymentStatus === "captured" ? "payment_captured" : "payment_initiated", requestId, actor, result.order.id);
    response.status(result.duplicate ? 200 : 201).json(result);
  }));

  router.post("/orders/:orderId/submit", asyncRoute(async (request, response, requestId) => {
    const actor = await resolve().authenticate(readBearerToken(request));
    const expectedVersion = integer(request.body?.expectedVersion);
    const order = await resolve().submit(actor, routeParam(request.params.orderId), expectedVersion);
    diagnostic("order_submitted", requestId, actor, order.id);
    response.json(order);
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
      if (failure.code === "invalid_order_transition" || failure.code === "order_conflict") {
        const actor = safeActor(request);
        diagnostic("transition_rejected", requestId, actor, routeParam(request.params.orderId), failure.code);
      }
      response.status(failure.status).json(failure.toJSON(requestId));
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

function diagnostic(
  event: string,
  requestId: string,
  actor: { actorType: string; actorId: string; restaurantId: string; branchId: string; deviceId: string | null },
  orderId?: string,
  resultCode = "ok",
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
  });
}

function safeActor(_request: Request) {
  return { actorType: "unknown", actorId: "unknown", restaurantId: "unknown", branchId: "unknown", deviceId: null };
}

function logInternalOrderError(
  requestId: string,
  request: Request,
  failure: OrderDomainFailure,
) {
  const chain = errorChain(failure);
  const repositoryError = chain.find(
    (value): value is OrderRepositoryOperationError => value instanceof OrderRepositoryOperationError,
  );
  const raw = repositoryError?.supabaseError ?? errorRecord(chain[chain.length - 1]);
  const diagnostic = {
    event: "internal_order_error",
    requestId,
    method: request.method,
    path: request.originalUrl || request.url,
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
  console.error("[MORROW order internal error]", diagnostic, chain[chain.length - 1]);
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
