export type NoriPaymentStatus =
  | "idle"
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "pay_at_cashier_pending";

export type NoriPaymentMethod = "card" | "cash" | "pay_at_cashier" | "qr";

export type NoriOrderStatus =
  | "draft"
  | "awaiting_payment"
  | "paid"
  | "submitted"
  | "accepted"
  | "completed"
  | "cancelled";

export type NoriLifecycleTransitionSource =
  | "checkout"
  | "card_terminal"
  | "cashier"
  | "qr_payment"
  | "order_service"
  | "session_reset";

export type NoriOrderLifecycleContext = {
  paymentStatus?: NoriPaymentStatus;
  paymentMethod?: NoriPaymentMethod;
  orderStatus?: NoriOrderStatus;
  orderId?: string;
  orderNumber?: string;
  paymentErrorCode?: string;
  paymentErrorMessage?: string;
  completedAt?: string;
  updatedAt?: string;
};

export type NoriOrderLifecycleState = Required<
  Pick<NoriOrderLifecycleContext, "paymentStatus" | "orderStatus" | "updatedAt">
> & Omit<NoriOrderLifecycleContext, "paymentStatus" | "orderStatus" | "updatedAt">;

export type NoriOrderLifecycleEvent = NoriOrderLifecycleContext & {
  paymentStatus: NoriPaymentStatus;
  source: NoriLifecycleTransitionSource;
};

export type NoriLifecycleTransitionResult = {
  state: NoriOrderLifecycleState;
  applied: boolean;
  reason?: "duplicate" | "stale_order" | "stale_timestamp" | "invalid_transition";
};

const LEGAL_TRANSITIONS: Record<NoriPaymentStatus, ReadonlySet<NoriPaymentStatus>> = {
  idle: new Set(["pending", "processing", "pay_at_cashier_pending", "completed", "failed", "cancelled"]),
  pending: new Set(["processing", "completed", "failed", "cancelled", "pay_at_cashier_pending"]),
  processing: new Set(["completed", "failed", "cancelled"]),
  completed: new Set(),
  failed: new Set(["pending", "processing", "cancelled", "pay_at_cashier_pending"]),
  cancelled: new Set(["pending", "processing", "pay_at_cashier_pending"]),
  pay_at_cashier_pending: new Set(["processing", "completed", "failed", "cancelled"]),
};

export function initialNoriOrderLifecycle(now = new Date().toISOString()): NoriOrderLifecycleState {
  return { paymentStatus: "idle", orderStatus: "draft", updatedAt: now };
}

export function applyNoriOrderLifecycleEvent(
  current: NoriOrderLifecycleState,
  event: NoriOrderLifecycleEvent,
): NoriLifecycleTransitionResult {
  const eventTime = timestamp(event.updatedAt);
  const currentTime = timestamp(current.updatedAt);
  if (eventTime !== null && currentTime !== null && eventTime < currentTime) {
    return { state: current, applied: false, reason: "stale_timestamp" };
  }
  if (current.orderId && event.orderId && current.orderId !== event.orderId && current.paymentStatus !== "idle") {
    return { state: current, applied: false, reason: "stale_order" };
  }
  const sameOrder = !event.orderId || !current.orderId || event.orderId === current.orderId;
  const sameStatus = current.paymentStatus === event.paymentStatus;
  const addsDocumentedData = Boolean(
    (!current.orderId && event.orderId)
    || (!current.orderNumber && event.orderNumber)
    || (!current.completedAt && event.completedAt)
    || (!current.paymentErrorMessage && event.paymentErrorMessage),
  );
  if (sameOrder && sameStatus && !addsDocumentedData) {
    return { state: current, applied: false, reason: "duplicate" };
  }
  if (!sameStatus && !LEGAL_TRANSITIONS[current.paymentStatus].has(event.paymentStatus)) {
    return { state: current, applied: false, reason: "invalid_transition" };
  }
  const now = event.updatedAt ?? new Date().toISOString();
  const next: NoriOrderLifecycleState = {
    ...current,
    paymentMethod: event.paymentMethod ?? current.paymentMethod,
    paymentStatus: event.paymentStatus,
    orderStatus: event.orderStatus ?? orderStatusForPayment(event.paymentStatus, current.orderStatus),
    orderId: event.orderId ?? current.orderId,
    orderNumber: event.orderNumber ?? current.orderNumber,
    updatedAt: now,
  };
  if (event.paymentStatus === "completed") {
    next.completedAt = event.completedAt ?? current.completedAt ?? now;
    delete next.paymentErrorCode;
    delete next.paymentErrorMessage;
  } else if (event.paymentStatus === "failed") {
    next.paymentErrorCode = event.paymentErrorCode;
    next.paymentErrorMessage = safePaymentError(event.paymentErrorMessage);
  } else {
    delete next.paymentErrorCode;
    delete next.paymentErrorMessage;
  }
  return { state: next, applied: true };
}

export function shouldClearActiveCart(status: NoriPaymentStatus) {
  return status === "completed" || status === "pay_at_cashier_pending";
}

export function isTerminalPaymentStatus(status: NoriPaymentStatus) {
  return status === "completed" || status === "pay_at_cashier_pending";
}

function orderStatusForPayment(status: NoriPaymentStatus, current: NoriOrderStatus): NoriOrderStatus {
  if (status === "completed") return "paid";
  if (status === "pay_at_cashier_pending") return "accepted";
  if (status === "cancelled") return "cancelled";
  if (status === "pending" || status === "processing" || status === "failed") return "awaiting_payment";
  return current;
}

function timestamp(value?: string) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safePaymentError(value?: string) {
  if (!value) return undefined;
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}
