import test from "node:test";
import assert from "node:assert/strict";
import { OrderDomainService } from "./orderDomainService.js";
import type { OrderActor } from "../repositories/orderRepository.js";
import type { ProductionOrder } from "../../shared/orders.js";

class MockVisibilityRepository {
  private orders = new Map<string, ProductionOrder & { restaurantId: string; branchId: string; idempotencyKey: string; requestFingerprint: string }>();
  private idCounter = 1;

  async createOrder(input: any): Promise<{ order: ProductionOrder; duplicate: boolean }> {
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
      items: input.quote.items,
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
    order.status = "paid";
    order.paymentStatus = "captured";
    order.paymentMethod = input.method;
    order.version += 1;
    return { order: { ...order }, paymentId: "p1", paymentStatus: "captured", amount: order.total, change: "0.00", duplicate: false };
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

const CASHIER: OrderActor = {
  actorType: "staff", restaurantId: "rest-1", branchId: "branch-a", role: "cashier", actorId: "c1", deviceId: null, deviceType: null,
};
const KITCHEN_DEVICE: OrderActor = {
  actorType: "device", restaurantId: "rest-1", branchId: "branch-a", role: "device", actorId: "d1", deviceId: "d1", deviceType: "kitchen_display",
};
const OTHER_BRANCH_KITCHEN_DEVICE: OrderActor = {
  actorType: "device", restaurantId: "rest-1", branchId: "branch-b", role: "device", actorId: "d2", deviceId: "d2", deviceType: "kitchen_display",
};

const dummyLogger: any = { info: () => {}, warn: () => {}, error: () => {} };

test("1. Kitchen Display device role token is authorized to access kitchen active orders", async () => {
  const repo = new MockVisibilityRepository();
  const service = new OrderDomainService(repo as any, dummyLogger);

  const orders = await service.active(KITCHEN_DEVICE, "kitchen");
  assert.equal(Array.isArray(orders), true);
});

test("2. Kitchen list returns a submitted order from the same branch", async () => {
  const repo = new MockVisibilityRepository();
  const service = new OrderDomainService(repo as any, dummyLogger);

  const created = await service.create(CASHIER, {
    items: [{ productId: "p1", quantity: 1, modifierIds: [] }],
    serviceMode: "dine_in", language: "en", idempotencyKey: "11111111-1111-4111-8111-111111111111", source: "cashier",
  });
  const paid = await service.pay(CASHIER, created.order.id, { idempotencyKey: "22222222-2222-4222-8222-222222222222", method: "cash", amountReceived: "10.00" });
  await service.submit(CASHIER, created.order.id, paid.order.version);

  const kitchenOrders = await service.active(KITCHEN_DEVICE, "kitchen");
  assert.equal(kitchenOrders.length, 1);
  assert.equal(kitchenOrders[0].id, created.order.id);
  assert.equal(kitchenOrders[0].status, "submitted");
});

test("3. Paid but unsubmitted order is excluded from kitchen list", async () => {
  const repo = new MockVisibilityRepository();
  const service = new OrderDomainService(repo as any, dummyLogger);

  const created = await service.create(CASHIER, {
    items: [{ productId: "p1", quantity: 1, modifierIds: [] }],
    serviceMode: "dine_in", language: "en", idempotencyKey: "11111111-1111-4111-8111-111111111111", source: "cashier",
  });
  await service.pay(CASHIER, created.order.id, { idempotencyKey: "22222222-2222-4222-8222-222222222222", method: "cash", amountReceived: "10.00" });

  const kitchenOrders = await service.active(KITCHEN_DEVICE, "kitchen");
  assert.equal(kitchenOrders.length, 0);
});

test("4. Other-branch order is excluded from kitchen list", async () => {
  const repo = new MockVisibilityRepository();
  const service = new OrderDomainService(repo as any, dummyLogger);

  const created = await service.create(CASHIER, {
    items: [{ productId: "p1", quantity: 1, modifierIds: [] }],
    serviceMode: "dine_in", language: "en", idempotencyKey: "11111111-1111-4111-8111-111111111111", source: "cashier",
  });
  const paid = await service.pay(CASHIER, created.order.id, { idempotencyKey: "22222222-2222-4222-8222-222222222222", method: "cash", amountReceived: "10.00" });
  await service.submit(CASHIER, created.order.id, paid.order.version);

  const kitchenOrders = await service.active(OTHER_BRANCH_KITCHEN_DEVICE, "kitchen");
  assert.equal(kitchenOrders.length, 0);
});
