import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { DEVICE_ACCESS_TOKEN_STORAGE_KEY } from "./device/DeviceConfigurationService";
import { OrderClientError, OrderService } from "./orders/OrderService";

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

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "x-request-id": "request-123" },
  });
}
