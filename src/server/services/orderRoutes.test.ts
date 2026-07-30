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
