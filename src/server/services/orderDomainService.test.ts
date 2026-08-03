import assert from "node:assert/strict";
import test from "node:test";
import type {
  OrderPaymentResult,
  ProductionOrder,
  ProductionOrderStatus,
} from "../../shared/orders";
import type {
  OrderActor,
  OrderPricingContext,
  OrderRepository,
  PersistOrderInput,
  PersistPaymentInput,
} from "../repositories/orderRepository";
import { calculateQuote, OrderDomainFailure, OrderDomainService } from "./orderDomainService";
import type { DeviceIdentityApplication } from "./deviceIdentityService";

const DEVICE: OrderActor = {
  actorType: "device", actorId: "device-a", restaurantId: "restaurant-a",
  branchId: "branch-a", deviceId: "device-a", role: "device", deviceType: "kiosk",
};
const KITCHEN: OrderActor = {
  actorType: "staff", actorId: "chef-a", restaurantId: "restaurant-a",
  branchId: "branch-a", deviceId: null, role: "kitchen", deviceType: null,
};
const CASHIER: OrderActor = {
  actorType: "staff", actorId: "cashier-a", restaurantId: "restaurant-a",
  branchId: "branch-a", deviceId: null, role: "cashier", deviceType: null,
};
const CASHIER_TERMINAL: OrderActor = {
  actorType: "device", actorId: "cashier-terminal-a", restaurantId: "restaurant-a",
  branchId: "branch-a", deviceId: "cashier-terminal-a", role: "device", deviceType: "cashier_terminal",
};
const CREATE_KEY = "11111111-1111-4111-8111-111111111111";
const PAYMENT_KEY = "22222222-2222-4222-8222-222222222222";

test("server quote calculates valid one-item quote without modifiers when not required", () => {
  const p = pricing();
  p.modifierGroups[0].required = false;
  p.modifierGroups[0].minimumSelections = 0;
  const quote = calculateQuote(request([]), p);
  assert.equal(quote.subtotal, "10.00");
  assert.equal(quote.taxTotal, "0.80");
  assert.equal(quote.total, "10.80");
  assert.equal(quote.items.length, 1);
});

test("server quote validates item with required modifiers", () => {
  const quote = calculateQuote(request(["modifier-cheese"]), pricing());
  assert.deepEqual(
    { subtotal: quote.subtotal, tax: quote.taxTotal, total: quote.total },
    { subtotal: "12.50", tax: "1.00", total: "13.50" },
  );
  assert.equal(quote.items[0].productName, "Snapshot Burger");
  assert.equal(quote.items[0].modifiers[0].name, "Cheese Snapshot");
  assert.equal(quote.items[0].taxRate, "0.080000");
});

test("server quote rejects invalid product ID", () => {
  const req = {
    items: [{ productId: "nonexistent-product", quantity: 1, modifierIds: [] }],
    serviceMode: "dine_in" as const,
    language: "en",
  };
  assertFailure(() => calculateQuote(req, pricing()), "product_unavailable");
});

test("server quote rejects invalid modifier ID", () => {
  const req = {
    items: [{ productId: "product-burger", quantity: 1, modifierIds: ["invalid-modifier-id"] }],
    serviceMode: "dine_in" as const,
    language: "en",
  };
  assertFailure(() => calculateQuote(req, pricing()), "modifier_unavailable");
});

test("server quote handles missing or null price safely", () => {
  const p = pricing();
  (p.products[0] as any).price = null;
  p.modifierGroups[0].required = false;
  p.modifierGroups[0].minimumSelections = 0;
  const quote = calculateQuote(request([]), p);
  assert.equal(quote.subtotal, "0.00");
  assert.equal(quote.total, "0.00");
});

test("server quote handles database failure during pricing context load", async () => {
  const failingRepo = new MemoryOrderRepository();
  failingRepo.loadPricingContext = async () => {
    throw new Error("Database connection lost");
  };
  const service = new OrderDomainService(failingRepo, deviceIdentity());
  await assert.rejects(
    service.quote(DEVICE, request(["modifier-cheese"])),
    (err: unknown) => err instanceof Error && err.message === "Database connection lost",
  );
});

test("creation and payment retries are idempotent and preserve authoritative snapshots", async () => {
  const repository = new MemoryOrderRepository();
  const service = new OrderDomainService(repository, deviceIdentity());
  const input = { ...request(["modifier-cheese"]), idempotencyKey: CREATE_KEY, source: "kiosk" as const };
  const first = await service.create(DEVICE, input);
  const second = await service.create(DEVICE, input);
  assert.equal(first.order.id, second.order.id);
  assert.equal(second.duplicate, true);
  assert.equal(repository.orders.size, 1);
  const paid = await service.pay(DEVICE, first.order.id, {
    idempotencyKey: PAYMENT_KEY, method: "card_terminal", externalReference: "terminal-safe-reference",
  });
  const retry = await service.pay(DEVICE, first.order.id, {
    idempotencyKey: PAYMENT_KEY, method: "card_terminal", externalReference: "terminal-safe-reference",
  });
  assert.equal(paid.paymentId, retry.paymentId);
  assert.equal(repository.paymentCount, 1);
  assert.equal(paid.order.status, "paid");
});

test("state machine rejects stale and illegal transitions and records valid kitchen events", async () => {
  const repository = new MemoryOrderRepository();
  const service = new OrderDomainService(repository, deviceIdentity());
  const created = await service.create(DEVICE, { ...request(["modifier-cheese"]), idempotencyKey: CREATE_KEY });
  const paid = await service.pay(DEVICE, created.order.id, { idempotencyKey: PAYMENT_KEY, method: "card_terminal" });
  await assert.rejects(service.submit(DEVICE, paid.order.id, paid.order.version - 1), failure("order_conflict"));
  const submitted = await service.submit(DEVICE, paid.order.id, paid.order.version);
  await assert.rejects(service.transition(KITCHEN, submitted.id, "ready", submitted.version, null), failure("invalid_order_transition"));
  const accepted = await service.transition(KITCHEN, submitted.id, "accepted", submitted.version, null);
  const preparing = await service.transition(KITCHEN, accepted.id, "preparing", accepted.version, null);
  const ready = await service.transition(KITCHEN, preparing.id, "ready", preparing.version, null);
  const completed = await service.transition(KITCHEN, ready.id, "completed", ready.version, null);
  assert.equal(completed.status, "completed");
  assert.deepEqual(repository.events, ["paid", "submitted", "accepted", "preparing", "ready", "completed"]);
});

test("tenant-scoped lookup cannot return an order from another branch", async () => {
  const repository = new MemoryOrderRepository();
  const service = new OrderDomainService(repository, deviceIdentity());
  const created = await service.create(DEVICE, { ...request(["modifier-cheese"]), idempotencyKey: CREATE_KEY });
  const other = { ...DEVICE, actorId: "device-b", deviceId: "device-b", branchId: "branch-b" };
  await assert.rejects(service.get(other, created.order.id), failure("order_not_found"));
});

test("Pay at Cashier remains awaiting payment until same-branch cashier captures and submits", async () => {
  const repository = new MemoryOrderRepository();
  const service = new OrderDomainService(repository, deviceIdentity());
  const created = await service.create(DEVICE, { ...request(["modifier-cheese"]), idempotencyKey: CREATE_KEY });
  const deferred = await service.pay(DEVICE, created.order.id, {
    idempotencyKey: PAYMENT_KEY,
    method: "pay_at_cashier",
  });
  assert.equal(deferred.order.status, "awaiting_payment");
  assert.equal(deferred.order.paymentStatus, "pending");
  assert.equal(deferred.order.paymentMethod, "pay_at_cashier");
  await assert.rejects(service.submit(DEVICE, deferred.order.id, deferred.order.version), failure("invalid_order_transition"));

  assert.equal((await service.pendingCashierOrders(CASHIER)).length, 1);
  assert.equal((await service.pendingCashierOrders({ ...CASHIER, branchId: "branch-b" })).length, 0);
  await assert.rejects(service.pendingCashierOrders(DEVICE), failure("unauthorized"));

  const cashRequest = {
    idempotencyKey: "33333333-3333-4333-8333-333333333333",
    method: "cash" as const,
    amountReceived: "20.00",
  };
  const paid = await service.pay(CASHIER, deferred.order.id, cashRequest);
  const duplicate = await service.pay(CASHIER, deferred.order.id, cashRequest);
  assert.equal(paid.order.status, "paid");
  assert.equal(paid.paymentStatus, "captured");
  assert.equal(paid.change, "5.00");
  assert.equal(duplicate.paymentId, paid.paymentId);
  assert.equal(repository.paymentCount, 2, "one pending intent and one captured payment row");
  const submitted = await service.submit(CASHIER, paid.order.id, paid.order.version);
  assert.equal(submitted.status, "submitted");
  assert.equal((await service.active(KITCHEN, "kitchen")).some(order => order.id === submitted.id), true);
});

test("cashier terminal can capture deferred card payment and kiosk card flow stays valid", async () => {
  const repository = new MemoryOrderRepository();
  const service = new OrderDomainService(repository, deviceIdentity());
  const deferredCreated = await service.create(DEVICE, { ...request(["modifier-cheese"]), idempotencyKey: CREATE_KEY });
  const deferred = await service.pay(DEVICE, deferredCreated.order.id, { idempotencyKey: PAYMENT_KEY, method: "pay_at_cashier" });
  const paidAtCashier = await service.pay(CASHIER_TERMINAL, deferred.order.id, {
    idempotencyKey: "44444444-4444-4444-8444-444444444444",
    method: "card_terminal",
    externalReference: "terminal-cashier-1",
  });
  assert.equal(paidAtCashier.order.status, "paid");
  assert.equal((await service.submit(CASHIER_TERMINAL, paidAtCashier.order.id, paidAtCashier.order.version)).status, "submitted");

  const kioskCreated = await service.create(DEVICE, {
    ...request(["modifier-cheese"]),
    idempotencyKey: "55555555-5555-4555-8555-555555555555",
  });
  const kioskCard = await service.pay(DEVICE, kioskCreated.order.id, {
    idempotencyKey: "66666666-6666-4666-8666-666666666666",
    method: "card_terminal",
    externalReference: "terminal-kiosk-1",
  });
  assert.equal(kioskCard.order.status, "paid");
});

test("failed or cancelled deferred orders cannot be sent to production", async () => {
  const repository = new MemoryOrderRepository();
  const service = new OrderDomainService(repository, deviceIdentity());
  const created = await service.create(DEVICE, { ...request(["modifier-cheese"]), idempotencyKey: CREATE_KEY });
  const deferred = await service.pay(DEVICE, created.order.id, { idempotencyKey: PAYMENT_KEY, method: "pay_at_cashier" });
  await assert.rejects(service.pay(CASHIER, deferred.order.id, {
    idempotencyKey: "77777777-7777-4777-8777-777777777777",
    method: "cash",
    amountReceived: "1.00",
  }), failure("payment_failed"));
  assert.equal((await service.get(DEVICE, deferred.order.id)).status, "awaiting_payment");
  const cancelled = await service.cancel(CASHIER, deferred.order.id, deferred.order.version, "Customer left");
  assert.equal(cancelled.status, "cancelled");
  await assert.rejects(service.pay(CASHIER, cancelled.id, {
    idempotencyKey: "88888888-8888-4888-8888-888888888888",
    method: "cash",
    amountReceived: "20.00",
  }), failure("invalid_order_transition"));
});

class MemoryOrderRepository implements OrderRepository {
  readonly orders = new Map<string, ProductionOrder>();
  readonly idempotency = new Map<string, { fingerprint: string; orderId: string }>();
  readonly payments = new Map<string, OrderPaymentResult>();
  readonly events: ProductionOrderStatus[] = [];
  paymentCount = 0;

  async authenticateStaff() { return null; }
  async loadPricingContext() { return pricing(); }
  async createOrder(input: PersistOrderInput) {
    const existing = this.idempotency.get(input.idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== input.requestFingerprint) throw new Error("idempotency_conflict");
      return { order: this.orders.get(existing.orderId)!, duplicate: true };
    }
    const order: ProductionOrder = {
      ...input.quote,
      id: `order-${this.orders.size + 1}`,
      orderNumber: `A${101 + this.orders.size}`,
      status: "awaiting_payment",
      paymentStatus: null,
      paymentMethod: null,
      source: input.source,
      customerReference: "a".repeat(48),
      version: 1,
      notes: input.notes,
      placedAt: null, acceptedAt: null, preparingAt: null, readyAt: null,
      completedAt: null, cancelledAt: null,
      createdAt: "2026-07-30T10:00:00.000Z",
      updatedAt: "2026-07-30T10:00:00.000Z",
    };
    this.orders.set(order.id, order);
    this.idempotency.set(input.idempotencyKey, { fingerprint: input.requestFingerprint, orderId: order.id });
    return { order, duplicate: false };
  }
  async getOrder(actor: OrderActor, orderId: string) {
    const order = this.orders.get(orderId);
    return order && actor.restaurantId === "restaurant-a" && actor.branchId === "branch-a" ? order : null;
  }
  async getTracking() { return null; }
  async listActiveOrders(_actor: OrderActor, audience: "kitchen" | "cashier" | "display") {
    return [...this.orders.values()].filter(order => audience !== "kitchen"
      || ["submitted", "accepted", "preparing", "ready", "completed"].includes(order.status));
  }
  async listPendingCashierOrders(actor: OrderActor) {
    if (actor.restaurantId !== "restaurant-a" || actor.branchId !== "branch-a") return [];
    return [...this.orders.values()].filter(order => order.source === "kiosk"
      && order.status === "awaiting_payment"
      && order.paymentMethod === "pay_at_cashier"
      && order.cancelledAt === null);
  }
  async recordPayment(input: PersistPaymentInput) {
    const key = `${input.order.id}:${input.idempotencyKey}`;
    const existing = this.payments.get(key);
    if (existing) return { ...existing, duplicate: true };
    const order = update(input.order, {
      status: input.captured ? "paid" : "awaiting_payment",
      paymentStatus: input.captured ? "captured" : "pending",
      paymentMethod: input.method,
    });
    this.orders.set(order.id, order);
    if (input.captured) this.events.push("paid");
    const result = {
      order,
      paymentId: `payment-${++this.paymentCount}`,
      paymentStatus: input.captured ? "captured" as const : "pending" as const,
      amount: order.total,
      change: input.method === "cash" ? "5.00" : "0.00",
    };
    this.payments.set(key, result);
    return { ...result, duplicate: false };
  }
  async transitionOrder(input: {
    actor: OrderActor; orderId: string; expectedVersion: number;
    nextStatus: ProductionOrderStatus; reason: string | null;
  }) {
    const current = this.orders.get(input.orderId);
    if (!current) throw new Error("order_not_found");
    if (current.version !== input.expectedVersion) throw new Error("order_conflict");
    const order = update(current, {
      status: input.nextStatus,
      placedAt: input.nextStatus === "submitted" ? new Date().toISOString() : current.placedAt,
      acceptedAt: input.nextStatus === "accepted" ? new Date().toISOString() : current.acceptedAt,
      preparingAt: input.nextStatus === "preparing" ? new Date().toISOString() : current.preparingAt,
      readyAt: input.nextStatus === "ready" ? new Date().toISOString() : current.readyAt,
      completedAt: input.nextStatus === "completed" ? new Date().toISOString() : current.completedAt,
      cancelledAt: input.nextStatus === "cancelled" ? new Date().toISOString() : current.cancelledAt,
    });
    this.orders.set(order.id, order);
    this.events.push(input.nextStatus);
    return order;
  }
}

function pricing(): OrderPricingContext {
  return {
    restaurantId: "restaurant-a", branchId: "branch-a", menuId: "menu-a", menuVersion: 7,
    currency: "EUR", timezone: "Europe/Istanbul", taxRate: "0.08",
    serviceModes: ["dine_in", "take_away"],
    products: [{
      id: "product-burger", name: "Snapshot Burger", price: "10.00", currency: "EUR",
      active: true, available: true, categoryActive: true, categoryVisible: true, allergens: ["milk"],
    }],
    modifierGroups: [{
      id: "group-cheese", productId: "product-burger", name: "Cheese",
      minimumSelections: 1, maximumSelections: 1, required: true,
    }],
    modifiers: [{
      id: "modifier-cheese", groupId: "group-cheese", name: "Cheese Snapshot",
      price: "2.50", available: true,
    }],
  };
}

function request(modifierIds: string[]) {
  return {
    items: [{ productId: "product-burger", quantity: 1, modifierIds }],
    serviceMode: "dine_in" as const,
    language: "en",
  };
}

function update(order: ProductionOrder, values: Partial<ProductionOrder>): ProductionOrder {
  return { ...order, ...values, version: order.version + 1, updatedAt: new Date().toISOString() };
}

function failure(code: string) {
  return (error: unknown) => error instanceof OrderDomainFailure && error.code === code;
}

function assertFailure(run: () => unknown, code: string) {
  assert.throws(run, failure(code));
}

function deviceIdentity() {
  return {
    authorize: async () => ({
      deviceId: DEVICE.deviceId!, restaurantId: DEVICE.restaurantId,
      branchId: DEVICE.branchId, deviceType: "customer_kiosk" as const,
    }),
  } as unknown as DeviceIdentityApplication;
}
