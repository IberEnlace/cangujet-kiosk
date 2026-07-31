import test from "node:test";
import assert from "node:assert/strict";
import { OrderDomainService, OrderDomainFailure } from "./orderDomainService.js";
import type { OrderActor } from "../repositories/orderRepository.js";
import type { ProductionOrder } from "../../shared/orders.js";

// Mock Repository in memory for fast, deterministic unit test verification of lifecycle logic
class MockLifecycleRepository {
  private orders = new Map<string, ProductionOrder & { restaurantId: string; branchId: string; idempotencyKey: string; requestFingerprint: string }>();
  private payments = new Map<string, Array<{ id: string; key: string; fingerprint: string; status: string }>>();
  private idCounter = 1;

  async createOrder(input: any): Promise<{ order: ProductionOrder; duplicate: boolean }> {
    const existing = Array.from(this.orders.values()).find(
      o => o.restaurantId === input.actor.restaurantId &&
           o.branchId === input.actor.branchId &&
           o.idempotencyKey === input.idempotencyKey
    );
    if (existing) {
      if (existing.requestFingerprint !== input.requestFingerprint) {
        throw new Error("idempotency_conflict");
      }
      return { order: existing, duplicate: true };
    }

    const id = `order-${this.idCounter++}`;
    const order: ProductionOrder & { restaurantId: string; branchId: string; idempotencyKey: string; requestFingerprint: string } = {
      id,
      restaurantId: input.actor.restaurantId,
      branchId: input.actor.branchId,
      orderNumber: `M10${this.idCounter}`,
      source: input.source,
      status: "awaiting_payment",
      paymentStatus: null,
      paymentMethod: null,
      serviceMode: input.quote.serviceMode,
      currency: input.quote.currency || "USD",
      subtotal: input.quote.subtotal,
      taxTotal: input.quote.taxTotal,
      discountTotal: input.quote.discountTotal,
      total: input.quote.total,
      language: input.quote.language,
      customerReference: `ref-${id}`,
      notes: input.notes,
      version: 1,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      menuId: input.quote.menuId,
      menuVersion: input.quote.menuVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      placedAt: null,
      acceptedAt: null,
      preparingAt: null,
      readyAt: null,
      completedAt: null,
      cancelledAt: null,
      items: input.quote.items.map((it: any, idx: number) => ({
        productId: it.productId,
        productName: it.productName,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        lineSubtotal: it.lineTotal,
        taxTotal: "0.00",
        lineTotal: it.lineTotal,
        taxRate: "0.00",
        notes: null,
        sortOrder: idx + 1,
        allergens: [],
        modifiers: [],
      })),
    };

    this.orders.set(id, order);
    return { order, duplicate: false };
  }

  async getOrder(actor: OrderActor, orderId: string): Promise<ProductionOrder | null> {
    const order = this.orders.get(orderId);
    if (!order) return null;
    if (order.restaurantId !== actor.restaurantId) return null;
    if (actor.branchId && order.branchId !== actor.branchId) return null;
    return { ...order };
  }

  async getTracking(customerReference: string) {
    const order = Array.from(this.orders.values()).find(o => o.customerReference === customerReference);
    return order ? { id: order.id, orderNumber: order.orderNumber, status: order.status, total: order.total } as any : null;
  }

  async listActiveOrders(actor: OrderActor, audience: string): Promise<ProductionOrder[]> {
    return Array.from(this.orders.values()).filter(o => {
      if (o.restaurantId !== actor.restaurantId) return false;
      if (actor.branchId && o.branchId !== actor.branchId) return false;
      if (audience === "kitchen") {
        return ["submitted", "accepted", "preparing", "ready"].includes(o.status);
      }
      return true;
    });
  }

  async recordPayment(input: any) {
    const order = this.orders.get(input.order.id);
    if (!order) throw new Error("order_not_found");

    let list = this.payments.get(order.id) || [];
    const existing = list.find(p => p.key === input.idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== input.requestFingerprint) {
        throw new Error("idempotency_conflict");
      }
      return {
        order: { ...order },
        paymentId: existing.id,
        paymentStatus: existing.status,
        amount: order.total,
        change: "0.00",
        duplicate: true,
      };
    }

    const paymentId = `pay-${Date.now()}-${Math.random()}`;
    const paymentStatus = input.captured ? "captured" : "pending";
    list.push({ id: paymentId, key: input.idempotencyKey, fingerprint: input.requestFingerprint, status: paymentStatus });
    this.payments.set(order.id, list);

    if (input.captured) {
      order.status = "paid";
      order.paymentStatus = "captured";
      order.paymentMethod = input.method;
      order.version += 1;
      order.updatedAt = new Date().toISOString();
    }

    return {
      order: { ...order },
      paymentId,
      paymentStatus,
      amount: order.total,
      change: "0.00",
      duplicate: false,
    };
  }

  async transitionOrder(input: any): Promise<ProductionOrder> {
    const order = this.orders.get(input.orderId);
    if (!order) throw new Error("order_not_found");
    if (order.version !== input.expectedVersion) throw new Error("version_mismatch");

    order.status = input.nextStatus;
    order.version += 1;
    order.updatedAt = new Date().toISOString();
    return { ...order };
  }
}

const mockActorDeviceA: OrderActor = {
  actorType: "device",
  restaurantId: "rest-1",
  branchId: "branch-1",
  role: "device",
  actorId: "dev-1",
  deviceId: "dev-1",
  deviceType: "kiosk",
};

const mockActorKitchen1: OrderActor = {
  actorType: "staff",
  restaurantId: "rest-1",
  branchId: "branch-1",
  role: "kitchen",
  actorId: "user-k1",
  deviceId: null,
  deviceType: null,
};

const mockActorKitchen2: OrderActor = {
  actorType: "staff",
  restaurantId: "rest-1",
  branchId: "branch-2",
  role: "kitchen",
  actorId: "user-k2",
  deviceId: null,
  deviceType: null,
};

const dummyLogger: any = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

test("1. New order starts as awaiting_payment", async () => {
  const repo = new MockLifecycleRepository();
  const created = await repo.createOrder({
    actor: mockActorDeviceA,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    requestFingerprint: "a".repeat(64),
    source: "kiosk",
    quote: { serviceMode: "dine_in", language: "en", subtotal: "10.00", taxTotal: "0.00", discountTotal: "0.00", total: "10.00", menuId: "m1", menuVersion: 1, items: [] },
  });
  assert.equal(created.order.status, "awaiting_payment");
});

test("2 & 3. Successful captured payment changes status to paid and returns order.status = paid", async () => {
  const repo = new MockLifecycleRepository();
  const service = new OrderDomainService(repo as any, dummyLogger);
  const created = await repo.createOrder({
    actor: mockActorDeviceA,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    requestFingerprint: "a".repeat(64),
    source: "kiosk",
    quote: { serviceMode: "dine_in", language: "en", subtotal: "10.00", taxTotal: "0.00", discountTotal: "0.00", total: "10.00", menuId: "m1", menuVersion: 1, items: [] },
  });

  const payResult = await service.pay(mockActorDeviceA, created.order.id, {
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    method: "card_terminal",
  });

  assert.equal(payResult.paymentStatus, "captured");
  assert.equal(payResult.order.status, "paid");
});

test("4. Submit after payment changes paid -> submitted", async () => {
  const repo = new MockLifecycleRepository();
  const service = new OrderDomainService(repo as any, dummyLogger);
  const created = await repo.createOrder({
    actor: mockActorDeviceA,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    requestFingerprint: "a".repeat(64),
    source: "kiosk",
    quote: { serviceMode: "dine_in", language: "en", subtotal: "10.00", taxTotal: "0.00", discountTotal: "0.00", total: "10.00", menuId: "m1", menuVersion: 1, items: [] },
  });

  const payResult = await service.pay(mockActorDeviceA, created.order.id, {
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    method: "card_terminal",
  });

  const submitted = await service.submit(mockActorDeviceA, created.order.id, payResult.order.version);
  assert.equal(submitted.status, "submitted");
});

test("5. Submit before payment returns invalid_order_transition", async () => {
  const repo = new MockLifecycleRepository();
  const service = new OrderDomainService(repo as any, dummyLogger);
  const created = await repo.createOrder({
    actor: mockActorDeviceA,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    requestFingerprint: "a".repeat(64),
    source: "kiosk",
    quote: { serviceMode: "dine_in", language: "en", subtotal: "10.00", taxTotal: "0.00", discountTotal: "0.00", total: "10.00", menuId: "m1", menuVersion: 1, items: [] },
  });

  await assert.rejects(
    async () => service.submit(mockActorDeviceA, created.order.id, 1),
    (err: any) => err instanceof OrderDomainFailure && err.code === "invalid_order_transition"
  );
});

test("6 & 9. Failed/unsupported payment leaves order at awaiting_payment and submit is blocked", async () => {
  const repo = new MockLifecycleRepository();
  const service = new OrderDomainService(repo as any, dummyLogger);
  const created = await repo.createOrder({
    actor: mockActorDeviceA,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    requestFingerprint: "a".repeat(64),
    source: "kiosk",
    quote: { serviceMode: "dine_in", language: "en", subtotal: "10.00", taxTotal: "0.00", discountTotal: "0.00", total: "10.00", menuId: "m1", menuVersion: 1, items: [] },
  });

  await assert.rejects(
    async () => service.pay(mockActorDeviceA, created.order.id, {
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      method: "unsupported" as any,
    }),
    (err: any) => err instanceof OrderDomainFailure
  );

  const freshOrder = await service.get(mockActorDeviceA, created.order.id);
  assert.equal(freshOrder!.status, "awaiting_payment");
});

test("7 & 8. Duplicate payment retry returns same result without duplicating records", async () => {
  const repo = new MockLifecycleRepository();
  const service = new OrderDomainService(repo as any, dummyLogger);
  const created = await repo.createOrder({
    actor: mockActorDeviceA,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    requestFingerprint: "a".repeat(64),
    source: "kiosk",
    quote: { serviceMode: "dine_in", language: "en", subtotal: "10.00", taxTotal: "0.00", discountTotal: "0.00", total: "10.00", menuId: "m1", menuVersion: 1, items: [] },
  });

  const pay1 = await service.pay(mockActorDeviceA, created.order.id, {
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    method: "card_terminal",
  });
  assert.equal(pay1.duplicate, false);

  const pay2 = await service.pay(mockActorDeviceA, created.order.id, {
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    method: "card_terminal",
  });
  assert.equal(pay2.duplicate, true);
  assert.equal(pay2.paymentId, pay1.paymentId);
});

test("10, 11 & 12. Full lifecycle: awaiting_payment -> paid -> submitted & kitchen isolation", async () => {
  const repo = new MockLifecycleRepository();
  const service = new OrderDomainService(repo as any, dummyLogger);

  // Create order
  const created = await repo.createOrder({
    actor: mockActorDeviceA,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    requestFingerprint: "a".repeat(64),
    source: "kiosk",
    quote: { serviceMode: "dine_in", language: "en", subtotal: "10.00", taxTotal: "0.00", discountTotal: "0.00", total: "10.00", menuId: "m1", menuVersion: 1, items: [] },
  });
  assert.equal(created.order.status, "awaiting_payment");

  // Kitchen branch 1 before submit: empty
  const kitchenListBefore = await service.active(mockActorKitchen1, "kitchen");
  assert.equal(kitchenListBefore.length, 0);

  // Pay
  const paid = await service.pay(mockActorDeviceA, created.order.id, {
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    method: "card_terminal",
  });
  assert.equal(paid.order.status, "paid");

  // Submit
  const submitted = await service.submit(mockActorDeviceA, created.order.id, paid.order.version);
  assert.equal(submitted.status, "submitted");

  // Kitchen branch 1 after submit: contains order
  const kitchenBranch1 = await service.active(mockActorKitchen1, "kitchen");
  assert.equal(kitchenBranch1.length, 1);
  assert.equal(kitchenBranch1[0].id, created.order.id);

  // Kitchen branch 2 after submit: CANNOT see branch 1 order
  const kitchenBranch2 = await service.active(mockActorKitchen2, "kitchen");
  assert.equal(kitchenBranch2.length, 0);
});
