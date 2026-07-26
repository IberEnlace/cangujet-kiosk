import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase/client";
import type {
  DbOrderStatus,
  DeviceHealthRow,
  NotificationSettingsRow,
  OrderRow,
} from "../../../lib/supabase/database.types";
import { repositoryFailure, type RepositoryResult } from "./repositoryResult";

export const DEVICE_ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

export function formatDashboardCurrency(currency: string, value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}

export function formatDashboardOrderNumber(orderNumber: string) {
  const sections = orderNumber.split("-");
  const finalSection = sections[sections.length - 1]?.trim();
  return finalSection ? `#${finalSection}` : orderNumber;
}

export function formatDashboardItemCount(itemCount: number) {
  return `${itemCount} ${itemCount === 1 ? "item" : "items"}`;
}

export type DashboardOrder = {
  id: string;
  orderNumber: string;
  createdAt: string;
  itemCount: number;
  total: number;
  status: DbOrderStatus;
};
export type DashboardDeviceStatus = "Online" | "Offline" | "Unknown" | "Connected" | "Not Configured" | "Not Connected";
export type AdminDashboardData = {
  branchId: string;
  timezone: string;
  currency: string;
  todaySales: number;
  paidSalesToday: number;
  todayOrders: number;
  kioskName: string | null;
  kioskNumber: string | null;
  recentOrders: DashboardOrder[];
  kioskStatus: DashboardDeviceStatus;
  kitchenStatus: DashboardDeviceStatus;
  deviceConfigurationStatus: DashboardDeviceStatus;
  paymentTerminalStatus: "Not Configured";
  notificationsStatus: "Enabled" | "Disabled";
};

type OrderWithItems = Pick<OrderRow, "id" | "order_number" | "created_at" | "total" | "status" | "payment_status"> & {
  order_items?: { quantity: number }[] | null;
};

export function isCountedOrder(order: Pick<OrderRow, "status">) {
  return order.status !== "cancelled";
}

export function isSalesOrder(order: Pick<OrderRow, "status" | "payment_status">) {
  return order.status !== "cancelled"
    && order.payment_status !== "failed"
    && order.payment_status !== "refunded";
}

export function mapOrderStatus(status: DbOrderStatus): string {
  const labels: Record<DbOrderStatus, string> = {
    pending: "Incoming",
    confirmed: "Accepted",
    preparing: "Preparing",
    ready: "Ready",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  return labels[status];
}

export function isDeviceRecent(lastSeenAt: string, now = new Date(), thresholdMs = DEVICE_ONLINE_THRESHOLD_MS) {
  const seen = Date.parse(lastSeenAt);
  return Number.isFinite(seen) && now.getTime() - seen <= thresholdMs;
}

export function deviceConnectionStatus(device: DeviceHealthRow | undefined, now = new Date()): "Online" | "Offline" | "Unknown" {
  if (!device) return "Unknown";
  return isDeviceRecent(device.last_seen_at, now) ? "Online" : "Offline";
}

export function notificationsEnabled(settings: NotificationSettingsRow | null) {
  return Boolean(settings && [
    settings.daily_sales_report,
    settings.weekly_sales_summary,
    settings.order_failure_alerts,
    settings.payment_failure_alerts,
    settings.kiosk_offline_alerts,
    settings.kitchen_offline_alerts,
    settings.device_sync_failure_alerts,
  ].some(Boolean));
}

function timezoneOffsetMs(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Date.UTC(+values.year, +values.month - 1, +values.day, +values.hour, +values.minute, +values.second) - date.getTime();
}

function zonedMidnightUtc(year: number, month: number, day: number, timezone: string) {
  const guess = Date.UTC(year, month - 1, day);
  let result = guess - timezoneOffsetMs(new Date(guess), timezone);
  result = guess - timezoneOffsetMs(new Date(result), timezone);
  return new Date(result);
}

export function branchTodayRange(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const start = zonedMidnightUtc(+values.year, +values.month, +values.day, timezone);
  const nextLocalDate = new Date(Date.UTC(+values.year, +values.month - 1, +values.day + 1));
  const end = zonedMidnightUtc(nextLocalDate.getUTCFullYear(), nextLocalDate.getUTCMonth() + 1, nextLocalDate.getUTCDate(), timezone);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function mapDashboardData(input: {
  branchId: string; timezone: string; currency: string; orders: OrderWithItems[];
  devices: DeviceHealthRow[]; notificationSettings: NotificationSettingsRow | null; now?: Date;
}): AdminDashboardData {
  const now = input.now ?? new Date();
  const activeOrders = input.orders.filter(isCountedOrder);
  const kiosks = input.devices.filter(device => device.device_type === "kiosk")
    .sort((a, b) => Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at));
  const kitchen = input.devices.filter(device => device.device_type === "kitchen_display")
    .sort((a, b) => Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at))[0];
  const primaryKiosk = kiosks[0];
  return {
    branchId: input.branchId,
    timezone: input.timezone,
    currency: input.currency,
    todaySales: input.orders.filter(isSalesOrder).reduce((sum, order) => sum + Number(order.total), 0),
    paidSalesToday: input.orders
      .filter(order => order.status !== "cancelled" && order.payment_status === "paid")
      .reduce((sum, order) => sum + Number(order.total), 0),
    todayOrders: activeOrders.length,
    kioskName: kiosks.length > 1 ? `${kiosks.length} kiosks` : primaryKiosk?.device_name ?? null,
    kioskNumber: primaryKiosk?.device_id ?? null,
    recentOrders: activeOrders.slice(0, 5).map(order => ({
      id: order.id, orderNumber: order.order_number, createdAt: order.created_at,
      itemCount: (order.order_items ?? []).reduce((sum, item) => sum + Number(item.quantity), 0),
      total: Number(order.total), status: order.status,
    })),
    kioskStatus: deviceConnectionStatus(primaryKiosk, now),
    kitchenStatus: kitchen ? (isDeviceRecent(kitchen.last_seen_at, now) ? "Connected" : "Offline") : "Not Configured",
    deviceConfigurationStatus: input.devices.length ? "Connected" : "Not Connected",
    paymentTerminalStatus: "Not Configured",
    notificationsStatus: notificationsEnabled(input.notificationSettings) ? "Enabled" : "Disabled",
  };
}

export async function loadAdminDashboard(now = new Date()): Promise<RepositoryResult<AdminDashboardData>> {
  if (!supabase) return repositoryFailure("configuration", "Supabase is not configured.");
  const branchResult = await supabase.rpc("current_user_branch_id");
  if (branchResult.error || !branchResult.data) return repositoryFailure("unauthorized", "Your admin account is not assigned to a branch.", branchResult.error);
  const branchId = branchResult.data;
  const branchResultRow = await supabase.from("branches").select("timezone,currency").eq("id", branchId).single();
  if (branchResultRow.error || !branchResultRow.data) return repositoryFailure("network", "Branch settings could not be loaded.", branchResultRow.error);
  const range = branchTodayRange(branchResultRow.data.timezone, now);
  const [ordersResult, devicesResult, notificationsResult] = await Promise.all([
    supabase.from("orders")
      .select("id,order_number,created_at,total,status,payment_status")
      .eq("branch_id", branchId).gte("created_at", range.start).lt("created_at", range.end)
      .order("created_at", { ascending: false }),
    supabase.from("device_health").select("*").eq("branch_id", branchId).order("last_seen_at", { ascending: false }),
    supabase.from("notification_settings").select("*").eq("branch_id", branchId).maybeSingle(),
  ]);
  const error = ordersResult.error ?? devicesResult.error ?? notificationsResult.error;
  if (error) return repositoryFailure(error.code === "42501" ? "unauthorized" : "network", "Dashboard data could not be loaded.", error);
  const orders = (ordersResult.data ?? []) as OrderWithItems[];
  if (orders.length) {
    const itemResult = await supabase.from("order_items").select("order_id,quantity").in("order_id", orders.map(order => order.id));
    if (itemResult.error) return repositoryFailure(itemResult.error.code === "42501" ? "unauthorized" : "network", "Dashboard order items could not be loaded.", itemResult.error);
    const quantities = new Map<string, { quantity: number }[]>();
    for (const item of itemResult.data ?? []) {
      const current = quantities.get(item.order_id) ?? [];
      current.push({ quantity: item.quantity });
      quantities.set(item.order_id, current);
    }
    for (const order of orders) order.order_items = quantities.get(order.id) ?? [];
  }
  return {
    ok: true, source: "supabase",
    data: mapDashboardData({
      branchId, timezone: branchResultRow.data.timezone, currency: branchResultRow.data.currency,
      orders,
      devices: devicesResult.data ?? [], notificationSettings: notificationsResult.data, now,
    }),
  };
}

export function subscribeToAdminDashboard(branchId: string, onOrders: () => void, onDevices: () => void, onNotifications: () => void) {
  const client = supabase;
  if (!client) return () => undefined;
  const channel: RealtimeChannel = client.channel(`admin-dashboard:${branchId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `branch_id=eq.${branchId}` }, onOrders)
    .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, onOrders)
    .on("postgres_changes", { event: "*", schema: "public", table: "device_health", filter: `branch_id=eq.${branchId}` }, onDevices)
    .on("postgres_changes", { event: "*", schema: "public", table: "notification_settings", filter: `branch_id=eq.${branchId}` }, onNotifications)
    .subscribe();
  return () => { void client.removeChannel(channel); };
}
