import { supabase } from "../../../lib/supabase/client";
import type { DbOrderStatus, OrderItemRow, OrderRow } from "../../../lib/supabase/database.types";
import { repositoryFailure, type RepositoryResult } from "./repositoryResult";

export type OperationalOrder = OrderRow & { items: OrderItemRow[] };
const ACTIVE: DbOrderStatus[] = ["pending", "confirmed", "preparing", "ready"];
export function isKitchenPaymentEligible(status: OrderRow["payment_status"], allowUnpaid: boolean) {
  return status === "paid" || allowUnpaid;
}

export async function fetchBranchOrders(branchId: string, audience: "kitchen" | "cashier", allowUnpaid = false): Promise<RepositoryResult<OperationalOrder[]>> {
  if (!supabase) return repositoryFailure("configuration", "Live orders are not configured.");
  const since = new Date(Date.now() - (audience === "kitchen" ? 24 : 72) * 60 * 60_000).toISOString();
  let query = supabase.from("orders").select("*").eq("branch_id", branchId).gte("created_at", since).order("created_at", { ascending: true }).limit(audience === "kitchen" ? 150 : 300);
  if (audience === "kitchen") query = query.in("status", ACTIVE);
  if (audience === "kitchen" && !allowUnpaid) query = query.eq("payment_status", "paid");
  const orders = await query;
  if (orders.error) return repositoryFailure("network", "Orders could not be loaded.", orders.error);
  const ids = orders.data.map(order => order.id);
  if (!ids.length) return { ok: true, data: [], source: "supabase" };
  const items = await supabase.from("order_items").select("*").in("order_id", ids).order("created_at");
  if (items.error) return repositoryFailure("network", "Order items could not be loaded.", items.error);
  const byOrder = new Map<string, OrderItemRow[]>();
  for (const item of items.data) byOrder.set(item.order_id, [...(byOrder.get(item.order_id) ?? []), item]);
  return { ok: true, data: orders.data.map(order => ({ ...order, items: byOrder.get(order.id) ?? [] })), source: "supabase" };
}

export function mergeOrders(current: OperationalOrder[], incoming: OperationalOrder[]) {
  const merged = new Map(current.map(order => [order.id, order]));
  for (const order of incoming) merged.set(order.id, order);
  return [...merged.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
