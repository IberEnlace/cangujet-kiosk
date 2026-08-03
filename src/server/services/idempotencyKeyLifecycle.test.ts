import assert from "node:assert/strict";
import test from "node:test";
import type { OrderCreateRequest } from "../../shared/orders";
import type {
  OrderActor,
  OrderPricingContext,
  OrderRepository,
  PersistOrderInput,
  PersistPaymentInput,
} from "../repositories/orderRepository";
import {
  fingerprintOrderCreatePayload,
  OrderDomainFailure,
  OrderDomainService,
} from "./orderDomainService";
import type { DeviceIdentityApplication } from "./deviceIdentityService";

const DEVICE: OrderActor = {
  actorType: "device", actorId: "device-1", restaurantId: "rest-1",
  branchId: "branch-1", deviceId: "device-1", role: "device", deviceType: "kiosk",
};

const KEY_1 = "11111111-1111-4111-8111-111111111111";
const KEY_2 = "22222222-2222-4222-8222-222222222222";
const PAY_KEY = "33333333-3333-4333-8333-333333333333";

test("1. fingerprintOrderCreatePayload ignores idempotencyKey and normalizes undefined/null fields", () => {
  const req1: OrderCreateRequest = {
    idempotencyKey: KEY_1,
    serviceMode: "dine_in",
    language: "en",
    items: [{ productId: "p-1", quantity: 2, modifierIds: ["mod-b", "mod-a"] }],
    notes: undefined,
  };
  const req2: OrderCreateRequest = {
    idempotencyKey: KEY_2, // Different key!
    serviceMode: "dine_in",
    language: "en",
    items: [{ productId: "p-1", quantity: 2, modifierIds: ["mod-a", "mod-b"] }], // Different modifier order!
    notes: undefined, // undefined vs omitted
  };

  const fp1 = fingerprintOrderCreatePayload(req1, "kiosk");
  const fp2 = fingerprintOrderCreatePayload(req2, "kiosk");

  assert.equal(fp1, fp2);
});

test("2. Order creation with same key and identical payload returns duplicate idempotent response", async () => {
  const repo = new MockOrderRepository();
  const service = new OrderDomainService(repo, deviceIdentity());
  const req: OrderCreateRequest = {
    idempotencyKey: KEY_1,
    serviceMode: "dine_in",
    language: "en",
    items: [{ productId: "p-1", quantity: 1, modifierIds: [] }],
  };

  const first = await service.create(DEVICE, req);
  assert.equal(first.duplicate, false);

  const second = await service.create(DEVICE, req);
  assert.equal(second.duplicate, true);
  assert.equal(second.order.id, first.order.id);
});

test("3. Order creation with same key but modified payload throws idempotency_conflict", async () => {
  const repo = new MockOrderRepository();
  const service = new OrderDomainService(repo, deviceIdentity());
  const req1: OrderCreateRequest = {
    idempotencyKey: KEY_1,
    serviceMode: "dine_in",
    language: "en",
    items: [{ productId: "p-1", quantity: 1, modifierIds: [] }],
  };
  const req2: OrderCreateRequest = {
    idempotencyKey: KEY_1, // Reusing KEY_1 with different quantity!
    serviceMode: "dine_in",
    language: "en",
    items: [{ productId: "p-1", quantity: 5, modifierIds: [] }],
  };

  await service.create(DEVICE, req1);

  await assert.rejects(
    service.create(DEVICE, req2),
    (err: unknown) => err instanceof OrderDomainFailure
      && err.code === "idempotency_conflict"
      && err.status === 409
      && err.details?.existingOrderId === "ord-1"
      && err.details?.conflictReason === "fingerprint_mismatch"
      && err.details?.retryable === true,
  );
});

test("4. Rotated idempotency key after conflict creates a fresh order cleanly", async () => {
  const repo = new MockOrderRepository();
  const service = new OrderDomainService(repo, deviceIdentity());
  const req1: OrderCreateRequest = {
    idempotencyKey: KEY_1,
    serviceMode: "dine_in",
    language: "en",
    items: [{ productId: "p-1", quantity: 1, modifierIds: [] }],
  };
  const req2Fresh: OrderCreateRequest = {
    idempotencyKey: KEY_2, // Rotated to fresh KEY_2!
    serviceMode: "dine_in",
    language: "en",
    items: [{ productId: "p-1", quantity: 5, modifierIds: [] }],
  };

  const first = await service.create(DEVICE, req1);
  const second = await service.create(DEVICE, req2Fresh);

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, false);
  assert.notEqual(first.order.id, second.order.id);
});

test("5. Payment uses independent payment idempotency key", async () => {
  const repo = new MockOrderRepository();
  const service = new OrderDomainService(repo, deviceIdentity());
  const req: OrderCreateRequest = {
    idempotencyKey: KEY_1,
    serviceMode: "dine_in",
    language: "en",
    items: [{ productId: "p-1", quantity: 1, modifierIds: [] }],
  };

  const created = await service.create(DEVICE, req);
  const paid = await service.pay(DEVICE, created.order.id, {
    idempotencyKey: PAY_KEY,
    method: "card_terminal",
  });

  assert.equal(paid.order.status, "paid");
  assert.equal(paid.duplicate, false);
});

test("6. Uncommitted order creation retry with identical payload returns duplicate response without 409", async () => {
  const repo = new MockOrderRepository();
  const service = new OrderDomainService(repo, deviceIdentity());
  const reqAttempt1: OrderCreateRequest = {
    idempotencyKey: KEY_1,
    serviceMode: "dine_in",
    language: "en",
    items: [{ productId: "p-1", quantity: 1, modifierIds: [] }],
    notes: undefined,
  };
  const reqAttempt2: OrderCreateRequest = {
    idempotencyKey: KEY_1,
    serviceMode: "dine_in",
    language: "en",
    items: [{ productId: "p-1", quantity: 1, modifierIds: [] }],
    notes: undefined,
  };

  const attempt1 = await service.create(DEVICE, reqAttempt1);
  assert.equal(attempt1.duplicate, false);

  const attempt2 = await service.create(DEVICE, reqAttempt2);
  assert.equal(attempt2.duplicate, true);
  assert.equal(attempt2.order.id, attempt1.order.id);
});

test("7. Concurrent identical requests converge on one order instead of returning 409", async () => {
  const repo = new MockOrderRepository();
  const service = new OrderDomainService(repo, deviceIdentity());
  const request: OrderCreateRequest = {
    idempotencyKey: KEY_1,
    serviceMode: "dine_in",
    language: "en",
    items: [{ productId: "p-1", quantity: 1, modifierIds: [] }],
  };

  const [first, second] = await Promise.all([
    service.create(DEVICE, request),
    service.create(DEVICE, request),
  ]);

  assert.equal(first.order.id, second.order.id);
  assert.deepEqual([first.duplicate, second.duplicate].sort(), [false, true]);
  assert.equal(repo.orders.size, 1);
});

class MockOrderRepository implements OrderRepository {
  readonly orders = new Map<string, any>();
  readonly idempotency = new Map<string, { fingerprint: string; orderId: string }>();

  async authenticateStaff() { return null; }
  async loadPricingContext(): Promise<OrderPricingContext> {
    return {
      restaurantId: "rest-1", branchId: "branch-1", menuId: "menu-1", menuVersion: 1,
      currency: "EUR", timezone: "Europe/Istanbul", taxRate: "0.08", serviceModes: ["dine_in" as const, "take_away" as const],
      products: [{ id: "p-1", name: "Espresso", price: "2.50", currency: "EUR", active: true, available: true, categoryActive: true, categoryVisible: true, allergens: [] }],
      modifierGroups: [], modifiers: [],
    };
  }
  async findExistingOrderForIdempotency(_actor: OrderActor, _source: string, key: string) {
    const existing = this.idempotency.get(key);
    return existing
      ? { id: existing.orderId, request_fingerprint: existing.fingerprint }
      : null;
  }
  async createOrder(input: PersistOrderInput) {
    const existing = this.idempotency.get(input.idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== input.requestFingerprint) {
        throw new OrderDomainFailure("idempotency_conflict", 409, "Idempotency conflict");
      }
      return { order: this.orders.get(existing.orderId), duplicate: true };
    }
    const order = {
      ...input.quote,
      id: `ord-${this.orders.size + 1}`,
      orderNumber: `A${100 + this.orders.size}`,
      status: "awaiting_payment",
      paymentStatus: null, paymentMethod: null, source: input.source,
      customerReference: "ref-" + Math.random(), version: 1, notes: input.notes,
      placedAt: null, acceptedAt: null, preparingAt: null, readyAt: null, completedAt: null, cancelledAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    (order as any).restaurantId = input.actor.restaurantId;
    (order as any).branchId = input.actor.branchId;
    this.orders.set(order.id, order);
    this.idempotency.set(input.idempotencyKey, { fingerprint: input.requestFingerprint, orderId: order.id });
    return { order, duplicate: false };
  }

  async getOrder(_actor: OrderActor, orderId: string) { return this.orders.get(orderId) ?? null; }
  async getTracking() { return null; }
  async listActiveOrders() { return [...this.orders.values()]; }
  async listPendingCashierOrders() { return []; }
  async recordPayment(input: PersistPaymentInput) {
    const order = { ...input.order, status: "paid" as const, paymentStatus: "captured" as const, version: input.order.version + 1 };
    this.orders.set(order.id, order);
    return { order, paymentId: "pay-1", paymentStatus: "captured" as const, amount: order.total, change: "0.00", duplicate: false };
  }
  async transitionOrder(input: any) {
    const current = this.orders.get(input.orderId);
    const order = { ...current, status: input.nextStatus, version: current.version + 1 };
    this.orders.set(order.id, order);
    return order;
  }
}

function deviceIdentity() {
  return {
    authorize: async () => ({
      deviceId: DEVICE.deviceId!, restaurantId: DEVICE.restaurantId, branchId: DEVICE.branchId, deviceType: "customer_kiosk" as const,
    }),
  } as unknown as DeviceIdentityApplication;
}
