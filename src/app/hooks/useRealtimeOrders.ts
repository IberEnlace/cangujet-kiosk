import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured } from "../../lib/supabase/client";
import { useAuth } from "../auth/AuthContext";
import { useCart, type KitchenOrder } from "../context/CartContext";
import { fetchBranchOrders, fetchCompletedTodayCount, getKitchenColumn, isKitchenOrderVisible, mergeOrders, type OperationalOrder } from "../services/supabase/kitchenOrderService";
import { fetchPublicOrderBoard } from "../services/supabase/publicOrderBoardService";
import { subscribeToBranchOrders, subscribeToPublicBoardSignal, type RealtimeConnectionStatus } from "../services/supabase/realtimeOrderService";
import { getKitchenAction, transitionOrderStatus } from "../services/supabase/orderStatusService";
import type { PublicBoardRow } from "../../lib/supabase/database.types";
import type { TrackingRow } from "../../lib/supabase/database.types";
import { getOrderTracking } from "../services/supabase/orderStatusService";

export function useKitchenOrders() {
  const auth = useAuth(); const demo = useCart();
  const [live, setLive] = useState<OperationalOrder[]>([]); const [connection, setConnection] = useState<RealtimeConnectionStatus>("connecting");
  const [error, setError] = useState(""); const [pendingId, setPendingId] = useState<string | null>(null); const [doneToday, setDoneToday] = useState(0);
  const allowUnpaid = import.meta.env?.DEV && import.meta.env?.VITE_MORROW_ALLOW_UNPAID_KITCHEN_ORDERS === "true";
  const branchId = auth.profile?.branch_id;
  const fetchCurrent = useCallback(async () => {
    if (!branchId) return;
    const result = await fetchBranchOrders(branchId, "kitchen", allowUnpaid);
    if (result.ok) {
      setLive(mergeOrders([], result.data).filter(order => isKitchenOrderVisible(order)));
      const completedCount = await fetchCompletedTodayCount(branchId);
      if (completedCount !== null) setDoneToday(completedCount);
      setError("");
    }
    else setError(result.error.message);
  }, [allowUnpaid, branchId]);
  useEffect(() => {
    if (!isSupabaseConfigured || !branchId) { setConnection("disconnected"); return; }
    void fetchCurrent();
    const subscription = subscribeToBranchOrders({ branchId, audience: "kitchen", onSignal: () => void fetchCurrent(), onStatus: setConnection });
    return () => { void subscription.unsubscribe(); };
  }, [branchId, fetchCurrent]);
  useEffect(() => {
    const timer = window.setInterval(() => setLive(current => current.filter(order => isKitchenOrderVisible(order))), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const transition = useCallback(async (id: string) => {
    const order = live.find(value => value.id === id); const action = order && getKitchenAction(order.status);
    if (!order || !action) return false;
    if (import.meta.env?.DEV) console.debug("[MORROW] Kitchen transition", { orderId: id, currentDatabaseStatus: order.status, requestedNextStatus: action.nextStatus });
    setPendingId(id); const result = await transitionOrderStatus(id, action.nextStatus); setPendingId(null);
    if (!result.ok) { setError(result.error.message); return false; }
    setLive(current => current.map(value => value.id === id ? {
      ...value,
      status: result.data.status,
      updated_at: result.data.changedAt,
      confirmed_at: result.data.status === "confirmed" ? result.data.changedAt : value.confirmed_at,
      preparing_at: result.data.status === "preparing" ? result.data.changedAt : value.preparing_at,
      ready_at: result.data.status === "ready" ? result.data.changedAt : value.ready_at,
      completed_at: result.data.status === "completed" ? result.data.changedAt : value.completed_at,
    } : value));
    setError("");
    await fetchCurrent(); return true;
  }, [fetchCurrent, live]);
  return { orders: isSupabaseConfigured ? live.flatMap(order => getKitchenColumn(order.status) ? [toKitchenOrder(order)] : []) : demo.kitchenOrders, isDemo: !isSupabaseConfigured, connection, error, pendingId, doneToday, transition, refresh: fetchCurrent };
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
  const number = Number(order.order_number.match(/(\d+)$/)?.[1]) || 0;
  const column = getKitchenColumn(order.status);
  if (!column) throw new Error("Cancelled orders cannot be mapped to a Kitchen column.");
  return { id: order.id, number, status: column, databaseStatus: order.status, priority: false, delayed: false,
    startTime: new Date(order.created_at).getTime(), completedAt: order.completed_at ? new Date(order.completed_at).getTime() : undefined,
    estimatedMinutes: 12, type: order.order_type === "takeaway" ? "take_away" : "dine_in",
    items: order.items.map(item => ({ name: item.product_name_snapshot, qty: item.quantity, notes: item.notes ?? undefined,
      customizations: Array.isArray(item.customizations) ? item.customizations.flatMap(value => typeof value === "object" && value && "name" in value ? [String(value.name)] : []) : undefined })),
  };
}
