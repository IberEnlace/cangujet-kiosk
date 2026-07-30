import type {
  OrderApiError,
  OrderCreateRequest,
  OrderPaymentRequest,
  OrderPaymentResult,
  OrderQuote,
  OrderQuoteRequest,
  OrderTracking,
  OrderTransitionRequest,
  ProductionOrder,
} from "../../../shared/orders";
import { DEVICE_ACCESS_TOKEN_STORAGE_KEY } from "../device/DeviceConfigurationService";
import { getStaffAccessToken } from "../supabase/authService";

export type OrderAuthentication = "device" | "staff" | "none";
export type OrderServiceOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export class OrderClientError extends Error {
  constructor(
    public readonly code: OrderApiError["code"],
    message: string,
    public readonly status: number,
    public readonly requestId = "",
    public readonly itemIndex?: number,
    public readonly productId?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OrderClientError";
  }
}

export class OrderService {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: OrderServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => window.fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  quote(request: OrderQuoteRequest, authentication: OrderAuthentication = "device") {
    return this.request<OrderQuote>("/orders/quote", { method: "POST", body: request }, authentication);
  }

  create(request: OrderCreateRequest, authentication: OrderAuthentication = "device") {
    return this.request<ProductionOrder>("/orders", { method: "POST", body: request }, authentication);
  }

  get(orderId: string, authentication: OrderAuthentication = "device") {
    return this.request<ProductionOrder>(`/orders/${encodeURIComponent(orderId)}`, {}, authentication);
  }

  listActive(authentication: OrderAuthentication = "staff") {
    return this.request<ProductionOrder[]>("/orders/active", {}, authentication);
  }

  listKitchen() {
    return this.request<ProductionOrder[]>("/kitchen/orders", {}, "staff");
  }

  listDisplay() {
    return this.request<ProductionOrder[]>("/orders/display", {}, "device");
  }

  pay(orderId: string, request: OrderPaymentRequest, authentication: OrderAuthentication = "device") {
    return this.request<OrderPaymentResult & { duplicate?: boolean }>(
      `/orders/${encodeURIComponent(orderId)}/payments`,
      { method: "POST", body: request },
      authentication,
    );
  }

  submit(orderId: string, expectedVersion: number, authentication: OrderAuthentication = "device") {
    return this.request<ProductionOrder>(
      `/orders/${encodeURIComponent(orderId)}/submit`,
      { method: "POST", body: { expectedVersion } },
      authentication,
    );
  }

  transition(orderId: string, request: OrderTransitionRequest) {
    return this.request<ProductionOrder>(
      `/orders/${encodeURIComponent(orderId)}/status`,
      { method: "POST", body: request },
      "staff",
    );
  }

  cancel(orderId: string, expectedVersion: number, reason: string, authentication: OrderAuthentication) {
    return this.request<ProductionOrder>(
      `/orders/${encodeURIComponent(orderId)}/cancel`,
      { method: "POST", body: { expectedVersion, reason } },
      authentication,
    );
  }

  tracking(customerReference: string) {
    return this.request<OrderTracking>(
      `/orders/tracking/${encodeURIComponent(customerReference)}`,
      {},
      "none",
    );
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown },
    authentication: OrderAuthentication,
  ): Promise<T> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new OrderClientError("offline", "Ordering requires an internet connection. Your cart is safe.", 0);
    }
    const token = await authorizationToken(authentication);
    if (authentication !== "none" && !token) {
      throw new OrderClientError("unauthorized", "Your session is no longer available. Please sign in again.", 401);
    }
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
    const requestId = crypto.randomUUID();
    try {
      const fetchImpl = this.fetchImpl;
      const response = await fetchImpl(`/api/v1${path}`, {
        method: options.method ?? "GET",
        credentials: "include",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "x-request-id": requestId,
          ...(options.body === undefined ? {} : { "content-type": "application/json" }),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
      const text = await response.text();
      const body = parseBody(text);
      if (!response.ok) throw toClientError(response.status, response.headers.get("x-request-id") ?? requestId, body);
      if (body === null) throw new OrderClientError("server_error", "The order service returned an empty response.", response.status, requestId);
      return body as T;
    } catch (error) {
      if (error instanceof OrderClientError) throw error;
      if (isAbortError(error)) {
        throw new OrderClientError("timeout", "The request timed out. Retry safely without changing your cart.", 0, requestId);
      }
      throw new OrderClientError(
        "offline",
        error instanceof Error ? error.message : "The order service is unreachable. Your cart is safe.",
        0,
        requestId,
      );
    } finally {
      globalThis.clearTimeout(timer);
    }
  }
}

export const orderService = new OrderService();

async function authorizationToken(authentication: OrderAuthentication) {
  if (authentication === "none") return null;
  if (authentication === "staff") return getStaffAccessToken();
  try {
    return sessionStorage.getItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function parseBody(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new OrderClientError("server_error", "The order service returned malformed data.", 502);
  }
}

function toClientError(status: number, requestId: string, body: unknown) {
  if (isApiError(body)) {
    return new OrderClientError(
      body.code,
      body.message,
      status,
      body.requestId || requestId,
      body.itemIndex,
      body.productId,
      body.details,
    );
  }
  return new OrderClientError("server_error", `The order service rejected the request (${status}).`, status, requestId);
}

function isApiError(value: unknown): value is OrderApiError {
  return Boolean(value && typeof value === "object" && "code" in value && "message" in value
    && typeof (value as OrderApiError).code === "string" && typeof (value as OrderApiError).message === "string");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
