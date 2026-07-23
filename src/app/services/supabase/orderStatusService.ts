import { supabase } from "../../../lib/supabase/client";
import type { DbOrderStatus, TrackingRow } from "../../../lib/supabase/database.types";
import { repositoryFailure, type RepositoryResult } from "./repositoryResult";

export const NEXT_STATUS: Partial<Record<DbOrderStatus, DbOrderStatus>> = { pending: "confirmed", confirmed: "preparing", preparing: "ready", ready: "completed" };

export async function transitionOrderStatus(orderId: string, nextStatus: DbOrderStatus): Promise<RepositoryResult<DbOrderStatus>> {
  if (!supabase) return repositoryFailure("configuration", "Live order updates are not configured.");
  const { data, error } = await supabase.rpc("transition_order_status", { p_order_id: orderId, p_next_status: nextStatus, p_reason: null });
  if (error || !data?.[0]) return repositoryFailure(error?.code === "42501" ? "unauthorized" : "invalid_data", "This order can’t move to that status.", error);
  return { ok: true, data: data[0].new_status, source: "supabase" };
}

export async function getOrderTracking(orderId: string, trackingToken: string): Promise<RepositoryResult<TrackingRow>> {
  if (!supabase) return repositoryFailure("configuration", "Live tracking is not configured.");
  const { data, error } = await supabase.rpc("get_order_tracking", { p_order_id: orderId, p_tracking_token: trackingToken });
  if (error || !data?.[0]) return repositoryFailure("not_found", "Order tracking is unavailable.", error);
  return { ok: true, data: data[0], source: "supabase" };
}
