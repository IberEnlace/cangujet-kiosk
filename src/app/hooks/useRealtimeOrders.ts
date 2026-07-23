import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured } from "../../lib/supabase/client";
import { useAuth } from "../auth/AuthContext";
import { useCart, type KitchenOrder, type OrderStatus } from "../context/CartContext";
import { fetchBranchOrders, mergeOrders, type OperationalOrder } from "../services/supabase/kitchenOrderService";
import { fetchPublicOrderBoard } from "../services/supabase/publicOrderBoardService";
import { subscribeToBranchOrders, subscribeToPublicBoardSignal, type RealtimeConnectionStatus } from "../services/supabase/realtimeOrderService";
import { NEXT_STATUS, transitionOrderStatus } from "../services/supabase/orderStatusService";
import type { PublicBoardRow } from "../../lib/supabase/database.types";
import type { TrackingRow } from "../../lib/supabase/database.types";
import { getOrderTracking } from "../services/supabase/orderStatusService";

export function useKitchenOrders() {
  const auth = useAuth(); const demo = useCart();
  const [live, setLive] = useState<OperationalOrder[]>([]); const [connection, setConnection] = useState<RealtimeConnectionStatus>("connecting");
  const [error, setError] = useState(""); const [pendingId, setPendingId] = useState<string | null>(null);
  const allowUnpaid = import.meta.env?.DEV && import.meta.env?.VITE_MORROW_ALLOW_UNPAID_KITCHEN_ORDERS === "true";
  const branchId = auth.profile?.branch_id;
  const fetchCurrent = useCallback(async () => {
    if (!branchId) return;
    const result = await fetchBranchOrders(branchId, "kitchen", allowUnpaid);
    if (result.ok) { setLive(current => mergeOrders(current, result.data).filter(order => !["completed","cancelled"].includes(order.status))); setError(""); }
    else setError(result.error.message);
  }, [allowUnpaid, branchId]);
  useEffect(() => {
    if (!isSupabaseConfigured || !branchId) { setConnection("disconnected"); return; }
    void fetchCurrent();
    const subscription = subscribeToBranchOrders({ branchId, audience: "kitchen", onSignal: () => void fetchCurrent(), onStatus: setConnection });
    return () => { void subscription.unsubscribe(); };
  }, [branchId, fetchCurrent]);
  const transition = useCallback(async (id: string) => {
    const order = live.find(value => value.id === id); const next = order && NEXT_STATUS[order.status];
    if (!next) return false;
    setPendingId(id); const result = await transitionOrderStatus(id, next); setPendingId(null);
    if (!result.ok) { setError(result.error.message); return false; }
    await fetchCurrent(); return true;
  }, [fetchCurrent, live]);
  return { orders: isSupabaseConfigured ? live.map(toKitchenOrder) : demo.kitchenOrders, isDemo: !isSupabaseConfigured, connection, error, pendingId, transition, refresh: fetchCurrent };
}

export function usePublicOrderBoard() {
  const demo = useCart(); const [orders, setOrders] = useState<PublicBoardRow[]>([]); const [connection, setConnection] = useState<RealtimeConnectionStatus>("connecting");
  const fetchCurrent = useCallback(async () => { const result = await fetchPublicOrderBoard(); if (result.ok) setOrders(result.data); }, []);
  useEffect(() => {
    if (!isSupabaseConfigured) { setConnection("disconnected"); return; }
    void fetchCurrent(); const subscription = subscribeToPublicBoardSignal(() => void fetchCurrent(), setConnection);
    return () => { void subscription.unsubscribe(); };
  }, [fetchCurrent]);
  const demoRows: PublicBoardRow[] = demo.kitchenOrders.filter(order => ["received","preparing","cooking","ready","completed"].includes(order.status)).map(order => ({
    order_number: String(order.number), public_status: order.status === "ready" ? "ready" : order.status === "completed" ? "completed" : "preparing", created_at: new Date(order.startTime).toISOString(), ready_at: order.status === "ready" ? new Date().toISOString() : null,
  }));
  return { orders: isSupabaseConfigured ? orders : demoRows, connection, isDemo: !isSupabaseConfigured };
}

export function useCashierOrders() {
  const auth = useAuth(); const [orders, setOrders] = useState<OperationalOrder[]>([]); const [connection, setConnection] = useState<RealtimeConnectionStatus>("connecting");
  const branchId = auth.profile?.branch_id;
  const fetchCurrent = useCallback(async () => {
    if (!branchId) return;
    const result = await fetchBranchOrders(branchId, "cashier");
    if (result.ok) setOrders(current => mergeOrders(current, result.data));
  }, [branchId]);
  useEffect(() => {
    if (!isSupabaseConfigured || !branchId) { setConnection("disconnected"); return; }
    void fetchCurrent(); const subscription = subscribeToBranchOrders({ branchId, audience: "cashier", onSignal: () => void fetchCurrent(), onStatus: setConnection });
    return () => { void subscription.unsubscribe(); };
  }, [branchId, fetchCurrent]);
  return { orders, connection, isDemo: !isSupabaseConfigured, refresh: fetchCurrent };
}

export function useOrderTracking(orderId: string, trackingToken: string) {
  const [tracking, setTracking] = useState<TrackingRow | null>(null); const [connection, setConnection] = useState<RealtimeConnectionStatus>("connecting");
  const fetchCurrent = useCallback(async () => {
    if (!orderId || !trackingToken) return;
    const result = await getOrderTracking(orderId, trackingToken);
    if (result.ok) setTracking(result.data);
  }, [orderId, trackingToken]);
  useEffect(() => {
    if (!isSupabaseConfigured || !orderId || !trackingToken) { setConnection("disconnected"); return; }
    void fetchCurrent(); const subscription = subscribeToPublicBoardSignal(() => void fetchCurrent(), setConnection);
    return () => { void subscription.unsubscribe(); };
  }, [fetchCurrent, orderId, trackingToken]);
  return { tracking, connection, isDemo: !isSupabaseConfigured };
}

function toKitchenOrder(order: OperationalOrder): KitchenOrder {
  const statusMap: Record<string, OrderStatus> = { pending: "received", confirmed: "preparing", preparing: "cooking", ready: "ready", completed: "completed", cancelled: "completed" };
  const number = Number(order.order_number.match(/(\d+)$/)?.[1]) || 0;
  return { id: order.id, number, status: statusMap[order.status] ?? "received", priority: false, delayed: false,
    startTime: new Date(order.created_at).getTime(), completedAt: order.completed_at ? new Date(order.completed_at).getTime() : undefined,
    estimatedMinutes: 12, type: order.order_type === "takeaway" ? "take_away" : "dine_in",
    items: order.items.map(item => ({ name: item.product_name_snapshot, qty: item.quantity, notes: item.notes ?? undefined,
      customizations: Array.isArray(item.customizations) ? item.customizations.flatMap(value => typeof value === "object" && value && "name" in value ? [String(value.name)] : []) : undefined })),
  };
}
