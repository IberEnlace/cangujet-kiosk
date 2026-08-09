import { createHash, randomUUID } from "node:crypto";
import type {
  OrderApiError,
  OrderCreateRequest,
  OrderErrorCode,
  OrderPaymentRequest,
  OrderPaymentResult,
  OrderQuote,
  OrderQuoteRequest,
  OrderTracking,
  ProductionOrder,
  ProductionOrderStatus,
} from "../../shared/orders";
import type {
  OrderActor,
  OrderPricingContext,
  OrderRepository,
  PricingModifier,
} from "../repositories/orderRepository";
import { IdempotencyConflictError } from "../repositories/orderRepository";
import { DeviceApiFailure, type DeviceIdentityApplication } from "./deviceIdentityService";

const MAX_LINES = 50;
const MAX_ITEM_QUANTITY = 20;
const MAX_TOTAL_QUANTITY = 100;
const ALLOWED_TRANSITIONS: Readonly<Record<ProductionOrderStatus, readonly ProductionOrderStatus[]>> = {
  draft: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["paid", "payment_failed", "cancelled"],
  paid: ["submitted", "cancelled"],
  submitted: ["accepted", "rejected", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed"],
  completed: [],
  cancelled: [],
  payment_failed: ["awaiting_payment", "cancelled"],
  rejected: [],
};

export class OrderDomainFailure extends Error {
  constructor(
    public readonly code: OrderErrorCode,
    public readonly status: number,
    message: string,
    public readonly itemIndex?: number,
    public readonly productId?: string,
    public readonly details?: Record<string, unknown>,
    public readonly internalCause?: unknown,
  ) {
    super(message);
    this.name = "OrderDomainFailure";
  }

  toJSON(requestId: string): OrderApiError {
    return {
      code: this.code,
      message: this.message,
      requestId,
      ...(this.itemIndex === undefined ? {} : { itemIndex: this.itemIndex }),
      ...(this.productId ? { productId: this.productId } : {}),
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export class OrderDomainService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly deviceIdentity: DeviceIdentityApplication,
  ) {}

  async authenticate(accessToken: string): Promise<OrderActor> {
    try {
      const identity = await this.deviceIdentity.authorize(accessToken);
      return {
        actorType: "device",
        actorId: identity.deviceId,
        restaurantId: identity.restaurantId,
        branchId: identity.branchId,
        deviceId: identity.deviceId,
        role: "device",
        deviceType: identity.deviceType,
      };
    } catch (error) {
      if (error instanceof DeviceApiFailure && error.status !== 401) {
        throw new OrderDomainFailure(
          error.status === 403 ? "unauthorized" : "server_error",
          error.status === 403 ? 403 : 503,
          error.status === 403 ? error.message : "The authentication service is unavailable.",
          undefined,
          undefined,
          undefined,
          error,
        );
      }
      if (!(error instanceof DeviceApiFailure)) {
        throw new OrderDomainFailure("server_error", 503, "The authentication service is unavailable.", undefined, undefined, undefined, error);
      }
    }
    try {
      const staff = await this.repository.authenticateStaff(accessToken);
      if (staff === "forbidden") throw new OrderDomainFailure("unauthorized", 403, "Cashier access is required.");
      if (staff) return staff;
      throw new OrderDomainFailure("unauthorized", 401, "Authentication is required.");
    } catch (error) {
      if (error instanceof OrderDomainFailure) throw error;
      throw new OrderDomainFailure("server_error", 503, "The authentication service is unavailable.", undefined, undefined, undefined, error);
    }
  }

  async quote(actor: OrderActor, request: OrderQuoteRequest): Promise<OrderQuote> {
    requireOrderingActor(actor);
    const context = await this.repository.loadPricingContext(actor);
    if (!context) throw new OrderDomainFailure("server_error", 503, "Ordering configuration is unavailable.");
    validateRequest(request, context);
    return calculateQuote(request, context);
  }

  async create(actor: OrderActor, request: OrderCreateRequest) {
    assertIdempotencyKey(request.idempotencyKey);
    const source = isCashierPaymentActor(actor) ? "cashier" : request.source === "nori" ? "nori" : "kiosk";
    const fingerprint = fingerprintOrderCreatePayload(request, source);
    let existingOrderId: string | null = null;
    let existingFingerprint: string | null = null;
    try {
      const existing = await this.repository.findExistingOrderForIdempotency?.(actor, source, request.idempotencyKey);
      if (existing) {
        existingOrderId = existing.id;
        existingFingerprint = existing.request_fingerprint;
      }
    } catch {
      // The atomic database RPC remains authoritative if this optional lookup fails.
    }

    console.info("order_create_idempotency_check", {
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: fingerprint,
      existingFingerprint,
      existingOrderId,
      conflict: existingFingerprint !== null && existingFingerprint !== fingerprint,
    });

    if (existingFingerprint !== null && existingFingerprint !== fingerprint) {
      throw new OrderDomainFailure(
        "idempotency_conflict",
        409,
        "This order attempt key belongs to a different cart. Retry with a fresh attempt key.",
        undefined,
        undefined,
        {
          existingOrderId: existingOrderId ?? undefined,
          conflictReason: "fingerprint_mismatch",
          retryable: true,
        },
      );
    }

    const quote = await this.quote(actor, request);
    if (actor.role === "kitchen") throw new OrderDomainFailure("unauthorized", 403, "Kitchen users cannot create orders.");

    try {
      return await this.repository.createOrder({
        actor,
        source,
        idempotencyKey: request.idempotencyKey,
        requestFingerprint: fingerprint,
        notes: normalizedOptionalText(request.notes, 500),
        quote,
      });
    } catch (error) {
      throw mapRepositoryFailure(error);
    }
  }

  async get(actor: OrderActor, orderId: string) {
    requireOrderingActor(actor);
    const order = await this.repository.getOrder(actor, orderId);
    if (!order) throw new OrderDomainFailure("order_not_found", 404, "Order not found.");
    return order;
  }

  async tracking(customerReference: string): Promise<OrderTracking> {
    if (!/^[a-f0-9]{48}$/i.test(customerReference)) {
      throw new OrderDomainFailure("order_not_found", 404, "Order tracking is unavailable.");
    }
    const tracking = await this.repository.getTracking(customerReference);
    if (!tracking) throw new OrderDomainFailure("order_not_found", 404, "Order tracking is unavailable.");
    return tracking;
  }

  async active(actor: OrderActor, audience: "kitchen" | "cashier") {
    const isKitchenAuthorized = ["kitchen", "admin"].includes(actor.role) || (actor.role === "device" && actor.deviceType === "kitchen_display");
    if (audience === "kitchen" && !isKitchenAuthorized) {
      throw new OrderDomainFailure("unauthorized", 403, "Kitchen access is required.");
    }
    const isCashierAuthorized = ["cashier", "admin"].includes(actor.role) || (actor.role === "device" && actor.deviceType === "cashier_terminal");
    if (audience === "cashier" && !isCashierAuthorized) {
      throw new OrderDomainFailure("unauthorized", 403, "Cashier access is required.");
    }
    return this.repository.listActiveOrders(actor, audience);
  }

  async pendingCashierOrders(actor: OrderActor) {
    if (!isCashierPaymentActor(actor)) {
      throw new OrderDomainFailure("unauthorized", 403, "Cashier access is required.");
    }
    return this.repository.listPendingCashierOrders(actor);
  }

  async display(actor: OrderActor) {
    // The selected UI mode is not part of the immutable device credential. Any
    // authenticated branch device may render this deliberately small projection;
    // repository scoping still binds the read to the token's restaurant/branch.
    if (actor.role !== "admin" && actor.role !== "device") {
      throw new OrderDomainFailure("unauthorized", 403, "Order display access is required.");
    }
    const orders = await this.repository.listActiveOrders(actor, "display");
    return orders
      .filter((order): order is ProductionOrder & { status: "preparing" | "ready" | "completed" } =>
        order.status === "preparing" || order.status === "ready" || order.status === "completed")
      .map(order => ({
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt,
        readyAt: order.readyAt,
        completedAt: order.completedAt,
      }));
  }

  async pay(actor: OrderActor, orderId: string, request: OrderPaymentRequest): Promise<OrderPaymentResult & { duplicate: boolean }> {
    assertIdempotencyKey(request.idempotencyKey);
    if (!["cash", "pay_at_cashier", "card_terminal"].includes(request.method)) {
      throw new OrderDomainFailure("invalid_order_request", 400, "A supported payment method is required.");
    }
    const order = await this.repository.getOrder(actor, orderId);
    if (!order) throw new OrderDomainFailure("order_not_found", 404, "Order not found.");
    if (!["awaiting_payment", "payment_failed", "paid"].includes(order.status)) {
      throw new OrderDomainFailure("invalid_order_transition", 409, "This order is not awaiting payment.");
    }
    if (actor.role === "kitchen" || (actor.role === "device" && actor.deviceType === "kitchen_display")) {
      throw new OrderDomainFailure("unauthorized", 403, "Kitchen users cannot collect payments.");
    }
    if (request.method === "pay_at_cashier") {
      if (!(actor.role === "device" && actor.deviceType === "kiosk")) {
        throw new OrderDomainFailure("unauthorized", 403, "Only the ordering kiosk can defer payment to the cashier.");
      }
    } else if (order.paymentMethod === "pay_at_cashier" && !isCashierPaymentActor(actor)) {
      throw new OrderDomainFailure("unauthorized", 403, "A cashier must collect this deferred payment.");
    } else if (order.status !== "paid" && order.source === "kiosk" && isCashierPaymentActor(actor) && order.paymentMethod !== "pay_at_cashier") {
      throw new OrderDomainFailure("invalid_order_request", 409, "This kiosk order was not created for Pay at Cashier.");
    }
    if (request.method === "cash" && !isCashierPaymentActor(actor)) {
      throw new OrderDomainFailure("unauthorized", 403, "Cash payments must be recorded by a cashier.");
    }
    const amountReceived = request.amountReceived == null ? null : normalizeMoney(request.amountReceived);
    if (request.method === "cash" && moneyToMinor(amountReceived ?? "0") < moneyToMinor(order.total)) {
      throw new OrderDomainFailure("payment_failed", 422, "The amount received does not cover the order total.");
    }
    const captured = request.method !== "pay_at_cashier";
    try {
      return await this.repository.recordPayment({
        actor,
        order,
        idempotencyKey: request.idempotencyKey,
        requestFingerprint: fingerprintRequest(request),
        method: request.method,
        amountReceived,
        externalReference: normalizedOptionalText(request.externalReference, 200),
        captured,
      });
    } catch (error) {
      throw mapRepositoryFailure(error);
    }
  }

  async submit(actor: OrderActor, orderId: string, expectedVersion: number) {
    const order = await this.repository.getOrder(actor, orderId);
    if (!order) throw new OrderDomainFailure("order_not_found", 404, "Order not found.");
    if (order.status === "submitted") {
      return order;
    }
    if (order.status !== "paid") {
      throw new OrderDomainFailure("invalid_order_transition", 409, `Order cannot move from ${order.status} to submitted.`);
    }
    if (order.version !== expectedVersion) {
      throw new OrderDomainFailure("order_conflict", 409, "The order changed elsewhere. Refresh and try again.");
    }
    enforceTransitionRole(actor, order, "submitted");
    try {
      const result = await this.repository.transitionOrder({
        actor,
        orderId,
        expectedVersion,
        nextStatus: "submitted",
        reason: null,
      });
      if (!result || result.status !== "submitted") {
        throw new OrderDomainFailure("server_error", 500, "Submitted order status could not be verified.");
      }
      return result;
    } catch (error) {
      throw mapRepositoryFailure(error);
    }
  }

  async transition(
    actor: OrderActor,
    orderId: string,
    nextStatus: ProductionOrderStatus,
    expectedVersion: number,
    reason: string | null,
  ) {
    const order = await this.get(actor, orderId);
    if (order.version !== expectedVersion) {
      throw new OrderDomainFailure("order_conflict", 409, "The order changed elsewhere. Refresh and try again.");
    }
    if (!ALLOWED_TRANSITIONS[order.status].includes(nextStatus)) {
      throw new OrderDomainFailure("invalid_order_transition", 409, `Order cannot move from ${order.status} to ${nextStatus}.`);
    }
    enforceTransitionRole(actor, order, nextStatus);
    const normalizedReason = normalizedOptionalText(reason, 500);
    if (["cancelled", "rejected"].includes(nextStatus) && !normalizedReason) {
      throw new OrderDomainFailure("invalid_order_request", 400, "A reason is required.");
    }
    try {
      return await this.repository.transitionOrder({
        actor,
        orderId,
        expectedVersion,
        nextStatus,
        reason: normalizedReason,
      });
    } catch (error) {
      throw mapRepositoryFailure(error);
    }
  }

  async cancel(actor: OrderActor, orderId: string, expectedVersion: number, reason: string) {
    return this.transition(actor, orderId, "cancelled", expectedVersion, reason);
  }
}

export function calculateQuote(request: OrderQuoteRequest, context: OrderPricingContext): OrderQuote {
  validateRequest(request, context);
  const productById = new Map(context.products.map(value => [value.id, value]));
  const groupsByProduct = groupBy(context.modifierGroups, value => value.productId);
  const modifierById = new Map(context.modifiers.map(value => [value.id, value]));
  const modifiersByGroup = groupBy(context.modifiers, value => value.groupId);
  let subtotalMinor = 0;
  let taxMinor = 0;
  const taxRate = decimalRate(context.taxRate);
  const items = request.items.map((item, itemIndex) => {
    const product = productById.get(item.productId);
    if (!product) {
      throw new OrderDomainFailure("product_unavailable", 422, "This product is no longer available.", itemIndex, item?.productId);
    }
    const selected = item.modifierIds.map(id => {
      const modifier = modifierById.get(id);
      if (!modifier) {
        throw new OrderDomainFailure("modifier_unavailable", 422, "A selected modifier is unavailable.", itemIndex, product.id);
      }
      return modifier;
    });
    validateSelections(itemIndex, product.id, selected, groupsByProduct.get(product.id) ?? [], modifiersByGroup);
    const unitMinor = moneyToMinor(product.price);
    const modifierUnitMinor = selected.reduce((sum, value) => sum + moneyToMinor(value.price), 0);
    const lineSubtotalMinor = (unitMinor + modifierUnitMinor) * item.quantity;
    const lineTaxMinor = roundRate(lineSubtotalMinor, taxRate);
    subtotalMinor += lineSubtotalMinor;
    taxMinor += lineTaxMinor;
    const groups = new Map(context.modifierGroups.map(value => [value.id, value]));
    return {
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: minorToMoney(unitMinor),
      lineSubtotal: minorToMoney(lineSubtotalMinor),
      taxTotal: minorToMoney(lineTaxMinor),
      lineTotal: minorToMoney(lineSubtotalMinor + lineTaxMinor),
      taxRate: normalizeRate(context.taxRate),
      notes: normalizedOptionalText(item.notes, 300),
      sortOrder: itemIndex,
      allergens: product.allergens ?? [],
      modifiers: selected.map(modifier => ({
        modifierGroupId: modifier.groupId,
        modifierId: modifier.id,
        groupName: groups.get(modifier.groupId)?.name ?? "",
        name: modifier.name,
        quantity: item.quantity,
        unitPrice: normalizeMoney(modifier.price),
        total: minorToMoney(moneyToMinor(modifier.price) * item.quantity),
      })),
    };
  });
  return {
    menuId: context.menuId,
    menuVersion: context.menuVersion,
    currency: context.currency,
    subtotal: minorToMoney(subtotalMinor),
    taxTotal: minorToMoney(taxMinor),
    discountTotal: "0.00",
    total: minorToMoney(subtotalMinor + taxMinor),
    serviceMode: request.serviceMode,
    language: request.language,
    items,
  };
}

export function isAllowedTransition(from: ProductionOrderStatus, to: ProductionOrderStatus) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

function validateRequest(request: OrderQuoteRequest, context: OrderPricingContext) {
  if (!request || typeof request !== "object" || !Array.isArray(request.items)) {
    throw new OrderDomainFailure("invalid_order_request", 400, "A valid order request is required.");
  }
  if (!context.serviceModes.includes(request.serviceMode)) {
    throw new OrderDomainFailure("unsupported_service_mode", 422, "This service mode is not available.");
  }
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(request.language)) {
    throw new OrderDomainFailure("invalid_order_request", 400, "A valid order language is required.");
  }
  if (request.items.length < 1 || request.items.length > MAX_LINES) {
    throw new OrderDomainFailure("invalid_order_request", 400, "An order must contain between 1 and 50 items.");
  }
  const totalQuantity = request.items.reduce((sum, value) => sum + (Number.isInteger(value.quantity) ? value.quantity : 0), 0);
  if (totalQuantity < 1 || totalQuantity > MAX_TOTAL_QUANTITY) {
    throw new OrderDomainFailure("invalid_order_request", 400, "The total item quantity is invalid.");
  }
  const productById = new Map(context.products.map(value => [value.id, value]));
  request.items.forEach((item, itemIndex) => {
    if (!item || typeof item !== "object" || typeof item.productId !== "string"
      || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_ITEM_QUANTITY
      || !Array.isArray(item.modifierIds) || item.modifierIds.some(value => typeof value !== "string")) {
      throw new OrderDomainFailure("invalid_cart_item", 422, "This cart item is invalid.", itemIndex, item?.productId);
    }
    const product = productById.get(item.productId);
    if (!product || !product.active || !product.available || !product.categoryActive || !product.categoryVisible) {
      throw new OrderDomainFailure("product_unavailable", 422, "This product is no longer available.", itemIndex, item.productId);
    }
    if (product.currency !== context.currency) {
      throw new OrderDomainFailure("price_changed", 409, "The menu currency changed. Refresh the menu.", itemIndex, item.productId);
    }
    if (new Set(item.modifierIds).size !== item.modifierIds.length) {
      throw new OrderDomainFailure("modifier_selection_limit", 422, "A modifier cannot be selected more than once.", itemIndex, item.productId);
    }
  });
}

function validateSelections(
  itemIndex: number,
  productId: string,
  selected: PricingModifier[],
  groups: OrderPricingContext["modifierGroups"],
  modifiersByGroup: Map<string, PricingModifier[]>,
) {
  if (selected.some(value => !value || !value.available)) {
    throw new OrderDomainFailure("modifier_unavailable", 422, "A selected modifier is unavailable.", itemIndex, productId);
  }
  const groupIds = new Set(groups.map(value => value.id));
  if (selected.some(value => !groupIds.has(value.groupId))) {
    throw new OrderDomainFailure("modifier_unavailable", 422, "A modifier does not belong to this product.", itemIndex, productId);
  }
  for (const group of groups) {
    const availableIds = new Set((modifiersByGroup.get(group.id) ?? []).filter(value => value.available).map(value => value.id));
    const count = selected.filter(value => value.groupId === group.id && availableIds.has(value.id)).length;
    if (count < group.minimumSelections || (group.required && count === 0)) {
      throw new OrderDomainFailure("required_modifier_missing", 422, `${group.name} requires another selection.`, itemIndex, productId, { modifierGroupId: group.id });
    }
    if (count > group.maximumSelections) {
      throw new OrderDomainFailure("modifier_selection_limit", 422, `${group.name} has too many selections.`, itemIndex, productId, { modifierGroupId: group.id });
    }
  }
}

function enforceTransitionRole(actor: OrderActor, order: ProductionOrder, next: ProductionOrderStatus) {
  if (actor.role === "device") {
    const canSubmit = next === "submitted" && (actor.deviceType === "kiosk" || actor.deviceType === "cashier_terminal");
    const canCancel = next === "cancelled" && (actor.deviceType === "kiosk" || actor.deviceType === "cashier_terminal");
    const allowed = canSubmit || canCancel;
    if (!allowed || (next === "cancelled" && !["draft", "awaiting_payment", "paid", "submitted"].includes(order.status))) {
      throw new OrderDomainFailure("unauthorized", 403, "The device cannot perform this transition.");
    }
  }
  if (actor.role === "cashier" && !["paid", "submitted", "cancelled", "completed"].includes(next)) {
    throw new OrderDomainFailure("unauthorized", 403, "The cashier cannot perform this transition.");
  }
  if (actor.role === "kitchen" && !["accepted", "preparing", "ready", "completed", "rejected", "cancelled"].includes(next)) {
    throw new OrderDomainFailure("unauthorized", 403, "The kitchen cannot perform this transition.");
  }
}

function requireOrderingActor(actor: OrderActor) {
  if (actor.role === "device" && actor.deviceType !== "kiosk" && actor.deviceType !== "cashier_terminal") {
    throw new OrderDomainFailure("unauthorized", 403, "This device is not authorized to place orders.");
  }
}

function isCashierPaymentActor(actor: OrderActor) {
  return actor.role === "cashier"
    || actor.role === "admin"
    || (actor.role === "device" && actor.deviceType === "cashier_terminal");
}

function assertIdempotencyKey(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new OrderDomainFailure("invalid_order_request", 400, "A valid idempotency key is required.");
  }
}

export function fingerprintOrderCreatePayload(request: OrderCreateRequest, source: string) {
  const normalizedPayload = {
    source,
    serviceMode: request.serviceMode,
    language: request.language,
    notes: normalizedOptionalText(request.notes, 500),
    items: (request.items ?? []).map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      modifierIds: [...(item.modifierIds ?? [])].sort(),
      notes: normalizedOptionalText(item.notes, 300),
    })),
  };
  return fingerprintRequest(normalizedPayload);
}

export function fingerprintRequest(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function moneyToMinor(value: unknown): number {
  const normalized = normalizeMoney(value);
  const [whole, fraction] = normalized.split(".");
  return Number(whole) * 100 + Number(fraction);
}

export function minorToMoney(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new OrderDomainFailure("invalid_order_request", 400, "A valid monetary total is required.");
  }
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

export function normalizeMoney(value: unknown): string {
  if (value === null || value === undefined || value === "") return "0.00";
  let str: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new OrderDomainFailure("invalid_order_request", 400, "A valid monetary amount is required.");
    }
    str = value.toFixed(2);
  } else if (typeof value === "string") {
    str = value.trim();
    if (!str) return "0.00";
  } else {
    throw new OrderDomainFailure("invalid_order_request", 400, "A valid monetary amount is required.");
  }
  const num = Number(str);
  if (Number.isNaN(num) || !Number.isFinite(num) || num < 0 || num > 9999999999) {
    throw new OrderDomainFailure("invalid_order_request", 400, "A valid monetary amount is required.");
  }
  return num.toFixed(2);
}

export function decimalRate(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (Number.isNaN(num) || num < 0 || num > 1) {
    throw new OrderDomainFailure("invalid_order_request", 400, "A valid tax rate is required.");
  }
  return Math.round(num * 1_000_000);
}

export function normalizeRate(value: unknown): string {
  return (decimalRate(value) / 1_000_000).toFixed(6);
}

function roundRate(minor: number, micros: number) {
  return Math.floor((minor * micros + 500_000) / 1_000_000);
}

function normalizedOptionalText(value: unknown, maxLength: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new OrderDomainFailure("invalid_order_request", 400, "Order text is invalid.");
  }
  return value.trim() || null;
}

function groupBy<T>(values: T[], key: (value: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const value of values) grouped.set(key(value), [...(grouped.get(key(value)) ?? []), value]);
  return grouped;
}

function mapRepositoryFailure(error: unknown) {
  if (error instanceof OrderDomainFailure) return error;
  // Typed conflict from the repository layer (same key + different fingerprint).
  if (error instanceof IdempotencyConflictError) {
    return new OrderDomainFailure(
      "idempotency_conflict",
      409,
      "This idempotency key was already used for a different request.",
      undefined,
      undefined,
      {
        existingOrderId: error.existingOrderId ?? undefined,
        conflictReason: error.conflictReason,
      },
      error,
    );
  }
  const message = error instanceof Error ? error.message : "server_error";
  if (message.includes("idempotency_conflict")) return new OrderDomainFailure("idempotency_conflict", 409, "This idempotency key was already used for a different request.", undefined, undefined, undefined, error);
  if (message.includes("price_changed")) return new OrderDomainFailure("price_changed", 409, "The menu changed. Refresh and review the order.", undefined, undefined, undefined, error);
  if (message.includes("order_conflict")) return new OrderDomainFailure("order_conflict", 409, "The order changed elsewhere. Refresh and try again.", undefined, undefined, undefined, error);
  if (message.includes("invalid_order_transition")) return new OrderDomainFailure("invalid_order_transition", 409, "This order transition is no longer valid.", undefined, undefined, undefined, error);
  if (message.includes("order_not_found")) return new OrderDomainFailure("order_not_found", 404, "Order not found.", undefined, undefined, undefined, error);
  return new OrderDomainFailure("server_error", 500, "The order service could not complete the request.", undefined, undefined, undefined, error);
}

export function createRequestId() {
  return randomUUID();
}
