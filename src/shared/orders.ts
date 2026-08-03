export type ProductionOrderStatus =
  | "draft"
  | "awaiting_payment"
  | "paid"
  | "submitted"
  | "accepted"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled"
  | "payment_failed"
  | "rejected";

export type ProductionPaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded"
  | "cancelled";

export type ProductionPaymentMethod = "cash" | "pay_at_cashier" | "card_terminal" | "qr";
export type ProductionOrderSource = "kiosk" | "cashier" | "nori";
export type ProductionServiceMode = "dine_in" | "take_away";

export type OrderRequestItem = {
  productId: string;
  quantity: number;
  modifierIds: string[];
  notes?: string;
};

export type OrderQuoteRequest = {
  items: OrderRequestItem[];
  serviceMode: ProductionServiceMode;
  language: string;
  notes?: string;
};

export type OrderModifierSnapshot = {
  modifierGroupId: string;
  modifierId: string;
  groupName: string;
  name: string;
  quantity: number;
  unitPrice: string;
  total: string;
};

export type OrderItemSnapshot = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  lineSubtotal: string;
  taxTotal: string;
  lineTotal: string;
  taxRate: string;
  notes: string | null;
  sortOrder: number;
  allergens: string[];
  modifiers: OrderModifierSnapshot[];
};

export type OrderQuote = {
  menuId: string;
  menuVersion: number;
  currency: string;
  subtotal: string;
  taxTotal: string;
  discountTotal: string;
  total: string;
  serviceMode: ProductionServiceMode;
  language: string;
  items: OrderItemSnapshot[];
};

export type ProductionOrder = OrderQuote & {
  id: string;
  orderNumber: string;
  status: ProductionOrderStatus;
  paymentStatus: ProductionPaymentStatus | null;
  paymentMethod: ProductionPaymentMethod | null;
  source: ProductionOrderSource;
  customerReference: string;
  version: number;
  notes: string | null;
  placedAt: string | null;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderStatusDisplayStatus = Extract<ProductionOrderStatus, "preparing" | "ready" | "completed">;

/** Branch-scoped, customer-safe projection returned to the public order board. */
export type OrderStatusDisplayOrder = Pick<
  ProductionOrder,
  "orderNumber" | "createdAt" | "readyAt" | "completedAt"
> & {
  status: OrderStatusDisplayStatus;
};

export type OrderCreateRequest = OrderQuoteRequest & {
  idempotencyKey: string;
  source?: ProductionOrderSource;
};

export type OrderPaymentRequest = {
  idempotencyKey: string;
  method: ProductionPaymentMethod;
  amountReceived?: string;
  externalReference?: string;
};

export type OrderPaymentResult = {
  order: ProductionOrder;
  paymentId: string;
  paymentStatus: ProductionPaymentStatus;
  amount: string;
  change: string;
};

export type QrPaymentStatus = "pending" | "processing" | "paid" | "expired" | "cancelled" | "failed";

export type QrPaymentSession = {
  paymentSessionId: string;
  paymentReference: string;
  orderId: string;
  orderNumber: string;
  status: QrPaymentStatus;
  qrPayload: string;
  qrCode: string;
  amount: string;
  currency: string;
  expiresAt: string;
  providerName: string;
  duplicate: boolean;
  order: ProductionOrder;
};

export type QrPaymentCreateRequest = {
  idempotencyKey: string;
  replaceExpired?: boolean;
};

export type QrPaymentWebhookEvent = {
  eventId: string;
  type: "payment.pending" | "payment.processing" | "payment.paid" | "payment.expired" | "payment.cancelled" | "payment.failed";
  createdAt: string;
  data: {
    providerSessionId?: string;
    paymentReference: string;
    providerTransactionId?: string;
    amount: string;
    currency: string;
    failureCode?: string;
  };
};

export type OrderTransitionRequest = {
  nextStatus: ProductionOrderStatus;
  expectedVersion: number;
  reason?: string;
};

export type OrderTracking = Pick<
  ProductionOrder,
  | "orderNumber"
  | "status"
  | "version"
  | "placedAt"
  | "acceptedAt"
  | "preparingAt"
  | "readyAt"
  | "completedAt"
  | "cancelledAt"
  | "updatedAt"
>;

export type OrderErrorCode =
  | "invalid_order_request"
  | "invalid_cart_item"
  | "product_unavailable"
  | "modifier_unavailable"
  | "required_modifier_missing"
  | "modifier_selection_limit"
  | "unsupported_service_mode"
  | "price_changed"
  | "payment_required"
  | "payment_failed"
  | "payment_expired"
  | "order_not_found"
  | "invalid_order_transition"
  | "order_conflict"
  | "idempotency_conflict"
  | "unauthorized"
  | "offline"
  | "timeout"
  | "server_error"
  | "order_quote_failed";

export type OrderApiError = {
  code: OrderErrorCode;
  message: string;
  requestId: string;
  itemIndex?: number;
  productId?: string;
  /** Existing resource that owns a key reused with a different request payload. */
  existingOrderId?: string;
  details?: Record<string, unknown>;
};
