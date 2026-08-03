import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type { ProductionOrder } from "../../shared/orders";
import { SupabaseOrderRepository, type OrderActor } from "../repositories/orderRepository";

const ACTOR: OrderActor = {
  actorType: "staff",
  actorId: "cashier-1",
  restaurantId: "restaurant-1",
  branchId: "branch-1",
  deviceId: null,
  role: "cashier",
  deviceType: null,
};

test("pending-order repository preserves a direct JSONB array returned by PostgREST", async () => {
  const pending = order("M110");
  const calls: unknown[] = [];
  const repository = new SupabaseOrderRepository({
    rpc: async (name: string, parameters: unknown) => {
      calls.push({ name, parameters });
      return { data: [pending], error: null };
    },
  } as unknown as SupabaseClient<Database>);

  const result = await repository.listPendingCashierOrders(ACTOR);
  assert.deepEqual(result, [pending]);
  assert.deepEqual(calls, [{
    name: "list_pending_cashier_orders",
    parameters: { p_restaurant_id: "restaurant-1", p_branch_id: "branch-1" },
  }]);
});

test("repository still unwraps the legacy RETURNS TABLE(result jsonb) envelope", async () => {
  const pending = order("M110");
  const repository = new SupabaseOrderRepository({
    rpc: async () => ({ data: [{ result: [pending] }], error: null }),
  } as unknown as SupabaseClient<Database>);
  assert.deepEqual(await repository.listPendingCashierOrders(ACTOR), [pending]);
});

function order(orderNumber: string): ProductionOrder {
  return {
    id: "38f1edc2-220c-4e6a-a296-9e46bcb07384",
    orderNumber,
    status: "awaiting_payment",
    paymentStatus: "pending",
    paymentMethod: "pay_at_cashier",
    source: "kiosk",
    customerReference: "a".repeat(48),
    version: 2,
    notes: null,
    menuId: "menu-1",
    menuVersion: 1,
    currency: "EUR",
    subtotal: "28.50",
    taxTotal: "2.28",
    discountTotal: "0.00",
    total: "30.78",
    serviceMode: "dine_in",
    language: "en",
    items: [],
    placedAt: null,
    acceptedAt: null,
    preparingAt: null,
    readyAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: "2026-08-03T12:03:50.451621+00:00",
    updatedAt: "2026-08-03T12:03:50.977171+00:00",
  };
}
