import { supabase } from "../../../lib/supabase/client";
import type { NotificationDeliveryLogRow, NotificationSettingsRow } from "../../../lib/supabase/database.types";
import { getStaffAccessToken } from "./authService";
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
  return requestNotificationDelivery(
    "/api/v1/admin/notifications/test",
    { recipient: recipient?.trim().toLowerCase() },
    "The test notification could not be sent.",
  );
}

export async function sendDailyReportNow(): Promise<RepositoryResult<TestNotificationResult>> {
  return requestNotificationDelivery(
    "/api/v1/admin/notifications/daily-report",
    undefined,
    "The daily report was not accepted for delivery.",
  );
}

export async function getRecentDeliveryLogs(limit = 10): Promise<RepositoryResult<NotificationDeliveryLogRow[]>> {
  if (!supabase) return repositoryFailure("configuration", "Email delivery is not configured.");
  const branch = await currentBranchId(); if (!branch.ok) return branch;
  const { data, error } = await supabase.from("notification_delivery_logs").select("*").eq("branch_id", branch.data).order("created_at", { ascending: false }).limit(limit);
  if (error) return repositoryFailure(error.code === "42501" ? "unauthorized" : "network", "Delivery logs could not be loaded.", error);
  return { ok: true, data, source: "supabase" };
}

type NotificationApiPayload = {
  ok?: boolean;
  code?: string;
  message?: string;
  messageId?: string;
  recipient?: string;
  sentAt?: string;
  results?: Array<{ recipient?: string }>;
};

async function requestNotificationDelivery(
  path: string,
  body: unknown,
  fallbackMessage: string,
): Promise<RepositoryResult<TestNotificationResult>> {
  const token = await getStaffAccessToken();
  if (!token) return repositoryFailure("configuration", "A live administrator session is required for email delivery.");

  try {
    const response = await fetch(path, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await readApiPayload(response);
    if (!response.ok || payload?.ok !== true) {
      const message = typeof payload?.message === "string" ? payload.message : fallbackMessage;
      return repositoryFailure(repositoryCode(response.status, payload?.code), message);
    }
    if (
      typeof payload.messageId !== "string"
      || typeof payload.recipient !== "string"
      || typeof payload.sentAt !== "string"
    ) {
      return repositoryFailure("network", fallbackMessage);
    }
    const recipients = Array.isArray(payload.results)
      ? payload.results
        .filter((item): item is { recipient: string } => typeof item?.recipient === "string")
        .map(item => item.recipient)
      : undefined;
    return {
      ok: true,
      data: {
        messageId: payload.messageId,
        recipient: payload.recipient,
        recipients,
        sentAt: payload.sentAt,
      },
      source: "supabase",
    };
  } catch (error) {
    return repositoryFailure("network", fallbackMessage, error);
  }
}

async function readApiPayload(response: Response): Promise<NotificationApiPayload | null> {
  try {
    return await response.json() as NotificationApiPayload;
  } catch {
    return null;
  }
}

function repositoryCode(status: number, code?: string) {
  if (status === 401 || status === 403) return "unauthorized" as const;
  if (status === 400 || status === 422) return "invalid_data" as const;
  if (code === "email_not_configured" || code === "server_not_configured") return "configuration" as const;
  return "network" as const;
}
