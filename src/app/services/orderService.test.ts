import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { DEVICE_ACCESS_TOKEN_STORAGE_KEY } from "./device/DeviceConfigurationService";
import { OrderClientError, OrderService } from "./orders/OrderService";
import {
  buildCashierCreatePayload,
  cashierCreateSignature,
  newCashierAttempt,
  resolveCashierCreateAttempt,
} from "./orders/cashierAttempt";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;
const originalSessionStorage = globalThis.sessionStorage;

beforeEach(() => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: new MemoryStorage() });
  sessionStorage.setItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY, "device-token");
});

afterEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: originalSessionStorage });
});

test("browser-default fetch retains its Window receiver", async () => {
  const browserWindow = {
    fetch(this: unknown) {
      if (this !== browserWindow) throw new TypeError("Illegal invocation");
      return Promise.resolve(jsonResponse(quote()));
    },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: browserWindow });
  const result = await new OrderService().quote(request());
  assert.equal(result.total, "10.80");
});

test("injected fetch is not rebound and HTTP 400 remains a domain error", async () => {
  let receiver: unknown = "not-called";
  const fetchImpl = function(this: unknown) {
    receiver = this;
    return Promise.resolve(jsonResponse({
      code: "invalid_order_request",
      message: "Cart is invalid.",
      requestId: "request-123",
    }, 400));
  } as typeof fetch;
  const service = new OrderService({ fetchImpl });
  await assert.rejects(service.quote(request()), (error: unknown) => {
    assert.ok(error instanceof OrderClientError);
    assert.equal(error.code, "invalid_order_request");
    assert.equal(error.status, 400);
    return true;
  });
  assert.equal(receiver, undefined);
});

test("valid required selections receive a 200 quote and 422 metadata identifies the cart item", async () => {
  let sentBody: unknown;
  const valid = new OrderService({
    fetchImpl: async (_input, init) => {
      sentBody = JSON.parse(String(init?.body));
      return jsonResponse(quote(), 200);
    },
  });
  const requestWithModifier = {
    items: [{ productId: "product-pizza", quantity: 1, modifierIds: ["option-size-large"] }],
    serviceMode: "dine_in" as const,
    language: "en",
  };
  assert.equal((await valid.quote(requestWithModifier)).total, "10.80");
  assert.deepEqual(sentBody, requestWithModifier);

  const invalid = new OrderService({
    fetchImpl: async () => jsonResponse({
      code: "required_modifier_missing",
      message: "Choose bun requires another selection.",
      requestId: "request-422",
      itemIndex: 1,
      productId: "product-burger",
      details: { modifierGroupId: "group-bun" },
    }, 422),
  });
  await assert.rejects(invalid.quote(requestWithModifier), (error: unknown) =>
    error instanceof OrderClientError
      && error.status === 422
      && error.itemIndex === 1
      && error.productId === "product-burger"
      && error.details?.modifierGroupId === "group-bun");
});

test("HTTP 409 preserves conflict metadata needed for safe client recovery", async () => {
  const service = new OrderService({
    fetchImpl: async () => jsonResponse({
      code: "idempotency_conflict",
      message: "This attempt key belongs to another cart.",
      requestId: "request-409",
      existingOrderId: "order-existing",
      details: {
        existingOrderId: "order-existing",
        conflictReason: "fingerprint_mismatch",
        retryable: true,
      },
    }, 409),
  });

  await assert.rejects(service.create({
    ...request(),
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
  }), (error: unknown) => error instanceof OrderClientError
    && error.code === "idempotency_conflict"
    && error.status === 409
    && error.requestId === "request-409"
    && error.existingOrderId === "order-existing"
    && error.details?.retryable === true);
});

test("cashier request context overrides the customer workflow stored on OrderService", async () => {
  const workflowHeaders: Array<string | null> = [];
  const service = new OrderService({
    fetchImpl: async (_input, init) => {
      workflowHeaders.push(new Headers(init?.headers).get("x-workflow-attempt-id"));
      return jsonResponse(productionOrder("order-1"), 201);
    },
  });
  service.setWorkflowAttemptId("customer-workflow");
  const createRequest = {
    ...request(),
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
  };

  await service.create(createRequest, "device", { workflowAttemptId: "cashier-workflow" });
  await service.create(createRequest, "device", { workflowAttemptId: null });

  assert.deepEqual(workflowHeaders, ["cashier-workflow", null]);
});

test("cashier network sequence returns 201, duplicate 200, then changed-cart 201 without stale-key 409", async () => {
  const keyOwners = new Map<string, { signature: string; orderId: string }>();
  const network: Array<{ key: string; signature: string; status: number; workflow: string | null }> = [];
  const service = new OrderService({
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const key = String(body.idempotencyKey);
      const { idempotencyKey: _ignored, ...payload } = body;
      const signature = cashierCreateSignature(payload as ReturnType<typeof buildCashierCreatePayload>);
      const existing = keyOwners.get(key);
      const workflow = new Headers(init?.headers).get("x-workflow-attempt-id");
      if (existing && existing.signature !== signature) {
        network.push({ key, signature, status: 409, workflow });
        return jsonResponse({
          code: "idempotency_conflict",
          message: "stale key",
          requestId: "request-409",
        }, 409);
      }
      if (existing) {
        network.push({ key, signature, status: 200, workflow });
        return jsonResponse(productionOrder(existing.orderId), 200);
      }
      const orderId = `order-${keyOwners.size + 1}`;
      keyOwners.set(key, { signature, orderId });
      network.push({ key, signature, status: 201, workflow });
      return jsonResponse(productionOrder(orderId), 201);
    },
  });
  service.setWorkflowAttemptId("customer-workflow-must-not-leak");

  const firstPayload = buildCashierCreatePayload({
    items: [{ productId: "product-a", quantity: 1, modifierIds: [] }],
    serviceMode: "dine_in",
    language: "en",
    notes: null,
  });
  const secondPayload = buildCashierCreatePayload({
    items: [{ productId: "product-a", quantity: 2, modifierIds: [] }],
    serviceMode: "dine_in",
    language: "en",
    notes: null,
  });
  let attempt = resolveCashierCreateAttempt(
    newCashierAttempt(sequenceIds("K1", "P1", "W1")),
    cashierCreateSignature(firstPayload),
  );

  const first = await service.create(
    { ...firstPayload, idempotencyKey: attempt.createKey },
    "device",
    { workflowAttemptId: attempt.workflowAttemptId },
  );
  const duplicate = await service.create(
    { ...firstPayload, idempotencyKey: attempt.createKey },
    "device",
    { workflowAttemptId: attempt.workflowAttemptId },
  );
  attempt = resolveCashierCreateAttempt(
    attempt,
    cashierCreateSignature(secondPayload),
    sequenceIds("K2", "P2", "W2"),
  );
  const changed = await service.create(
    { ...secondPayload, idempotencyKey: attempt.createKey },
    "device",
    { workflowAttemptId: attempt.workflowAttemptId },
  );

  assert.equal(first.id, duplicate.id);
  assert.notEqual(changed.id, first.id);
  assert.deepEqual(network.map(entry => ({
    key: entry.key,
    status: entry.status,
    workflow: entry.workflow,
  })), [
    { key: "K1", status: 201, workflow: "W1" },
    { key: "K1", status: 200, workflow: "W1" },
    { key: "K2", status: 201, workflow: "W2" },
  ]);
  assert.ok(network.every(entry => entry.status !== 409));
});

test("malformed and empty successful responses are server errors", async () => {
  const malformed = new OrderService({ fetchImpl: async () => new Response("{bad", { status: 200 }) });
  await assert.rejects(malformed.quote(request()), (error: unknown) =>
    error instanceof OrderClientError && error.code === "server_error");
  const empty = new OrderService({ fetchImpl: async () => new Response(null, { status: 200 }) });
  await assert.rejects(empty.quote(request()), (error: unknown) =>
    error instanceof OrderClientError && error.code === "server_error");
});

test("transport failure and offline preflight preserve actionable offline errors", async () => {
  const failing = new OrderService({ fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
  await assert.rejects(failing.quote(request()), (error: unknown) =>
    error instanceof OrderClientError && error.code === "offline" && error.message === "Failed to fetch");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: false } });
  await assert.rejects(failing.quote(request()), (error: unknown) =>
    error instanceof OrderClientError && error.code === "offline");
});

function request() {
  return { items: [{ productId: "p1", quantity: 1, modifierIds: [] }], serviceMode: "dine_in" as const, language: "en" };
}

function quote() {
  return {
    menuId: "m1", menuVersion: 1, currency: "EUR", subtotal: "10.00", taxTotal: "0.80",
    discountTotal: "0.00", total: "10.80", serviceMode: "dine_in", language: "en", items: [],
  };
}

function productionOrder(id: string) {
  return {
    ...quote(),
    id,
    orderNumber: id === "order-1" ? "A101" : "A102",
    status: "awaiting_payment",
    paymentStatus: null,
    paymentMethod: null,
    source: "cashier",
    customerReference: "a".repeat(48),
    version: 1,
    notes: null,
    placedAt: null,
    acceptedAt: null,
    preparingAt: null,
    readyAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: "2026-08-03T10:00:00.000Z",
    updatedAt: "2026-08-03T10:00:00.000Z",
  };
}

function sequenceIds(...values: string[]) {
  let index = 0;
  return () => {
    const value = values[index++];
    if (value === undefined) throw new Error("Test ID factory exhausted.");
    return value;
  };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "x-request-id": "request-123" },
  });
}
