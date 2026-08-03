import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { OrderQuote, ProductionOrder, ProductionPaymentMethod } from "../../shared/orders";
import { useCart } from "./CartContext";
import { useLanguage } from "./LanguageContext";
import { useBootstrap } from "./BootstrapContext";
import { OrderClientError, orderService } from "../services/orders/OrderService";
import { executeWithIdempotencyRecovery } from "../services/orders/idempotencyConflictRecovery";
import { paymentAdapters } from "../services/orders/PaymentService";
import { buildOrderQuoteRequest } from "../services/orders/cartModifierPipeline";

type CapturablePaymentMethod = Exclude<ProductionPaymentMethod, "qr">;

const PENDING_ORDER_KEY = "morrow:pending-production-order";

type PendingOrderState = {
  /** Unique ID for this payment workflow attempt. Rotated on cart change or idempotency conflict. */
  workflowAttemptId: string;
  /** Idempotency key for the create-order call. Stable across network retries for the same cart. */
  createKey: string;
  /** Idempotency key for the capture-payment call. Stable across retries for the same payment. */
  paymentKey: string;
  /** Stable JSON fingerprint of the cart at the time keys were generated. */
  requestSignature: string;
  /** The order created during this attempt (null until the server confirms creation). */
  order: ProductionOrder | null;
};

type OrderContextValue = {
  quote: OrderQuote | null;
  currentOrder: ProductionOrder | null;
  workflowAttemptId: string;
  isBusy: boolean;
  error: OrderClientError | null;
  quoteCart: () => Promise<OrderQuote>;
  createOrder: () => Promise<ProductionOrder>;
  capturePayment: (method: CapturablePaymentMethod, externalReference?: string) => Promise<ProductionOrder>;
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

  /**
   * Synchronous re-entrant guard. Unlike `isBusy` (React state), this ref is
   * set before any async boundary, so rapid double-clicks that race the React
   * render cycle cannot both proceed. It is cleared in the `finally` block of
   * `run()` and reset by `clearOrderSession()`.
   */
  const inFlightRef = useRef(false);

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

  // Keep the singleton orderService in sync with the current workflow attempt ID
  // so that every outbound request carries the x-workflow-attempt-id header.
  useEffect(() => {
    orderService.setWorkflowAttemptId(pending.workflowAttemptId);
  }, [pending.workflowAttemptId]);

  const run = useCallback(async <T,>(operation: () => Promise<T>) => {
    // Synchronous guard — prevents concurrent invocations from racing each other.
    if (inFlightRef.current) {
      throw new OrderClientError(
        "server_error",
        "A request is already in progress. Please wait a moment and try again.",
        0,
      );
    }
    inFlightRef.current = true;
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
      inFlightRef.current = false;
      setBusy(false);
    }
  }, []);

  const quoteCart = useCallback(() => run(async () => {
    const result = await orderService.quote(request);
    setQuote(result);
    return result;
  }), [request, run]);

  const createOrderOperation = useCallback(async () => {
    const restored = restorePending();
    // Fast-path: already have a committed order for this exact cart state.
    if (restored.order && restored.requestSignature === requestSignature) return restored.order;

    let state = restored;
    if (restored.requestSignature !== requestSignature) {
      state = newPending(requestSignature);
      persistPending(state);
      setPending(state);
    }

    let rotatedState: PendingOrderState | null = null;
    const result = await executeWithIdempotencyRecovery({
      initialKey: state.createKey,
      execute: key => orderService.create({ ...request, idempotencyKey: key, source: "kiosk" }),
      createKey: () => {
        rotatedState = newPending(requestSignature);
        return rotatedState.createKey;
      },
      onKeyRotated: () => {
        if (!rotatedState) return;
        state = rotatedState;
        persistPending(state);
        setPending(state);
        // The retry starts immediately; do not wait for React's effect before
        // attaching the new workflow correlation ID to the outbound request.
        orderService.setWorkflowAttemptId(state.workflowAttemptId);
      },
      repeatedConflictMessage: "The order still conflicts after a safe retry. Refresh the cart and try again.",
    });

    const next: PendingOrderState = {
      ...state,
      createKey: result.key,
      requestSignature,
      order: result.value,
    };
    persistPending(next);
    setPending(next);
    setQuote(result.value);
    cart.recordCreatedOrder({
      id: result.value.id,
      number: result.value.orderNumber,
      total: Number(result.value.total),
      trackingToken: result.value.customerReference,
    });
    return result.value;
  }, [cart, request, requestSignature]);

  const createOrder = useCallback(
    () => run(createOrderOperation),
    [createOrderOperation, run],
  );

  const capturePayment = useCallback((method: CapturablePaymentMethod, externalReference?: string) => run(async () => {
    let state = restorePending();
    const order = state.order ?? pending.order ?? await createOrderOperation();
    state = restorePending();

    // A previous response may have been lost after the server committed the
    // payment. Never send a second terminal charge for an already-paid order.
    if (hasCommittedPayment(order)) return order;

    const adapter = method === "card_terminal"
      ? paymentAdapters.cardTerminal
      : method === "pay_at_cashier"
        ? paymentAdapters.payAtCashier
        : paymentAdapters.cash;

    const result = await executeWithIdempotencyRecovery({
      initialKey: state.paymentKey,
      execute: async key => {
        const payment = await adapter.capture({
          order,
          idempotencyKey: key,
          externalReference,
          authentication: "device",
        });
        return payment.order;
      },
      reconcile: async () => {
        const current = await orderService.get(order.id);
        return hasCommittedPayment(current) ? current : undefined;
      },
      onKeyRotated: key => {
        state = { ...state, paymentKey: key };
        persistPending(state);
        setPending(state);
      },
      repeatedConflictMessage: "Payment state still conflicts after reconciliation. Ask staff to verify the order before charging again.",
    });

    const next: PendingOrderState = {
      ...state,
      paymentKey: result.key,
      order: result.value,
    };
    persistPending(next);
    setPending(next);
    return result.value;
  }), [createOrderOperation, pending, run]);

  const submitOrder = useCallback(() => run(async () => {
    const restored = restorePending();
    const order = restored.order ?? pending.order;
    if (!order) throw new OrderClientError("order_not_found", "No pending order could be restored.", 404);
    if (order.status === "submitted") return order;
    const submitted = await orderService.submit(order.id, order.version);
    const next: PendingOrderState = { ...restored, order: submitted };
    persistPending(next);
    setPending(next);
    return submitted;
  }), [pending, run]);

  const clearOrderSession = useCallback(() => {
    try { sessionStorage.removeItem(PENDING_ORDER_KEY); } catch { /* Storage can be disabled. */ }
    // Reset the in-flight guard in case clearOrderSession is called while a
    // request is somehow in progress (e.g., user dismisses an error modal).
    inFlightRef.current = false;
    const fresh = newPending("");
    persistPending(fresh);
    setPending(fresh);
    setQuote(null);
    setError(null);
  }, []);

  const value = useMemo<OrderContextValue>(() => ({
    quote,
    currentOrder: pending.order,
    workflowAttemptId: pending.workflowAttemptId,
    isBusy,
    error,
    quoteCart,
    createOrder,
    capturePayment,
    submitOrder,
    clearOrderSession,
  }), [capturePayment, clearOrderSession, createOrder, error, isBusy, pending.order, pending.workflowAttemptId, quote, quoteCart, submitOrder]);

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
}

export function useCurrentOrder() {
  const context = useOrderContext();
  return {
    order: context.currentOrder,
    quote: context.quote,
    error: context.error,
    isBusy: context.isBusy,
    workflowAttemptId: context.workflowAttemptId,
  };
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
    if (value) {
      const parsed = JSON.parse(value) as PendingOrderState;
      // Guard against persisted state from an older schema that lacks workflowAttemptId.
      if (parsed.workflowAttemptId && parsed.createKey && parsed.paymentKey) return parsed;
    }
  } catch { /* Invalid or unavailable storage starts a fresh order. */ }
  return newPending("");
}

function persistPending(value: PendingOrderState) {
  try { sessionStorage.setItem(PENDING_ORDER_KEY, JSON.stringify(value)); } catch { /* Idempotency still lives in memory. */ }
}

function newPending(requestSignature: string): PendingOrderState {
  return {
    workflowAttemptId: crypto.randomUUID(),
    createKey: crypto.randomUUID(),
    paymentKey: crypto.randomUUID(),
    requestSignature,
    order: null,
  };
}

function hasCommittedPayment(order: ProductionOrder) {
  return order.status === "paid"
    || order.status === "submitted"
    || order.paymentStatus === "captured";
}
