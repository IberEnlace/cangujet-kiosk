import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { DeviceHealthRow, NotificationSettingsRow } from "../../../lib/supabase/database.types";
import {
  branchTodayRange,
  deviceConnectionStatus,
  formatDashboardCurrency,
  formatDashboardItemCount,
  formatDashboardOrderNumber,
  mapDashboardData,
  mapOrderStatus,
  notificationsEnabled,
} from "./adminDashboardService";

const order = (overrides: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(), order_number: "A-1", created_at: "2026-07-26T10:00:00Z",
  total: 12.5, status: "completed" as const, payment_status: "paid" as const,
  order_items: [{ quantity: 2 }, { quantity: 1 }], ...overrides,
});
const device = (last_seen_at: string): DeviceHealthRow => ({
  device_id: "KSK-9", branch_id: "branch-a", device_type: "kiosk", device_name: "Lobby Kiosk",
  last_seen_at, last_sync_at: null, sync_failure_code: null, sync_retry_count: 0,
  sync_target: null, status: "online", offline_incident_started_at: null,
  offline_alerted_at: null, recovered_at: null, updated_at: last_seen_at,
});
const settings = (enabled: boolean): NotificationSettingsRow => ({
  id: "n", branch_id: "branch-a", primary_email: "ops@example.com", secondary_email: null,
  daily_report_time: "22:00", daily_sales_report: enabled, weekly_sales_summary: false,
  order_failure_alerts: false, payment_failure_alerts: false, kiosk_offline_alerts: false,
  kitchen_offline_alerts: false, device_sync_failure_alerts: false, created_at: "", updated_at: "",
});
const mapped = (orders: ReturnType<typeof order>[], devices: DeviceHealthRow[] = [], notificationSettings: NotificationSettingsRow | null = null) =>
  mapDashboardData({ branchId: "branch-a", timezone: "Europe/Istanbul", currency: "TRY", orders, devices, notificationSettings, now: new Date("2026-07-26T10:01:00Z") });

test("maps valid ordered value and zero sales", () => {
  assert.equal(mapped([order(), order({ total: 7.5 })]).todaySales, 20);
  assert.equal(mapped([]).todaySales, 0);
  assert.match(formatDashboardCurrency("EUR", mapped([]).todaySales), /€0[.,]00/);
});

test("unpaid and pending valid orders are included", () => {
  const result = mapped([
    order({ payment_status: "unpaid", total: 4 }),
    order({ payment_status: "pending", total: 6 }),
  ]);
  assert.equal(result.todaySales, 10);
});

test("active and completed orders are included", () => {
  const result = mapped([
    order({ status: "awaiting_payment", payment_status: "unpaid", total: 4 }),
    order({ status: "preparing", payment_status: "pending", total: 6 }),
    order({ status: "completed", payment_status: "paid", total: 8 }),
  ]);
  assert.equal(result.todaySales, 18);
  assert.equal(result.paidSalesToday, 8);
});

test("cancelled, failed, and fully refunded orders are excluded from sales", () => {
  const result = mapped([
    order({ status: "cancelled" }), order({ payment_status: "failed" }),
    order({ payment_status: "refunded" }), order({ total: 4 }),
  ]);
  assert.equal(result.todaySales, 4);
  assert.equal(result.todayOrders, 3);
});

test("recent orders are limited to five and sum item quantities", () => {
  const result = mapped(Array.from({ length: 7 }, (_, index) => order({ id: String(index), order_number: String(index) })));
  assert.equal(result.recentOrders.length, 5);
  assert.equal(result.recentOrders[0].itemCount, 3);
});

test("status labels reuse database statuses", () => {
  assert.equal(mapOrderStatus("submitted"), "Incoming");
  assert.equal(mapOrderStatus("accepted"), "Accepted");
  assert.equal(mapOrderStatus("preparing"), "Preparing");
});

test("dashboard displays only the final public order-number section", () => {
  assert.equal(formatDashboardOrderNumber("MAIN-260726-000012"), "#000012");
});

test("dashboard item count uses singular and plural labels", () => {
  assert.equal(formatDashboardItemCount(1), "1 item");
  assert.equal(formatDashboardItemCount(2), "2 items");
});

test("no kiosk, stale kiosk, and recent kiosk map correctly", () => {
  const now = new Date("2026-07-26T10:01:00Z");
  assert.equal(deviceConnectionStatus(undefined, now), "Unknown");
  assert.equal(deviceConnectionStatus(device("2026-07-26T09:00:00Z"), now), "Offline");
  assert.equal(deviceConnectionStatus(device("2026-07-26T10:00:00Z"), now), "Online");
  assert.equal(mapped([]).kioskName, null);
});

test("notification settings require at least one enabled type", () => {
  assert.equal(notificationsEnabled(null), false);
  assert.equal(notificationsEnabled(settings(false)), false);
  assert.equal(notificationsEnabled(settings(true)), true);
});

test("branch day boundaries honor timezone", () => {
  assert.deepEqual(branchTodayRange("Europe/Istanbul", new Date("2026-07-26T12:00:00Z")), {
    start: "2026-07-25T21:00:00.000Z", end: "2026-07-26T21:00:00.000Z",
  });
});

test("production query stays branch-scoped and introduces no mock fallback", () => {
  const source = readFileSync(new URL("./adminDashboardService.ts", import.meta.url), "utf8");
  assert.match(source, /\.from\("orders"\)[\s\S]*?\.eq\("branch_id", branchId\)/);
  assert.doesNotMatch(source, /dashboardStats|adminMockData|Morrow Kiosk 01|KSK-001/);
});
