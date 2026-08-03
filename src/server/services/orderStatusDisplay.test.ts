import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import express from "express";
import type { ProductionOrder } from "../../shared/orders";
import { SupabaseOrderRepository, type OrderActor } from "../repositories/orderRepository";
import { createOrderRouter } from "../routes/orderRoutes";
import { OrderDomainFailure, OrderDomainService } from "./orderDomainService";

const BRANCH_DEVICE: OrderActor = {
  actorType: "device",
  actorId: "kiosk-a",
  restaurantId: "restaurant-a",
  branchId: "branch-a",
  deviceId: "kiosk-a",
  role: "device",
  deviceType: "kiosk",
};

test("order status display accepts a branch kiosk credential and returns only a customer-safe projection", async () => {
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  const repository = new SupabaseOrderRepository({
    rpc: async (name: string, input: Record<string, unknown>) => {
      calls.push({ name, input });
      return {
        data: [
          order("submitted", "M100"),
          order("accepted", "M101"),
          order("preparing", "M102"),
          order("ready", "M103"),
          order("completed", "M104"),
        ],
        error: null,
      };
    },
  } as any);
  const service = new OrderDomainService(repository, {} as any);

  const result = await service.display(BRANCH_DEVICE);

  assert.deepEqual(calls, [{
    name: "list_production_orders",
    input: {
      p_restaurant_id: "restaurant-a",
      p_branch_id: "branch-a",
      p_audience: "display",
    },
  }]);
  assert.deepEqual(result.map(value => [value.orderNumber, value.status]), [
    ["M102", "preparing"],
    ["M103", "ready"],
    ["M104", "completed"],
  ]);
  assert.deepEqual(Object.keys(result[0]).sort(), ["completedAt", "createdAt", "orderNumber", "readyAt", "status"]);
  assert.equal("items" in result[0], false);
  assert.equal("customerReference" in result[0], false);
});

test("order status display rejects a staff role that did not authenticate as an admin", async () => {
  const service = new OrderDomainService({} as any, {} as any);
  await assert.rejects(
    service.display({ ...BRANCH_DEVICE, actorType: "staff", role: "cashier", deviceId: null, deviceType: null }),
    (error: unknown) => error instanceof OrderDomainFailure && error.status === 403,
  );
});

test("GET /orders/display returns the kiosk branch projection with non-cacheable network semantics", async () => {
  const rows = [{
    orderNumber: "M103",
    status: "ready" as const,
    createdAt: "2026-08-03T12:00:00.000Z",
    readyAt: "2026-08-03T12:02:00.000Z",
    completedAt: null,
  }];
  const fake = {
    authenticate: async (token: string) => {
      assert.equal(token, "kiosk-device-token");
      return BRANCH_DEVICE;
    },
    display: async (actor: OrderActor) => {
      assert.equal(actor.branchId, "branch-a");
      return rows;
    },
  } as unknown as OrderDomainService;
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createOrderRouter(() => fake));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not expose a TCP port.");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/orders/display`, {
      headers: { authorization: "Bearer kiosk-device-token" },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(response.headers.get("etag"), null);
    assert.deepEqual(await response.json(), rows);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("display SQL and realtime source use the current lifecycle and exact branch scope", () => {
  const migration = readFileSync("supabase/migrations/202608030002_order_status_display_data_source.sql", "utf8");
  const realtime = readFileSync("src/app/services/supabase/realtimeOrderService.ts", "utf8");
  const hook = readFileSync("src/app/hooks/useRealtimeOrders.ts", "utf8");

  assert.match(migration, /p_audience = 'display'[\s\S]*o\.status in \('preparing', 'ready'\)/);
  assert.match(migration, /o\.status = 'completed'[\s\S]*interval '5 minutes'/);
  assert.match(migration, /o\.restaurant_id = p_restaurant_id/);
  assert.match(migration, /p_branch_id is null or o\.branch_id = p_branch_id/);
  assert.doesNotMatch(migration.match(/p_audience = 'display'[\s\S]*?\)\)/)?.[0] ?? "", /submitted|accepted|pending|confirmed/);
  assert.match(realtime, /table: "order_display_refresh_signals"/);
  assert.match(realtime, /filter: `branch_id=eq\.\$\{input\.branchId\}`/);
  const displayHook = hook.match(/export function usePublicOrderBoard\(\)[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(displayHook, /subscribeToOrderDisplaySignal/);
  assert.doesNotMatch(displayHook, /subscribeToPublicBoardSignal/);
});

function order(status: ProductionOrder["status"], orderNumber: string): ProductionOrder {
  return {
    id: `${orderNumber}-id`,
    orderNumber,
    status,
    paymentStatus: "captured",
    paymentMethod: "card_terminal",
    source: "kiosk",
    customerReference: "a".repeat(48),
    version: 1,
    notes: null,
    menuId: "menu-a",
    menuVersion: 1,
    currency: "EUR",
    subtotal: "10.00",
    taxTotal: "0.80",
    discountTotal: "0.00",
    total: "10.80",
    serviceMode: "dine_in",
    language: "en",
    items: [],
    placedAt: "2026-08-03T12:00:00.000Z",
    acceptedAt: null,
    preparingAt: status === "preparing" ? "2026-08-03T12:01:00.000Z" : null,
    readyAt: status === "ready" ? "2026-08-03T12:02:00.000Z" : null,
    completedAt: status === "completed" ? "2026-08-03T12:03:00.000Z" : null,
    cancelledAt: null,
    createdAt: "2026-08-03T12:00:00.000Z",
    updatedAt: "2026-08-03T12:03:00.000Z",
  };
}
