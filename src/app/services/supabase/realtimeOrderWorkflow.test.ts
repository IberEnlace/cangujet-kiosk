import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ProductionOrder } from "../../../shared/orders";
import { reconcile } from "../../hooks/useRealtimeOrders";
import { getKitchenAction, NEXT_STATUS } from "./orderStatusService";

const migration = readFileSync("supabase/migrations/202607300003_production_order_management.sql", "utf8");
const kitchenDisplay = readFileSync("src/app/pages/KitchenDisplay.tsx", "utf8");
const realtimeHook = readFileSync("src/app/hooks/useRealtimeOrders.ts", "utf8");

test("production lifecycle exposes only forward kitchen transitions", () => {
  assert.deepEqual(NEXT_STATUS, {
    submitted: "accepted", accepted: "preparing", preparing: "ready", ready: "completed",
  });
  assert.deepEqual(getKitchenAction("submitted"), { label: "Accept Order", nextStatus: "accepted" });
  assert.deepEqual(getKitchenAction("accepted"), { label: "Start Preparing", nextStatus: "preparing" });
  assert.deepEqual(getKitchenAction("preparing"), { label: "Mark as Ready", nextStatus: "ready" });
  assert.deepEqual(getKitchenAction("ready"), { label: "Complete Order", nextStatus: "completed" });
  assert.equal(getKitchenAction("completed"), null);
  assert.doesNotMatch(JSON.stringify(NEXT_STATUS), /completed.*submitted|ready.*preparing/);
});

test("version-aware reconciliation deduplicates and ignores out-of-order events", () => {
  const stale = order("a", 1, "submitted");
  const current = order("a", 3, "preparing");
  const second = order("b", 1, "accepted");
  const result = reconcile([current], [stale, second]);
  assert.equal(result.length, 2);
  assert.equal(result.find(value => value.id === "a")?.status, "preparing");
  assert.equal(result.find(value => value.id === "a")?.version, 3);
});

test("kitchen uses API reconciliation, scoped realtime signals, polling, and safe rollback", () => {
  assert.match(realtimeHook, /kitchenOrderService\.list/);
  assert.match(realtimeHook, /subscribeToBranchOrders/);
  assert.match(realtimeHook, /setInterval\(\(\) => void fetchCurrent\(\), RECONCILIATION_MS\)/);
  assert.match(realtimeHook, /setLive\(before\)/);
  assert.match(realtimeHook, /order_conflict/);
  assert.match(kitchenDisplay, /disabled=\{pending\}/);
});

test("database transitions record events, timestamps, and optimistic versions", () => {
  assert.match(migration, /if v_order\.version <> p_expected_version then raise exception 'order_conflict'/);
  assert.match(migration, /insert into public\.order_status_events/);
  for (const column of ["placed_at", "accepted_at", "preparing_at", "ready_at", "completed_at", "cancelled_at"]) {
    assert.match(migration, new RegExp(column));
  }
});

test("tracking exposes sanitized fields and realtime refetch hints only", () => {
  const trackingFunction = migration.match(/create or replace function public\.get_production_order_tracking[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(trackingFunction, /orderNumber/);
  assert.match(trackingFunction, /status/);
  assert.doesNotMatch(trackingFunction, /restaurantId|branchId|deviceId|subtotal|payment/);
  assert.match(realtimeHook, /subscribeToPublicBoardSignal/);
  assert.match(realtimeHook, /setInterval\(\(\) => void fetchCurrent\(\), 10_000\)/);
});

test("realtime publications and legacy RPC retirement are duplicate safe", () => {
  assert.match(migration, /drop function if exists public\.transition_order_status/);
  assert.match(migration, /drop function if exists public\.get_order_tracking/);
  assert.match(migration, /alter publication supabase_realtime add table public\.orders/);
  assert.match(migration, /when duplicate_object then null/g);
});

function order(id: string, version: number, status: ProductionOrder["status"]): ProductionOrder {
  return {
    id, version, status, orderNumber: id.toUpperCase(), paymentStatus: "captured",
    paymentMethod: "card_terminal", source: "kiosk", customerReference: "a".repeat(48),
    notes: null, menuId: "menu", menuVersion: 1, currency: "EUR", subtotal: "1.00",
    taxTotal: "0.08", discountTotal: "0.00", total: "1.08", serviceMode: "dine_in",
    language: "en", items: [], placedAt: "2026-07-30T10:00:00.000Z", acceptedAt: null,
    preparingAt: null, readyAt: null, completedAt: null, cancelledAt: null,
    createdAt: `2026-07-30T10:00:0${id === "a" ? "0" : "1"}.000Z`,
    updatedAt: "2026-07-30T10:00:00.000Z",
  };
}
