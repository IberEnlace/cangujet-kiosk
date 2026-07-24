import { supabase } from "../../../lib/supabase/client";
import type { NotificationDeliveryLogRow, NotificationSettingsRow } from "../../../lib/supabase/database.types";
import { repositoryFailure, type RepositoryResult } from "./repositoryResult";

export type NotificationSettingsInput = {
  primaryEmail: string;
  secondaryEmail: string;
  dailyReportTime: string;
  dailySalesReport: boolean;
  weeklySalesSummary: boolean;
  orderFailureAlerts: boolean;
  paymentFailureAlerts: boolean;
  kioskOfflineAlerts: boolean;
  kitchenOfflineAlerts: boolean;
  deviceSyncFailureAlerts: boolean;
};

export type TestNotificationResult = { messageId: string; recipient: string; recipients?: string[]; sentAt: string };
export const isValidNotificationEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

async function currentBranchId(): Promise<RepositoryResult<string>> {
  if (!supabase) return repositoryFailure("configuration", "Email delivery is not configured.");
  const { data, error } = await supabase.rpc("current_user_branch_id");
  if (error) return repositoryFailure("unauthorized", "Your branch could not be resolved.", error);
  if (!data) return repositoryFailure("invalid_data", "Assign this administrator to a branch before configuring notifications.");
  return { ok: true, data, source: "supabase" };
}

export async function getNotificationSettings(): Promise<RepositoryResult<NotificationSettingsRow | null>> {
  if (!supabase) return repositoryFailure("configuration", "Email delivery is not configured.");
  const branch = await currentBranchId(); if (!branch.ok) return branch;
  const { data, error } = await supabase.from("notification_settings").select("*").eq("branch_id", branch.data).maybeSingle();
  if (error) return repositoryFailure(error.code === "42501" ? "unauthorized" : "network", "Notification settings could not be loaded.", error);
  return { ok: true, data, source: "supabase" };
}

export async function saveNotificationSettings(input: NotificationSettingsInput): Promise<RepositoryResult<NotificationSettingsRow>> {
  if (!isValidNotificationEmail(input.primaryEmail) || input.secondaryEmail.trim() && !isValidNotificationEmail(input.secondaryEmail)) {
    return repositoryFailure("invalid_data", "Enter valid notification email addresses.");
  }
  if (!supabase) return repositoryFailure("configuration", "Email delivery is not configured.");
  const branch = await currentBranchId(); if (!branch.ok) return branch;
  const row = {
    branch_id: branch.data,
    primary_email: input.primaryEmail.trim().toLowerCase(),
    secondary_email: input.secondaryEmail.trim().toLowerCase() || null,
    daily_report_time: input.dailyReportTime,
    daily_sales_report: input.dailySalesReport,
    weekly_sales_summary: input.weeklySalesSummary,
    order_failure_alerts: input.orderFailureAlerts,
    payment_failure_alerts: input.paymentFailureAlerts,
    kiosk_offline_alerts: input.kioskOfflineAlerts,
    kitchen_offline_alerts: input.kitchenOfflineAlerts,
    device_sync_failure_alerts: input.deviceSyncFailureAlerts,
  };
  const { data, error } = await supabase.from("notification_settings").upsert(row, { onConflict: "branch_id" }).select("*").single();
  if (error || !data) return repositoryFailure(error?.code === "42501" ? "unauthorized" : "network", "Notification settings could not be saved.", error);
  return { ok: true, data, source: "supabase" };
}

export async function sendTestNotification(recipient?: string): Promise<RepositoryResult<TestNotificationResult>> {
  if (recipient && !isValidNotificationEmail(recipient)) return repositoryFailure("invalid_data", "Enter a valid recipient email.");
  if (!supabase) return repositoryFailure("configuration", "Email delivery is not configured.");
  const { data, error } = await supabase.functions.invoke("send-notification-email", { body: { type: "test", recipient: recipient?.trim().toLowerCase() || undefined } });
  if (error || !data?.ok) {
    let payload = data;
    const context = error && "context" in error ? error.context : null;
    if (!payload && context instanceof Response) {
      try { payload = await context.clone().json(); } catch { /* A non-JSON gateway failure uses the safe generic message below. */ }
    }
    const code = payload?.code;
    const message = code === "email_not_configured" || code === "server_not_configured"
      ? "Email delivery is not configured."
      : typeof payload?.message === "string" ? payload.message : "The test notification could not be sent.";
    return repositoryFailure(code === "authentication_required" || code === "admin_required" ? "unauthorized" : code === "email_not_configured" ? "configuration" : "network", message, error);
  }
  return { ok: true, data: { messageId: data.messageId, recipient: data.recipient, sentAt: data.sentAt }, source: "supabase" };
}

export async function sendDailyReportNow(): Promise<RepositoryResult<TestNotificationResult>> {
  if (!supabase) return repositoryFailure("configuration", "Email delivery is not configured.");
  const { data, error } = await supabase.functions.invoke("send-notification-email", { body: { type: "daily_sales_report" } });
  const accepted = data?.ok === true
    && data?.suppressed !== true
    && typeof data?.messageId === "string"
    && typeof data?.recipient === "string"
    && typeof data?.sentAt === "string";
  if (error || !accepted) {
    const message = data?.suppressed
      ? "The daily report was not sent because this notification is disabled."
      : typeof data?.message === "string" ? data.message : "The daily report was not accepted for delivery.";
    return repositoryFailure("network", message, error);
  }
  const recipients = Array.isArray(data.results)
    ? data.results.filter((item: unknown) => typeof (item as { recipient?: unknown })?.recipient === "string").map((item: { recipient: string }) => item.recipient)
    : undefined;
  return { ok: true, data: { messageId: data.messageId, recipient: data.recipient, recipients, sentAt: data.sentAt }, source: "supabase" };
}

export async function getRecentDeliveryLogs(limit = 10): Promise<RepositoryResult<NotificationDeliveryLogRow[]>> {
  if (!supabase) return repositoryFailure("configuration", "Email delivery is not configured.");
  const branch = await currentBranchId(); if (!branch.ok) return branch;
  const { data, error } = await supabase.from("notification_delivery_logs").select("*").eq("branch_id", branch.data).order("created_at", { ascending: false }).limit(limit);
  if (error) return repositoryFailure(error.code === "42501" ? "unauthorized" : "network", "Delivery logs could not be loaded.", error);
  return { ok: true, data, source: "supabase" };
}
