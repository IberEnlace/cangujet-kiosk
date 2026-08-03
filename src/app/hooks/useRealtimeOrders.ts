import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrderStatusDisplayOrder, OrderTracking, ProductionOrder } from "../../shared/orders";
import { useAuth } from "../auth/AuthContext";
import type { KitchenOrder } from "../context/CartContext";
import { useBranch } from "../context/BootstrapContext";
import { kitchenOrderService } from "../services/orders/KitchenOrderService";
import { OrderClientError, OrderService, orderService, type OrderAuthentication } from "../services/orders/OrderService";
import { orderTrackingService } from "../services/orders/OrderTrackingService";
import { branchTodayRange } from "../services/supabase/adminDashboardService";
import {
  subscribeToBranchOrders,
  subscribeToOrderDisplaySignal,
  subscribeToPublicBoardSignal,
  type RealtimeConnectionStatus,
} from "../services/supabase/realtimeOrderService";

const RECONCILIATION_MS = 15_000;
const cashierReadService = new OrderService();

export function useKitchenOrders() {
  const auth = useAuth();
  const bootstrapBranch = useBranch();
  const [live, setLive] = useState<ProductionOrder[]>([]);
  const [connection, setConnection] = useState<RealtimeConnectionStatus>("connecting");
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const branchId = auth.profile?.branch_id ?? bootstrapBranch?.id ?? null;
  const authMode: OrderAuthentication = auth.profile ? "staff" : "device";

  const fetchCurrent = useCallback(async () => {
    try {
      const current = await kitchenOrderService.list(authMode);
      console.info("kitchen_fetch_result", {
        authMode,
        branchId,
        orderCount: current.length,
        firstOrder: current[0] ?? null,
      });
      setLive(previous => {
        const reconciled = reconcile(previous, current);
        const kitchenOrders = reconciled.map(toKitchenOrder);
        const incoming = kitchenOrders.filter(o => o.status === "received").length;
        const accepted = kitchenOrders.filter(o => o.status === "preparing").length;
        const preparing = kitchenOrders.filter(o => o.status === "cooking").length;
        const ready = kitchenOrders.filter(o => o.status === "ready").length;
        const completed = kitchenOrders.filter(o => o.status === "completed").length;
        console.info("kitchen_state_updated", {
          incoming,
          accepted,
          preparing,
          ready,
          completed,
          totalActive: incoming + accepted + preparing + ready,
        });
        return reconciled;
      });
      setError("");
      setConnection("connected");
    } catch (caught) {
      setError(message(caught));
      setConnection(navigator.onLine ? "error" : "disconnected");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMode, branchId]);

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

  const timezone = bootstrapBranch?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const businessDay = branchTodayRange(timezone);
  const businessDayStart = Date.parse(businessDay.start);
  const businessDayEnd = Date.parse(businessDay.end);
  const doneToday = live.filter(order => {
    const completedAt = Date.parse(order.completedAt ?? order.updatedAt);
    return order.status === "completed" && completedAt >= businessDayStart && completedAt < businessDayEnd;
  }).length;
  const mappedOrders = useMemo(() => live.map(toKitchenOrder), [live]);
  return {
    orders: mappedOrders,
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
  const branch = useBranch();
  const branchId = branch?.id ?? null;
  const [orders, setOrders] = useState<OrderStatusDisplayOrder[]>([]);
  const [connection, setConnection] = useState<RealtimeConnectionStatus>("connecting");
  const [error, setError] = useState("");
  const fetchCurrent = useCallback(async () => {
    if (!branchId) return;
    try {
      setOrders(await orderService.listDisplay());
      setError("");
      setConnection("connected");
    } catch (caught) {
      setError(message(caught));
      setConnection(navigator.onLine ? "error" : "disconnected");
    }
  }, [branchId]);
  useEffect(() => {
    if (!branchId) { setConnection("disconnected"); return; }
    void fetchCurrent();
    const subscription = subscribeToOrderDisplaySignal({
      branchId,
      onSignal: () => void fetchCurrent(),
      onStatus: setConnection,
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
  return {
    orders: orders.map(order => ({
      order_number: order.orderNumber,
      public_status: order.status === "ready" ? "ready" : order.status === "completed" ? "completed" : "preparing",
      created_at: order.createdAt,
      ready_at: order.readyAt,
    })),
    connection,
    error,
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
      const currentOrders = await cashierReadService.listActive("staff");
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

export function usePendingCashierOrders() {
  const auth = useAuth();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [connection, setConnection] = useState<RealtimeConnectionStatus>("connecting");
  const [error, setError] = useState("");
  const branchId = auth.profile?.branch_id;
  const fetchCurrent = useCallback(async () => {
    try {
      const current = await cashierReadService.listPendingCashierOrders("staff");
      setOrders(current);
      setError("");
      setConnection("connected");
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
      audience: "cashier",
      onSignal: () => void fetchCurrent(),
      onStatus: setConnection,
    });
    const timer = window.setInterval(() => void fetchCurrent(), RECONCILIATION_MS);
    return () => { window.clearInterval(timer); void subscription.unsubscribe(); };
  }, [branchId, fetchCurrent]);
  return { orders, connection, error, refresh: fetchCurrent };
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
    orderNumber: order.orderNumber,
    status: kitchenColumn(order),
    databaseStatus: order.status,
    priority: false,
    delayed: false,
    startTime: Date.parse(order.placedAt ?? order.createdAt),
    completedAt: order.completedAt ? Date.parse(order.completedAt) : undefined,
    estimatedMinutes: 12,
    type: order.serviceMode,
    customer: order.customerReference,
    notes: order.notes ?? undefined,
    source: order.source,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
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
