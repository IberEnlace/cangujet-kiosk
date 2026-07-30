import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { OrderQuote, ProductionOrder, ProductionPaymentMethod } from "../../shared/orders";
import { useCart } from "./CartContext";
import { useLanguage } from "./LanguageContext";
import { useBootstrap } from "./BootstrapContext";
import { OrderClientError, orderService } from "../services/orders/OrderService";
import { paymentAdapters } from "../services/orders/PaymentService";
import { buildOrderQuoteRequest } from "../services/orders/cartModifierPipeline";

const PENDING_ORDER_KEY = "morrow:pending-production-order";

type PendingOrderState = {
  createKey: string;
  paymentKey: string;
  requestSignature: string;
  order: ProductionOrder | null;
};

type OrderContextValue = {
  quote: OrderQuote | null;
  currentOrder: ProductionOrder | null;
  isBusy: boolean;
  error: OrderClientError | null;
  quoteCart: () => Promise<OrderQuote>;
  createOrder: () => Promise<ProductionOrder>;
  capturePayment: (method: ProductionPaymentMethod, externalReference?: string) => Promise<ProductionOrder>;
  submitOrder: () => Promise<ProductionOrder>;
  clearOrderSession: () => void;
};

const OrderContext = createContext<OrderContextValue | null>(null);

export function OrderProvider({ children }: { children: ReactNode }) {
  const cart = useCart();
  const { language } = useLanguage();
  const { menu } = useBootstrap();
  const [pending, setPending] = useState<PendingOrderState>(() => restorePending());
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<OrderClientError | null>(null);
  const request = useMemo(
    () => buildOrderQuoteRequest(
      cart.items,
      menu,
      cart.orderType ?? "dine_in",
      language,
      cart.orderNotes,
    ),
    [cart.items, cart.orderNotes, cart.orderType, language, menu],
  );
  const requestSignature = useMemo(() => JSON.stringify(request), [request]);

  const run = useCallback(async <T,>(operation: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    try {
      return await operation();
    } catch (caught) {
      const failure = caught instanceof OrderClientError
        ? caught
        : new OrderClientError("server_error", "The order could not be completed.", 500);
      setError(failure);
      throw failure;
    } finally {
      setBusy(false);
    }
  }, []);

  const quoteCart = useCallback(() => run(async () => {
    const result = await orderService.quote(request);
    setQuote(result);
    return result;
  }), [request, run]);

  const createOrder = useCallback(() => run(async () => {
    if (pending.order && pending.requestSignature === requestSignature) return pending.order;
    const createKey = pending.requestSignature === requestSignature ? pending.createKey : crypto.randomUUID();
    const order = await orderService.create({ ...request, idempotencyKey: createKey, source: "kiosk" });
    const next = { createKey, paymentKey: crypto.randomUUID(), requestSignature, order };
    persistPending(next);
    setPending(next);
    setQuote(order);
    cart.recordCreatedOrder({
      id: order.id,
      number: order.orderNumber,
      total: Number(order.total),
      trackingToken: order.customerReference,
    });
    return order;
  }), [cart, pending, request, requestSignature, run]);

  const capturePayment = useCallback((method: ProductionPaymentMethod, externalReference?: string) => run(async () => {
    const restored = restorePending();
    const order = restored.order ?? pending.order ?? await createOrder();
    const adapter = method === "card_terminal"
      ? paymentAdapters.cardTerminal
      : method === "pay_at_cashier"
        ? paymentAdapters.payAtCashier
        : paymentAdapters.cash;
    const result = await adapter.capture({
      order,
      idempotencyKey: (restored.order ? restored : restorePending()).paymentKey,
      externalReference,
      authentication: "device",
    });
    const next = { ...restorePending(), order: result.order };
    persistPending(next);
    setPending(next);
    return result.order;
  }), [createOrder, pending, run]);

  const submitOrder = useCallback(() => run(async () => {
    const restored = restorePending();
    const order = restored.order ?? pending.order;
    if (!order) throw new OrderClientError("order_not_found", "No pending order could be restored.", 404);
    if (order.status === "submitted") return order;
    const submitted = await orderService.submit(order.id, order.version);
    const next = { ...restored, order: submitted };
    persistPending(next);
    setPending(next);
    return submitted;
  }), [pending, run]);

  const clearOrderSession = useCallback(() => {
    try { sessionStorage.removeItem(PENDING_ORDER_KEY); } catch { /* Storage can be disabled. */ }
    setPending(newPending(""));
    setQuote(null);
    setError(null);
  }, []);

  const value = useMemo<OrderContextValue>(() => ({
    quote,
    currentOrder: pending.order,
    isBusy,
    error,
    quoteCart,
    createOrder,
    capturePayment,
    submitOrder,
    clearOrderSession,
  }), [capturePayment, clearOrderSession, createOrder, error, isBusy, pending.order, quote, quoteCart, submitOrder]);

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
}

export function useCurrentOrder() {
  const context = useOrderContext();
  return { order: context.currentOrder, quote: context.quote, error: context.error, isBusy: context.isBusy };
}

export function useOrderSubmission() {
  const context = useOrderContext();
  return {
    quoteCart: context.quoteCart,
    createOrder: context.createOrder,
    capturePayment: context.capturePayment,
    submitOrder: context.submitOrder,
    clearOrderSession: context.clearOrderSession,
    isBusy: context.isBusy,
    error: context.error,
  };
}

function useOrderContext() {
  const context = useContext(OrderContext);
  if (!context) throw new Error("Order hooks must be used within OrderProvider");
  return context;
}

function restorePending(): PendingOrderState {
  try {
    const value = sessionStorage.getItem(PENDING_ORDER_KEY);
    if (value) return JSON.parse(value) as PendingOrderState;
  } catch { /* Invalid or unavailable storage starts a fresh order. */ }
  return newPending("");
}

function persistPending(value: PendingOrderState) {
  try { sessionStorage.setItem(PENDING_ORDER_KEY, JSON.stringify(value)); } catch { /* Idempotency still lives in memory. */ }
}

function newPending(requestSignature: string): PendingOrderState {
  return { createKey: crypto.randomUUID(), paymentKey: crypto.randomUUID(), requestSignature, order: null };
}
