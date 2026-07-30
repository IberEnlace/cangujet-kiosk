import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync("supabase/migrations/202607300003_production_order_management.sql", "utf8");

test("production order migration defines the complete lifecycle and append-only event model", () => {
  for (const status of [
    "draft", "awaiting_payment", "paid", "submitted", "accepted", "preparing",
    "ready", "completed", "cancelled", "payment_failed", "rejected",
  ]) assert.match(sql, new RegExp(`'${status}'`));
  for (const table of [
    "order_item_modifiers", "order_payments", "order_status_events", "order_counters",
  ]) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(sql, /insert into public\.order_status_events/g);
  assert.match(sql, /new\.version = old\.version \+ 1/);
});

test("number allocation is atomic, branch-local, business-date aware, and timezone based", () => {
  assert.match(sql, /primary key\(branch_id, business_date\)/);
  assert.match(sql, /now\(\) at time zone v_branch\.timezone/);
  assert.match(sql, /on conflict \(branch_id, business_date\)[\s\S]*current_value \+ 1/);
  assert.match(sql, /orders_branch_business_number_uidx/);
  assert.doesNotMatch(sql, /Math\.random|Date\.now/);
});

test("pricing snapshots and exact money constraints are persisted server-side", () => {
  assert.match(sql, /numeric\(14,2\)/);
  assert.match(sql, /product_name_snapshot/);
  assert.match(sql, /modifier_name_snapshot/);
  assert.match(sql, /tax_rate/);
  assert.match(sql, /orders_authoritative_total_check/);
  assert.match(sql, /order_items_line_total_check/);
  assert.match(sql, /p_quote->>'subtotal'/);
});

test("RLS permits only scoped reads while writes and privileged RPCs remain server-only", () => {
  assert.match(sql, /restaurant staff read scoped orders/);
  assert.match(sql, /sm\.restaurant_id = orders\.restaurant_id/);
  assert.match(sql, /sm\.branch_id = orders\.branch_id/);
  assert.match(sql, /revoke insert, update, delete, truncate, references, trigger on public\.orders/);
  assert.match(sql, /grant execute on function public\.create_production_order[\s\S]*to service_role/);
  assert.match(sql, /revoke all on function public\.create_production_order[\s\S]*from public, anon, authenticated/);
});

test("legacy client mutation RPCs are retired and production operations are idempotent", () => {
  assert.match(sql, /drop function if exists public\.create_order/);
  assert.match(sql, /drop function if exists public\.transition_order_status/);
  assert.match(sql, /orders_actor_idempotency_uidx/);
  assert.match(sql, /unique\(order_id, idempotency_key\)/);
  assert.match(sql, /request_fingerprint/);
  assert.match(sql, /idempotency_conflict/);
});

test("active order tables are realtime-published with duplicate-safe deployment", () => {
  for (const table of ["orders", "order_items", "order_item_modifiers", "order_payments", "order_status_events"]) {
    assert.match(sql, new RegExp(`alter publication supabase_realtime add table public\\.${table}`));
  }
  assert.match(sql, /exception when duplicate_object then null/g);
});

test("status type conversion preserves dependent triggers and skips an already-migrated schema", () => {
  assert.match(sql, /v_status_type <> 'public\.order_lifecycle_status'/);
  assert.match(sql, /pg_get_triggerdef\(status_trigger\.oid, true\)/);
  assert.match(sql, /dependency\.classid = 'pg_trigger'::regclass/);
  assert.match(sql, /dependency\.refobjsubid = v_status_attnum/);
  assert.match(sql, /drop trigger %I on public\.orders/);
  assert.match(sql, /execute v_trigger\.trigger_definition/);
  assert.match(sql, /alter column status type public\.order_lifecycle_status/);
  assert.doesNotMatch(sql, /else 'cancelled'/);
});

test("migration reruns preserve history and recreate scoped policies idempotently", () => {
  assert.match(sql, /to_regclass\('public\.order_status_history'\) is not null/);
  assert.match(sql, /drop table if exists public\.order_status_history cascade/);
  for (const policy of [
    "restaurant staff read scoped orders",
    "restaurant staff read scoped order items",
    "restaurant staff read scoped modifiers",
    "restaurant staff read scoped payments",
    "restaurant staff read scoped status events",
  ]) {
    assert.match(sql, new RegExp(`drop policy if exists "${policy}"`));
  }
});
