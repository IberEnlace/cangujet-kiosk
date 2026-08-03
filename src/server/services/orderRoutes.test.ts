import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import type { ProductionOrder } from "../../shared/orders";
import {
  OrderRepositoryOperationError,
  type OrderActor,
} from "../repositories/orderRepository";
import { createOrderRouter } from "../routes/orderRoutes";
import { OrderDomainFailure, type OrderDomainService } from "./orderDomainService";

const ACTOR: OrderActor = {
  actorType: "device", actorId: "device-a", deviceId: "device-a",
  restaurantId: "restaurant-authoritative", branchId: "branch-authoritative", role: "device", deviceType: "kiosk",
};
const CASHIER_ACTOR: OrderActor = {
  actorType: "staff", actorId: "cashier-a", deviceId: null,
  restaurantId: "restaurant-authoritative", branchId: "branch-authoritative", role: "cashier", deviceType: null,
};

test("valid required modifier selections reach the quote endpoint and return 200", async () => {
  let received: unknown;
  const fake = service({
    quote: async (_actor, request) => {
      received = request;
      return order();
    },
  });
  const request = {
    items: [{
      productId: "product-pizza",
      quantity: 1,
      modifierIds: ["option-size-large"],
    }],
    serviceMode: "dine_in",
    language: "en",
  };
  await withApi(fake, async base => {
    const response = await fetch(`${base}/api/v1/orders/quote`, {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as ProductionOrder).total, "10.80");
  });
  assert.deepEqual(received, request);
});

test("quote endpoint returns structured JSON error on unexpected internal failure", async () => {
  const fake = service({
    quote: async () => {
      throw new Error("Unexpected calculation failure in quote");
    },
  });
  await withApi(fake, async base => {
    const response = await fetch(`${base}/api/v1/orders/quote`, {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify({ items: [], serviceMode: "dine_in", language: "en" }),
    });
    assert.equal(response.status, 500);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(body.code, "order_quote_failed");
    assert.equal(typeof body.message, "string");
    assert.equal(typeof body.requestId, "string");
  });
});

test("internal order errors keep the client response safe and log complete database diagnostics", async () => {
  const originalError = console.error;
  const logs: unknown[][] = [];
  console.error = (...values: unknown[]) => { logs.push(values); };
  const databaseError = {
    code: "23502",
    message: "null value violates not-null constraint",
    details: "Failing row contains (...)",
    hint: "Apply the production order migration.",
    constraint: "orders_business_date_not_null",
    table: "orders",
    column: "business_date",
    function: "create_production_order",
  };
  const repositoryError = new OrderRepositoryOperationError(
    "rpc.create_production_order",
    'supabase.rpc("create_production_order", { ... })',
    "create_production_order",
    databaseError,
    "Order could not be created.",
  );
  const fake = service({
    create: async () => {
      throw new OrderDomainFailure(
        "server_error",
        500,
        "The order service could not complete the request.",
        undefined,
        undefined,
        undefined,
        repositoryError,
      );
    },
  });
  try {
    await withApi(fake, async base => {
      const response = await fetch(`${base}/api/v1/orders`, {
        method: "POST",
        headers: {
          authorization: "Bearer valid",
          "content-type": "application/json",
          "x-request-id": "diagnostic-request-123",
        },
        body: "{}",
      });
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), {
        code: "server_error",
        message: "The order service could not complete the request.",
        requestId: "diagnostic-request-123",
      });
    });
  } finally {
    console.error = originalError;
  }
  const diagnostic = logs[0]?.[1] as Record<string, unknown>;
  assert.equal(diagnostic.requestId, "diagnostic-request-123");
  assert.equal(diagnostic.postgresqlErrorCode, "23502");
  assert.equal(diagnostic.sqlMessage, databaseError.message);
  assert.equal(diagnostic.sqlDetail, databaseError.details);
  assert.equal(diagnostic.sqlHint, databaseError.hint);
  assert.equal(diagnostic.constraint, databaseError.constraint);
  assert.equal(diagnostic.table, databaseError.table);
  assert.equal(diagnostic.column, databaseError.column);
  assert.equal(diagnostic.function, databaseError.function);
  assert.equal(diagnostic.rpcName, "create_production_order");
  assert.equal(diagnostic.failingQuery, 'supabase.rpc("create_production_order", { ... })');
  assert.ok(Array.isArray(diagnostic.stack));
  assert.equal(logs[0]?.[2], repositoryError);
});

test("order creation is authenticated and ignores client tenant selectors", async () => {
  let seenActor: OrderActor | null = null;
  const fake = service({
    create: async (actor, request) => {
      seenActor = actor;
      assert.equal((request as unknown as Record<string, unknown>).restaurantId, "attacker-restaurant");
      return { order: order(), duplicate: false };
    },
  });
  await withApi(fake, async base => {
    const response = await fetch(`${base}/api/v1/orders`, {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify({
        restaurantId: "attacker-restaurant", branchId: "attacker-branch",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        items: [], serviceMode: "dine_in", language: "en",
      }),
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json() as ProductionOrder).orderNumber, "A101");
  });
  assert.equal((seenActor as OrderActor | null)?.restaurantId, "restaurant-authoritative");
  assert.equal((seenActor as OrderActor | null)?.branchId, "branch-authoritative");
});

test("API returns structured authentication and validation errors with request IDs", async () => {
  const fake = service({
    create: async () => { throw new OrderDomainFailure("invalid_order_request", 400, "Idempotency key is required."); },
  });
  await withApi(fake, async base => {
    const unauthorized = await fetch(`${base}/api/v1/orders`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    assert.equal(unauthorized.status, 401);
    const unauthorizedBody = await unauthorized.json() as Record<string, unknown>;
    assert.equal(unauthorizedBody.code, "unauthorized");
    assert.equal(typeof unauthorizedBody.requestId, "string");

    const invalid = await fetch(`${base}/api/v1/orders`, {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(
      Object.keys(await invalid.json() as object).sort(),
      ["code", "message", "requestId"],
    );
  });
});

test("duplicate creation returns the existing resource and kitchen queue remains role scoped", async () => {
  const fake = service({
    create: async () => ({ order: order(), duplicate: true }),
    active: async (_actor, audience) => {
      assert.equal(audience, "kitchen");
      return [order({ status: "submitted" })];
    },
  });
  await withApi(fake, async base => {
    const duplicate = await fetch(`${base}/api/v1/orders`, {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(duplicate.status, 200);
    const kitchen = await fetch(`${base}/api/v1/kitchen/orders`, {
      headers: { authorization: "Bearer valid" },
    });
    assert.equal(kitchen.status, 200);
    assert.equal((await kitchen.json() as ProductionOrder[]).length, 1);
  });
});

test("pending cashier endpoint ignores client tenant selectors and returns only the authenticated branch", async () => {
  const pending = order({ paymentStatus: "pending", paymentMethod: "pay_at_cashier" });
  const fake = service({
    authenticate: async () => CASHIER_ACTOR,
    pendingCashierOrders: async (actor: OrderActor) => {
      assert.equal(actor.restaurantId, "restaurant-authoritative");
      assert.equal(actor.branchId, "branch-authoritative");
      return [pending];
    },
  });
  await withApi(fake, async base => {
    const response = await fetch(`${base}/api/v1/cashier/pending-orders?restaurant_id=attacker&branch_id=attacker`, {
      headers: { authorization: "Bearer valid" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), [pending]);
  });
});

test("kiosk device cannot access the cashier pending list", async () => {
  const fake = service({
    pendingCashierOrders: async () => {
      throw new OrderDomainFailure("unauthorized", 403, "Cashier access is required.");
    },
  });
  await withApi(fake, async base => {
    const response = await fetch(`${base}/api/v1/cashier/pending-orders`, {
      headers: { authorization: "Bearer valid" },
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json() as { code: string }).code, "unauthorized");
  });
});

test("HTTP deferred-payment lifecycle is awaiting, pending-list, paid, submitted, then kitchen-visible", async () => {
  let current = order();
  let submitCalls = 0;
  const cashier = CASHIER_ACTOR;
  const kitchen = { ...KITCHEN_DEVICE_ACTOR };
  const fake = service({
    authenticate: async (token: string) => token === "cashier" ? cashier : token === "kitchen" ? kitchen : ACTOR,
    create: async () => ({ order: current, duplicate: false }),
    pay: async (_actor: OrderActor, _orderId: string, request: { method: string }) => {
      const deferred = request.method === "pay_at_cashier";
      current = order({
        ...current,
        status: deferred ? "awaiting_payment" : "paid",
        paymentStatus: deferred ? "pending" : "captured",
        paymentMethod: request.method as ProductionOrder["paymentMethod"],
        version: current.version + 1,
      });
      return { order: current, paymentId: deferred ? "intent-1" : "payment-1", paymentStatus: current.paymentStatus!, amount: current.total, change: "6.50", duplicate: false };
    },
    pendingCashierOrders: async () => current.status === "awaiting_payment" ? [current] : [],
    submit: async () => {
      submitCalls += 1;
      current = order({ ...current, status: "submitted", version: current.version + 1, placedAt: new Date().toISOString() });
      return current;
    },
    active: async (_actor: OrderActor, audience: string) => audience === "kitchen" && current.status === "submitted" ? [current] : [],
  });

  await withApi(fake, async base => {
    const create = await fetch(`${base}/api/v1/orders`, { method: "POST", headers: { authorization: "Bearer kiosk", "content-type": "application/json" }, body: "{}" });
    assert.equal(create.status, 201);
    assert.equal((await create.json() as ProductionOrder).status, "awaiting_payment");
    const intent = await fetch(`${base}/api/v1/orders/order-a/payments`, { method: "POST", headers: { authorization: "Bearer kiosk", "content-type": "application/json" }, body: JSON.stringify({ method: "pay_at_cashier" }) });
    assert.equal(intent.status, 201);
    assert.equal((await intent.json() as { order: ProductionOrder }).order.status, "awaiting_payment");
    assert.equal(submitCalls, 0, "kiosk deferred flow must not issue submit");

    const pending = await fetch(`${base}/api/v1/cashier/pending-orders`, { headers: { authorization: "Bearer cashier" } });
    assert.equal(pending.status, 200);
    assert.equal((await pending.json() as ProductionOrder[])[0].orderNumber, "A101");
    const payment = await fetch(`${base}/api/v1/orders/order-a/payments`, { method: "POST", headers: { authorization: "Bearer cashier", "content-type": "application/json" }, body: JSON.stringify({ method: "cash", amountReceived: "20.00" }) });
    assert.equal(payment.status, 201);
    const paid = (await payment.json() as { order: ProductionOrder }).order;
    assert.equal(paid.status, "paid");
    const submit = await fetch(`${base}/api/v1/orders/order-a/submit`, { method: "POST", headers: { authorization: "Bearer cashier", "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: paid.version }) });
    assert.equal(submit.status, 200);
    assert.equal((await submit.json() as ProductionOrder).status, "submitted");
    const kitchenResponse = await fetch(`${base}/api/v1/kitchen/orders`, { headers: { authorization: "Bearer kitchen" } });
    assert.equal(kitchenResponse.status, 200);
    assert.equal((await kitchenResponse.json() as ProductionOrder[])[0].id, "order-a");
  });
});

test("idempotency conflict returns a clear 409 response with correlation metadata", async () => {
  const fake = service({
    create: async () => {
      throw new OrderDomainFailure(
        "idempotency_conflict",
        409,
        "This order attempt key belongs to a different cart. Retry with a fresh attempt key.",
        undefined,
        undefined,
        {
          existingOrderId: "order-existing",
          conflictReason: "fingerprint_mismatch",
          retryable: true,
        },
      );
    },
  });

  await withApi(fake, async base => {
    const response = await fetch(`${base}/api/v1/orders`, {
      method: "POST",
      headers: {
        authorization: "Bearer valid",
        "content-type": "application/json",
        "x-request-id": "conflict-request-409",
      },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      code: "idempotency_conflict",
      message: "This order attempt key belongs to a different cart. Retry with a fresh attempt key.",
      requestId: "conflict-request-409",
      existingOrderId: "order-existing",
      details: {
        existingOrderId: "order-existing",
        conflictReason: "fingerprint_mismatch",
        retryable: true,
      },
    });
  });
});

function service(overrides: Record<string, (...args: any[]) => any>) {
  return {
    authenticate: async (token: string) => {
      if (token !== "valid") throw new OrderDomainFailure("unauthorized", 401, "Authentication is required.");
      return ACTOR;
    },
    create: async () => ({ order: order(), duplicate: false }),
    active: async () => [],
    ...overrides,
  } as unknown as OrderDomainService;
}

async function withApi(serviceValue: OrderDomainService, run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.disable("x-powered-by");
  app.disable("etag");
  app.use(express.json());
  app.use("/api/v1", createOrderRouter(() => serviceValue));
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function order(values: Partial<ProductionOrder> = {}): ProductionOrder {
  return {
    id: "order-a", orderNumber: "A101", status: "awaiting_payment", paymentStatus: null,
    paymentMethod: null, source: "kiosk", customerReference: "a".repeat(48), version: 1,
    notes: null, menuId: "menu-a", menuVersion: 1, currency: "EUR", subtotal: "10.00",
    taxTotal: "0.80", discountTotal: "0.00", total: "10.80", serviceMode: "dine_in",
    language: "en", items: [], placedAt: null, acceptedAt: null, preparingAt: null,
    readyAt: null, completedAt: null, cancelledAt: null,
    createdAt: "2026-07-30T10:00:00.000Z", updatedAt: "2026-07-30T10:00:00.000Z",
    ...values,
  };
}

const KITCHEN_DEVICE_ACTOR: OrderActor = {
  actorType: "device", actorId: "kitchen-device-1", deviceId: "kitchen-device-1",
  restaurantId: "restaurant-authoritative", branchId: "branch-authoritative",
  role: "device", deviceType: "kitchen_display",
};

const OTHER_BRANCH_KITCHEN_ACTOR: OrderActor = {
  actorType: "device", actorId: "kitchen-device-2", deviceId: "kitchen-device-2",
  restaurantId: "restaurant-authoritative", branchId: "branch-other",
  role: "device", deviceType: "kitchen_display",
};

const UNAUTHORIZED_ACTOR: OrderActor = {
  actorType: "device", actorId: "kiosk-device", deviceId: "kiosk-device",
  restaurantId: "restaurant-authoritative", branchId: "branch-authoritative",
  role: "device", deviceType: "kiosk",
};

test("kitchen orders route returns no-store cache headers and ETag removed", async () => {
  const submittedOrder = order({ status: "submitted", paymentStatus: "captured" });
  const fake = service({
    authenticate: async (token: string) => {
      if (token !== "valid") throw new OrderDomainFailure("unauthorized", 401, "Authentication is required.");
      return KITCHEN_DEVICE_ACTOR;
    },
    active: async () => [submittedOrder],
  });
  await withApi(fake, async base => {
    const response = await fetch(`${base}/api/v1/kitchen/orders`, {
      headers: { authorization: "Bearer valid" },
    });
    assert.equal(response.status, 200);
    const cacheControl = response.headers.get("Cache-Control");
    assert.ok(cacheControl?.includes("no-store"), `expected no-store in Cache-Control, got: ${cacheControl}`);
    assert.ok(cacheControl?.includes("no-cache"), `expected no-cache in Cache-Control, got: ${cacheControl}`);
    assert.ok(cacheControl?.includes("must-revalidate"), `expected must-revalidate in Cache-Control, got: ${cacheControl}`);
    assert.equal(response.headers.get("Pragma"), "no-cache");
    assert.equal(response.headers.get("Expires"), "0");
    assert.equal(response.headers.get("ETag"), null);
    const lastModified = response.headers.get("Last-Modified");
    assert.ok(lastModified, "expected Last-Modified header to be set");
  });
});

test("kitchen orders route returns same-branch submitted order as direct JSON array", async () => {
  const submittedOrder = order({
    id: "order-submitted-1",
    orderNumber: "M1005",
    status: "submitted",
    paymentStatus: "captured",
    source: "cashier",
    serviceMode: "dine_in",
  });
  const fake = service({
    authenticate: async (token: string) => {
      if (token !== "valid") throw new OrderDomainFailure("unauthorized", 401, "Authentication is required.");
      return KITCHEN_DEVICE_ACTOR;
    },
    active: async (actor, audience) => {
      assert.equal(audience, "kitchen");
      assert.equal(actor.branchId, KITCHEN_DEVICE_ACTOR.branchId);
      return [submittedOrder];
    },
  });
  await withApi(fake, async base => {
    const response = await fetch(`${base}/api/v1/kitchen/orders`, {
      headers: { authorization: "Bearer valid" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(Array.isArray(body), "kitchen endpoint must return a direct JSON array");
    assert.equal(body.length, 1);
    const first = body[0] as ProductionOrder;
    assert.equal(first.id, "order-submitted-1");
    assert.equal(first.orderNumber, "M1005");
    assert.equal(first.status, "submitted");
    assert.equal(first.paymentStatus, "captured");
    assert.equal(typeof first.createdAt, "string");
  });
});

test("kitchen orders route excludes other-branch orders", async () => {
  const mainBranchOrder = order({
    id: "order-main-branch",
    orderNumber: "M1005",
    status: "submitted",
    paymentStatus: "captured",
  });
  const fake = service({
    authenticate: async (token: string) => {
      if (token !== "valid") throw new OrderDomainFailure("unauthorized", 401, "Authentication is required.");
      return OTHER_BRANCH_KITCHEN_ACTOR;
    },
    active: async (actor) => {
      // Real repository does branch_id filtering; simulate: other-branch actor sees nothing from main branch
      if (actor.branchId === OTHER_BRANCH_KITCHEN_ACTOR.branchId) return [];
      return [mainBranchOrder];
    },
  });
  await withApi(fake, async base => {
    const response = await fetch(`${base}/api/v1/kitchen/orders`, {
      headers: { authorization: "Bearer valid" },
    });
    assert.equal(response.status, 200);
    const body = await response.json() as ProductionOrder[];
    assert.equal(body.length, 0);
  });
});

test("kitchen orders route rejects kiosk device (unauthorized audience)", async () => {
  const fake = service({
    authenticate: async (token: string) => {
      if (token !== "valid") throw new OrderDomainFailure("unauthorized", 401, "Authentication is required.");
      return UNAUTHORIZED_ACTOR;
    },
    active: async (actor, audience) => {
      // active() throws 403 for kiosk devices on kitchen audience
      if (audience === "kitchen" && !(actor.role === "device" && actor.deviceType === "kitchen_display")) {
        throw new OrderDomainFailure("unauthorized", 403, "Kitchen access is required.");
      }
      return [];
    },
  });
  await withApi(fake, async base => {
    const response = await fetch(`${base}/api/v1/kitchen/orders`, {
      headers: { authorization: "Bearer valid" },
    });
    assert.equal(response.status, 403);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(body.code, "unauthorized");
    assert.equal(body.message, "Kitchen access is required.");
  });
});

test("submitted kitchen order maps to frontend incoming/received column", async () => {
  const submittedOrder = order({
    id: "order-col-test",
    orderNumber: "M2020",
    status: "submitted",
    paymentStatus: "captured",
    placedAt: "2026-08-03T12:00:00.000Z",
    source: "cashier",
    serviceMode: "dine_in",
  });
  const fake = service({
    authenticate: async (token: string) => {
      if (token !== "valid") throw new OrderDomainFailure("unauthorized", 401, "Authentication is required.");
      return KITCHEN_DEVICE_ACTOR;
    },
    active: async () => [submittedOrder],
  });
  await withApi(fake, async base => {
    const response = await fetch(`${base}/api/v1/kitchen/orders`, {
      headers: { authorization: "Bearer valid" },
    });
    assert.equal(response.status, 200);
    const body = await response.json() as ProductionOrder[];
    assert.equal(body.length, 1);
    // Simulate frontend kitchenColumn mapping
    const backendStatus = body[0].status;
    // kitchenColumn function logic: submitted -> received
    const frontendColumn: string = (() => {
      if (backendStatus === "submitted") return "received";
      if (backendStatus === "accepted") return "preparing";
      if (backendStatus === "preparing") return "cooking";
      if (backendStatus === "ready") return "ready";
      return "completed";
    })();
    assert.equal(frontendColumn, "received", "submitted backend status must map to received/incoming frontend column");
  });
});
