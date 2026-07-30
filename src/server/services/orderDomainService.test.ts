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
const CREATE_KEY = "11111111-1111-4111-8111-111111111111";
const PAYMENT_KEY = "22222222-2222-4222-8222-222222222222";

test("server quote validates modifier rules and calculates decimal-safe tax snapshots", () => {
  const quote = calculateQuote(request(["modifier-cheese"]), pricing());
  assert.deepEqual(
    { subtotal: quote.subtotal, tax: quote.taxTotal, total: quote.total },
    { subtotal: "12.50", tax: "1.00", total: "13.50" },
  );
  assert.equal(quote.items[0].productName, "Snapshot Burger");
  assert.equal(quote.items[0].modifiers[0].name, "Cheese Snapshot");
  assert.equal(quote.items[0].taxRate, "0.080000");
});

test("server quote rejects required, unavailable, cross-product, and hidden selections", () => {
  assertFailure(() => calculateQuote(request([]), pricing()), "required_modifier_missing");
  const unavailable = pricing();
  unavailable.modifiers[0].available = false;
  assertFailure(() => calculateQuote(request(["modifier-cheese"]), unavailable), "modifier_unavailable");
  const hidden = pricing();
  hidden.products[0].categoryVisible = false;
  assertFailure(() => calculateQuote(request(["modifier-cheese"]), hidden), "product_unavailable");
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
  async listActiveOrders() { return [...this.orders.values()]; }
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
