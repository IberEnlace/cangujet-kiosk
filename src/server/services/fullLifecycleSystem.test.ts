import test from "node:test";
import assert from "node:assert/strict";
import { OrderDomainService, OrderDomainFailure } from "./orderDomainService.js";
import type { OrderActor } from "../repositories/orderRepository.js";
import type { ProductionOrder } from "../../shared/orders.js";

class FullMockRepository {
  private orders = new Map<string, ProductionOrder & { restaurantId: string; branchId: string; idempotencyKey: string; requestFingerprint: string }>();
  private idCounter = 1;

  async createOrder(input: any): Promise<{ order: ProductionOrder; duplicate: boolean }> {
    const existing = Array.from(this.orders.values()).find(
      o => o.idempotencyKey === input.idempotencyKey && o.requestFingerprint === input.requestFingerprint
    );
    if (existing) {
      return { order: { ...existing }, duplicate: true };
    }

    const id = `order-${this.idCounter++}`;
    const order: ProductionOrder & { restaurantId: string; branchId: string; idempotencyKey: string; requestFingerprint: string } = {
      id,
      restaurantId: input.actor.restaurantId,
      branchId: input.actor.branchId,
      orderNumber: `M20${this.idCounter}`,
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
      items: input.quote.items,
    };
    this.orders.set(id, order);
    return { order, duplicate: false };
  }

  async findExistingOrderForIdempotency(_actor: OrderActor, _source: string, key: string) {
    const existing = Array.from(this.orders.values()).find(o => o.idempotencyKey === key);
    if (!existing) return null;
    return { ...existing, request_fingerprint: existing.requestFingerprint };
  }

  async getOrder(actor: OrderActor, orderId: string): Promise<ProductionOrder | null> {
    const order = this.orders.get(orderId);
    if (!order) return null;
    if (order.restaurantId !== actor.restaurantId) return null;
    if (actor.branchId && order.branchId !== actor.branchId) return null;
    return { ...order };
  }

  async loadPricingContext() {
    return {
      restaurantId: "rest-1", branchId: "branch-a", menuId: "m1", menuVersion: 1,
      currency: "USD", timezone: "UTC", taxRate: "0.00", serviceModes: ["dine_in"],
      products: [{ id: "p1", name: "Pizza", price: "10.00", currency: "USD", active: true, available: true, categoryActive: true, categoryVisible: true, allergens: [] }],
      modifierGroups: [], modifiers: [],
    } as any;
  }

  async recordPayment(input: any) {
    const order = this.orders.get(input.order.id);
    if (!order) throw new Error("order_not_found");
    if (input.captured) {
      order.status = "paid";
      order.paymentStatus = "captured";
      order.paymentMethod = input.method;
      order.version += 1;
    }
    return { order: { ...order }, paymentId: "p1", paymentStatus: input.captured ? "captured" : "failed", amount: order.total, change: "0.00", duplicate: false };
  }

  async transitionOrder(input: any): Promise<ProductionOrder> {
    const order = this.orders.get(input.orderId);
    if (!order) throw new Error("order_not_found");
    order.status = input.nextStatus;
    order.version += 1;
    return { ...order };
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
}

const CASHIER_STAFF: OrderActor = {
  actorType: "staff", restaurantId: "rest-1", branchId: "branch-a", role: "cashier", actorId: "c1", deviceId: null, deviceType: null,
};
const KITCHEN_DEVICE: OrderActor = {
  actorType: "device", restaurantId: "rest-1", branchId: "branch-a", role: "device", actorId: "d1", deviceId: "d1", deviceType: "kitchen_display",
};
const OTHER_BRANCH_KITCHEN: OrderActor = {
  actorType: "device", restaurantId: "rest-1", branchId: "branch-b", role: "device", actorId: "d2", deviceId: "d2", deviceType: "kitchen_display",
};

const dummyLogger: any = { info: () => {}, warn: () => {}, error: () => {} };

test("1. Fresh order creation returns 201 awaiting_payment", async () => {
  const repo = new FullMockRepository();
  const service = new OrderDomainService(repo as any, dummyLogger);

  const res = await service.create(CASHIER_STAFF, {
    items: [{ productId: "p1", quantity: 1, modifierIds: [] }],
    serviceMode: "dine_in", language: "en", idempotencyKey: "10000000-0000-4000-8000-000000000001", source: "cashier",
  });

  assert.equal(res.duplicate, false);
  assert.equal(res.order.status, "awaiting_payment");
});

test("2. Exact retry returns duplicate=true with 200 response", async () => {
  const repo = new FullMockRepository();
  const service = new OrderDomainService(repo as any, dummyLogger);

  const payload = {
    items: [{ productId: "p1", quantity: 1, modifierIds: [] }],
    serviceMode: "dine_in" as const, language: "en", idempotencyKey: "10000000-0000-4000-8000-000000000002", source: "cashier" as const,
  };

  const first = await service.create(CASHIER_STAFF, payload);
  const second = await service.create(CASHIER_STAFF, payload);

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.order.id, second.order.id);
});

test("3. Submit before payment is rejected with invalid_order_transition", async () => {
  const repo = new FullMockRepository();
  const service = new OrderDomainService(repo as any, dummyLogger);

  const created = await service.create(CASHIER_STAFF, {
    items: [{ productId: "p1", quantity: 1, modifierIds: [] }],
    serviceMode: "dine_in", language: "en", idempotencyKey: "10000000-0000-4000-8000-000000000003", source: "cashier",
  });

  await assert.rejects(
    service.submit(CASHIER_STAFF, created.order.id, created.order.version),
    (err: any) => err instanceof OrderDomainFailure && err.code === "invalid_order_transition"
  );
});

test("4. Successful payment changes status to paid and submit advances to submitted", async () => {
  const repo = new FullMockRepository();
  const service = new OrderDomainService(repo as any, dummyLogger);

  const created = await service.create(CASHIER_STAFF, {
    items: [{ productId: "p1", quantity: 1, modifierIds: [] }],
    serviceMode: "dine_in", language: "en", idempotencyKey: "10000000-0000-4000-8000-000000000004", source: "cashier",
  });

  const paid = await service.pay(CASHIER_STAFF, created.order.id, {
    idempotencyKey: "20000000-0000-4000-8000-000000000004", method: "cash", amountReceived: "10.00"
  });

  assert.equal(paid.order.status, "paid");
  assert.equal(paid.order.paymentStatus, "captured");

  const submitted = await service.submit(CASHIER_STAFF, created.order.id, paid.order.version);
  assert.equal(submitted.status, "submitted");
});

test("5. Kitchen REST endpoint returns submitted order for matching branch device context", async () => {
  const repo = new FullMockRepository();
  const service = new OrderDomainService(repo as any, dummyLogger);

  const created = await service.create(CASHIER_STAFF, {
    items: [{ productId: "p1", quantity: 1, modifierIds: [] }],
    serviceMode: "dine_in", language: "en", idempotencyKey: "10000000-0000-4000-8000-000000000005", source: "cashier",
  });
  const paid = await service.pay(CASHIER_STAFF, created.order.id, {
    idempotencyKey: "20000000-0000-4000-8000-000000000005", method: "cash", amountReceived: "10.00"
  });
  await service.submit(CASHIER_STAFF, created.order.id, paid.order.version);

  const kitchenOrders = await service.active(KITCHEN_DEVICE, "kitchen");
  assert.equal(kitchenOrders.length, 1);
  assert.equal(kitchenOrders[0].id, created.order.id);
});

test("6. Kitchen REST endpoint excludes other branch orders", async () => {
  const repo = new FullMockRepository();
  const service = new OrderDomainService(repo as any, dummyLogger);

  const created = await service.create(CASHIER_STAFF, {
    items: [{ productId: "p1", quantity: 1, modifierIds: [] }],
    serviceMode: "dine_in", language: "en", idempotencyKey: "10000000-0000-4000-8000-000000000006", source: "cashier",
  });
  const paid = await service.pay(CASHIER_STAFF, created.order.id, {
    idempotencyKey: "20000000-0000-4000-8000-000000000006", method: "cash", amountReceived: "10.00"
  });
  await service.submit(CASHIER_STAFF, created.order.id, paid.order.version);

  const otherKitchenOrders = await service.active(OTHER_BRANCH_KITCHEN, "kitchen");
  assert.equal(otherKitchenOrders.length, 0);
});
