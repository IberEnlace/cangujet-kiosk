import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { OperationalOrder } from "./kitchenOrderService";
import { isKitchenPaymentEligible, mergeOrders } from "./kitchenOrderService";
import { NEXT_STATUS } from "./orderStatusService";

const migration = readFileSync("supabase/migrations/202607230004_realtime_order_workflow.sql", "utf8");

test("database lifecycle exposes only forward operational transitions", () => {
  assert.deepEqual(NEXT_STATUS, { pending: "confirmed", confirmed: "preparing", preparing: "ready", ready: "completed" });
  assert.match(migration, /illegal_status_transition/);
  assert.doesNotMatch(JSON.stringify(NEXT_STATUS), /completed.*pending|ready.*preparing/);
});

test("transition RPC rejects anonymous callers and records history with timestamps", () => {
  assert.match(migration, /auth\.uid\(\) is null.*authentication_required/s);
  assert.match(migration, /insert into public\.order_status_history/);
  for (const column of ["confirmed_at", "preparing_at", "ready_at", "completed_at", "cancelled_at"]) assert.match(migration, new RegExp(column));
});

test("unpaid kitchen eligibility is production-safe by default and explicit in demo", () => {
  assert.equal(isKitchenPaymentEligible("unpaid", false), false);
  assert.equal(isKitchenPaymentEligible("unpaid", true), true);
  assert.equal(isKitchenPaymentEligible("paid", false), true);
  assert.equal(isKitchenPaymentEligible("pending", false), false);
  assert.equal(isKitchenPaymentEligible("failed", false), false);
  assert.equal(isKitchenPaymentEligible("refunded", false), false);
  assert.match(migration, /v_order\.status = 'pending' and p_next_status = 'confirmed' and v_allow_unpaid/);
  assert.match(migration, /v_order\.payment_status <> 'paid' and not v_allow_unpaid/);
});

test("realtime merge deduplicates updates and sorts deterministically", () => {
  const first = order("a", "2026-01-01T10:00:00Z", "pending");
  const updated = order("a", "2026-01-01T10:00:00Z", "confirmed");
  const second = order("b", "2026-01-01T09:00:00Z", "pending");
  const merged = mergeOrders([first], [updated, second]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map(value => value.id), ["b", "a"]);
  assert.equal(merged[1].status, "confirmed");
});

test("public board and tracking RPCs return sanitized scoped fields", () => {
  const boardReturn = migration.match(/create function public\.get_public_order_board[\s\S]*?language sql/)?.[0] ?? "";
  assert.match(boardReturn, /order_number text, public_status text, created_at timestamptz, ready_at timestamptz/);
  assert.doesNotMatch(boardReturn, /customer_note|payment_status|created_by|subtotal/);
  assert.match(migration, /o\.idempotency_key::text = p_tracking_token/);
  assert.match(migration, /public_order_refresh_signal/);
});

test("realtime publication additions are duplicate-safe", () => {
  assert.match(migration, /alter publication supabase_realtime add table public\.orders/);
  assert.match(migration, /when duplicate_object then null/g);
});

function order(id: string, created_at: string, status: OperationalOrder["status"]): OperationalOrder {
  return { id, created_at, updated_at: created_at, branch_id: "branch", order_number: id, order_type: "dine_in", status,
    payment_status: "unpaid", subtotal: 1, tax: 0, total: 1, currency: "EUR", customer_note: null, source: "kiosk",
    created_by: null, confirmed_at: null, preparing_at: null, ready_at: null, completed_at: null, cancelled_at: null,
    idempotency_key: null, items: [] };
}
