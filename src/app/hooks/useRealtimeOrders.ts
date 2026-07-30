import { useCallback, useEffect, useState } from "react";
import type { OrderTracking, ProductionOrder } from "../../shared/orders";
import { useAuth } from "../auth/AuthContext";
import type { KitchenOrder } from "../context/CartContext";
import { kitchenOrderService } from "../services/orders/KitchenOrderService";
import { OrderClientError, orderService } from "../services/orders/OrderService";
import { orderTrackingService } from "../services/orders/OrderTrackingService";
import {
  subscribeToBranchOrders,
  subscribeToPublicBoardSignal,
  type RealtimeConnectionStatus,
} from "../services/supabase/realtimeOrderService";

const RECONCILIATION_MS = 15_000;

export function useKitchenOrders() {
  const auth = useAuth();
  const [live, setLive] = useState<ProductionOrder[]>([]);
  const [connection, setConnection] = useState<RealtimeConnectionStatus>("connecting");
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const branchId = auth.profile?.branch_id;

  const fetchCurrent = useCallback(async () => {
    try {
      const current = await kitchenOrderService.list();
      setLive(previous => reconcile(previous, current));
      setError("");
      setConnection("connected");
      console.info("[MORROW order]", { event: "kitchen_reconciliation", resultCode: "ok" });
    } catch (caught) {
      setError(message(caught));
      setConnection(navigator.onLine ? "error" : "disconnected");
    }
  }, []);

  useEffect(() => {
    if (!branchId) { setConnection("disconnected"); return; }
    void fetchCurrent();
    const subscription = subscribeToBranchOrders({
      branchId,
      audience: "kitchen",
      onSignal: () => void fetchCurrent(),
      onStatus: status => {
        setConnection(status);
        if (status === "reconnecting" || status === "connected") {
          console.info("[MORROW order]", { event: "realtime_reconnect", branchId, resultCode: status });
        }
      },
    });
    const timer = window.setInterval(() => void fetchCurrent(), RECONCILIATION_MS);
    const online = () => void fetchCurrent();
    window.addEventListener("online", online);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", online);
      void subscription.unsubscribe();
    };
  }, [branchId, fetchCurrent]);

  const changeStatus = useCallback(async (id: string, requestedStatus?: "rejected" | "cancelled", reason?: string) => {
    if (!navigator.onLine) { setError("Reconnect before updating this order."); return false; }
    const order = live.find(value => value.id === id);
    if (!order) return false;
    setPendingId(id);
    const before = live;
    try {
      const updated = requestedStatus
        ? await kitchenOrderService.setStatus(order, requestedStatus, reason)
        : await kitchenOrderService.next(order);
      setLive(current => reconcile(current, [updated]));
      setError("");
      return true;
    } catch (caught) {
      setLive(before);
      setError(message(caught));
      if (caught instanceof OrderClientError && caught.code === "order_conflict") await fetchCurrent();
      return false;
    } finally {
      setPendingId(null);
    }
  }, [fetchCurrent, live]);

  const doneToday = live.filter(order => order.status === "completed"
    && new Date(order.completedAt ?? order.updatedAt).toDateString() === new Date().toDateString()).length;
  return {
    orders: live.map(toKitchenOrder),
    isDemo: false,
    connection,
    error,
    pendingId,
    doneToday,
    transition: (id: string) => changeStatus(id),
    reject: (id: string, reason: string) => changeStatus(id, "rejected", reason),
    cancel: (id: string, reason: string) => changeStatus(id, "cancelled", reason),
    refresh: fetchCurrent,
  };
}

export function usePublicOrderBoard() {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [connection, setConnection] = useState<RealtimeConnectionStatus>("connecting");
  const fetchCurrent = useCallback(async () => {
    try {
      setOrders(await orderService.listDisplay());
      setConnection("connected");
    } catch {
      setConnection(navigator.onLine ? "error" : "disconnected");
    }
  }, []);
  useEffect(() => {
    void fetchCurrent();
    const subscription = subscribeToPublicBoardSignal(() => void fetchCurrent(), setConnection);
    const timer = window.setInterval(() => void fetchCurrent(), RECONCILIATION_MS);
    return () => { window.clearInterval(timer); void subscription.unsubscribe(); };
  }, [fetchCurrent]);
  return {
    orders: orders.map(order => ({
      order_number: order.orderNumber,
      public_status: order.status === "ready" ? "ready" : order.status === "completed" ? "completed" : "preparing",
      created_at: order.createdAt,
      ready_at: order.readyAt,
    })),
    connection,
    isDemo: false,
  };
}

export function useCashierOrders() {
  const auth = useAuth();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [connection, setConnection] = useState<RealtimeConnectionStatus>("connecting");
  const branchId = auth.profile?.branch_id;
  const fetchCurrent = useCallback(async () => {
    try {
      const currentOrders = await orderService.listActive("staff");
      setOrders(current => reconcile(current, currentOrders));
      setConnection("connected");
    } catch {
      setConnection(navigator.onLine ? "error" : "disconnected");
    }
  }, []);
  useEffect(() => {
    if (!branchId) { setConnection("disconnected"); return; }
    void fetchCurrent();
    const subscription = subscribeToBranchOrders({ branchId, audience: "cashier", onSignal: () => void fetchCurrent(), onStatus: setConnection });
    const timer = window.setInterval(() => void fetchCurrent(), RECONCILIATION_MS);
    return () => { window.clearInterval(timer); void subscription.unsubscribe(); };
  }, [branchId, fetchCurrent]);
  return { orders, connection, isDemo: false, refresh: fetchCurrent };
}

export function useOrderTracking(_orderId: string, customerReference: string) {
  const [tracking, setTracking] = useState<OrderTracking | null>(null);
  const [connection, setConnection] = useState<RealtimeConnectionStatus>("connecting");
  const fetchCurrent = useCallback(async () => {
    if (!customerReference) return;
    try {
      setTracking(await orderTrackingService.get(customerReference));
      setConnection("connected");
    } catch {
      setConnection(navigator.onLine ? "error" : "disconnected");
    }
  }, [customerReference]);
  useEffect(() => {
    if (!customerReference) { setConnection("disconnected"); return; }
    void fetchCurrent();
    const subscription = subscribeToPublicBoardSignal(() => void fetchCurrent(), setConnection);
    const timer = window.setInterval(() => void fetchCurrent(), 10_000);
    return () => { window.clearInterval(timer); void subscription.unsubscribe(); };
  }, [customerReference, fetchCurrent]);
  return { tracking, connection, isDemo: false };
}

export function reconcile(previous: ProductionOrder[], incoming: ProductionOrder[]) {
  const byId = new Map(previous.map(order => [order.id, order]));
  for (const order of incoming) {
    const existing = byId.get(order.id);
    if (!existing || order.version >= existing.version) byId.set(order.id, order);
  }
  const incomingIds = new Set(incoming.map(order => order.id));
  return [...byId.values()]
    .filter(order => incomingIds.has(order.id) || order.status === "completed")
    .sort((a, b) => Date.parse(a.placedAt ?? a.createdAt) - Date.parse(b.placedAt ?? b.createdAt));
}

function toKitchenOrder(order: ProductionOrder): KitchenOrder {
  return {
    id: order.id,
    number: Number(order.orderNumber.match(/(\d+)$/)?.[1]) || 0,
    status: kitchenColumn(order),
    databaseStatus: order.status,
    priority: false,
    delayed: false,
    startTime: Date.parse(order.placedAt ?? order.createdAt),
    completedAt: order.completedAt ? Date.parse(order.completedAt) : undefined,
    estimatedMinutes: 12,
    type: order.serviceMode,
    source: order.source,
    paymentStatus: order.paymentStatus,
    items: order.items.map(item => ({
      name: item.productName,
      qty: item.quantity,
      notes: item.notes ?? undefined,
      customizations: item.modifiers.map(value => value.name),
      allergenWarnings: item.allergens,
    })),
  };
}

function kitchenColumn(order: ProductionOrder): KitchenOrder["status"] {
  if (order.status === "submitted") return "received";
  if (order.status === "accepted") return "preparing";
  if (order.status === "preparing") return "cooking";
  if (order.status === "ready") return "ready";
  return "completed";
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Orders could not be synchronized.";
}
