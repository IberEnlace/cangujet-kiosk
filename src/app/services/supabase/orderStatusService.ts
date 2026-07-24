import { supabase } from "../../../lib/supabase/client";
import type { DbOrderStatus, TrackingRow } from "../../../lib/supabase/database.types";
import { repositoryFailure, type RepositoryResult } from "./repositoryResult";

export const NEXT_STATUS: Partial<Record<DbOrderStatus, DbOrderStatus>> = { pending: "confirmed", confirmed: "preparing", preparing: "ready", ready: "completed" };
export type KitchenAction = { label: string; nextStatus: DbOrderStatus };
export type OrderTransition = { status: DbOrderStatus; changedAt: string };

export function getKitchenAction(status: DbOrderStatus): KitchenAction | null {
  switch (status) {
    case "pending": return { label: "Accept Order", nextStatus: "confirmed" };
    case "confirmed": return { label: "Start Cooking", nextStatus: "preparing" };
    case "preparing": return { label: "Mark as Ready", nextStatus: "ready" };
    case "ready": return { label: "Complete Order", nextStatus: "completed" };
    default: return null;
  }
}

function transitionErrorMessage(error: { message?: string } | null) {
  const key = error?.message?.match(/authentication_required|branch_not_authorized|payment_not_eligible|role_transition_not_allowed|illegal_status_transition/)?.[0];
  const messages: Record<string, string> = {
    authentication_required: "Please sign in again before updating this order.",
    branch_not_authorized: "You are not authorized to update orders for this branch.",
    payment_not_eligible: "This order is not yet eligible for kitchen acceptance.",
    role_transition_not_allowed: "Your kitchen role cannot perform this order action.",
    illegal_status_transition: "The order changed elsewhere. Refresh and try again.",
  };
  return key ? messages[key] : "This order can’t move to that status.";
}

export async function transitionOrderStatus(orderId: string, nextStatus: DbOrderStatus): Promise<RepositoryResult<OrderTransition>> {
  if (!supabase) return repositoryFailure("configuration", "Live order updates are not configured.");
  const { data, error } = await supabase.rpc("transition_order_status", { p_order_id: orderId, p_next_status: nextStatus, p_reason: null });
  if (error || !data?.[0]) {
    if (import.meta.env?.DEV) console.error("[MORROW] Kitchen transition failed", { orderId, requestedNextStatus: nextStatus, code: error?.code, message: error?.message });
    return repositoryFailure(error?.code === "42501" ? "unauthorized" : "invalid_data", transitionErrorMessage(error), error);
  }
  return { ok: true, data: { status: data[0].new_status, changedAt: data[0].changed_at }, source: "supabase" };
}

export async function getOrderTracking(orderId: string, trackingToken: string): Promise<RepositoryResult<TrackingRow>> {
  if (!supabase) return repositoryFailure("configuration", "Live tracking is not configured.");
  const { data, error } = await supabase.rpc("get_order_tracking", { p_order_id: orderId, p_tracking_token: trackingToken });
  if (error || !data?.[0]) return repositoryFailure("not_found", "Order tracking is unavailable.", error);
  return { ok: true, data: data[0], source: "supabase" };
}
