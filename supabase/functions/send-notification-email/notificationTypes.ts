export const notificationTypes = [
  "test", "daily_sales_report", "weekly_sales_summary", "order_failure", "payment_failure",
  "kiosk_offline", "kitchen_display_offline", "device_sync_failure",
] as const;
export type NotificationType = typeof notificationTypes[number];
export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && notificationTypes.includes(value as NotificationType);
}
export const settingColumn: Record<Exclude<NotificationType, "test">, string> = {
  daily_sales_report: "daily_sales_report", weekly_sales_summary: "weekly_sales_summary",
  order_failure: "order_failure_alerts", payment_failure: "payment_failure_alerts",
  kiosk_offline: "kiosk_offline_alerts", kitchen_display_offline: "kitchen_offline_alerts",
  device_sync_failure: "device_sync_failure_alerts",
};
