import type {
  OrderApiError,
  OrderCreateRequest,
  OrderPaymentRequest,
  OrderPaymentResult,
  OrderQuote,
  OrderQuoteRequest,
  QrPaymentCreateRequest,
  QrPaymentSession,
  OrderTracking,
  OrderStatusDisplayOrder,
  OrderTransitionRequest,
  ProductionOrder,
} from "../../../shared/orders";
import {
  DeviceTokenRefreshError,
  markDeviceSessionInvalid,
  readDeviceAccessToken,
  refreshDeviceAccessToken,
} from "../device/deviceTokenManager";
import {
  getStaffSessionCredential,
  invalidateStaffSession,
  refreshStaffSessionCredential,
} from "../supabase/authService";

export type OrderAuthentication = "device" | "staff" | "none";
export type OrderRequestContext = {
  /** Explicit per-request workflow correlation. Passing a context prevents
   * fallback to the mutable customer workflow stored by OrderContext. */
  workflowAttemptId?: string | null;
};
export type OrderServiceOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  credentialProvider?: OrderCredentialProvider;
};
export type OrderCredentialResult = { token: string | null; failure: "unauthenticated" | "unavailable" | "forbidden" | null };
export type OrderCredentialProvider = (
  authentication: Exclude<OrderAuthentication, "none">,
  refresh: boolean,
) => Promise<OrderCredentialResult>;

export class OrderClientError extends Error {
  constructor(
    public readonly code: OrderApiError["code"],
    message: string,
    public readonly status: number,
    public readonly requestId = "",
    public readonly itemIndex?: number,
    public readonly productId?: string,
    public readonly details?: Record<string, unknown>,
    public readonly existingOrderId?: string,
  ) {
    super(message);
    this.name = "OrderClientError";
  }
}

export class OrderService {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly credentialProvider: OrderCredentialProvider;
  /** Updated by OrderContext whenever the workflow attempt rotates. */
  private workflowAttemptId: string | null = null;

  constructor(options: OrderServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => window.fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.credentialProvider = options.credentialProvider ?? defaultCredentialProvider;
  }

  /** Called by OrderContext to bind the current workflow attempt ID to all requests. */
  setWorkflowAttemptId(id: string | null) {
    this.workflowAttemptId = id;
  }

  quote(request: OrderQuoteRequest, authentication: OrderAuthentication = "device") {
    return this.request<OrderQuote>("/orders/quote", { method: "POST", body: request }, authentication);
  }

  create(
    request: OrderCreateRequest,
    authentication: OrderAuthentication = "device",
    context?: OrderRequestContext,
  ) {
    return this.request<ProductionOrder>("/orders", { method: "POST", body: request }, authentication, context);
  }

  get(orderId: string, authentication: OrderAuthentication = "device") {
    return this.request<ProductionOrder>(`/orders/${encodeURIComponent(orderId)}`, {}, authentication);
  }

  listActive(authentication: OrderAuthentication = "staff") {
    return this.request<ProductionOrder[]>("/orders/active", {}, authentication);
  }

  listPendingCashierOrders(authentication: OrderAuthentication = "staff") {
    return this.request<ProductionOrder[]>("/cashier/pending-orders", {}, authentication, {
      workflowAttemptId: null,
    });
  }

  listKitchen(authentication: OrderAuthentication = "staff") {
    return this.request<ProductionOrder[]>("/kitchen/orders", {}, authentication);
  }

  listDisplay() {
    return this.request<OrderStatusDisplayOrder[]>("/orders/display", {}, "device", {
      workflowAttemptId: null,
    });
  }

  pay(
    orderId: string,
    request: OrderPaymentRequest,
    authentication: OrderAuthentication = "device",
    context?: OrderRequestContext,
  ) {
    return this.request<OrderPaymentResult & { duplicate?: boolean }>(
      `/orders/${encodeURIComponent(orderId)}/payments`,
      { method: "POST", body: request },
      authentication,
      context,
    );
  }

  createQrPayment(orderId: string, request: QrPaymentCreateRequest) {
    return this.request<QrPaymentSession>(
      `/orders/${encodeURIComponent(orderId)}/payments/qr`,
      { method: "POST", body: request },
      "device",
    );
  }

  getQrPayment(orderId: string, sessionId: string) {
    return this.request<QrPaymentSession>(
      `/orders/${encodeURIComponent(orderId)}/payments/qr/${encodeURIComponent(sessionId)}`,
      {},
      "device",
    );
  }

  cancelQrPayment(orderId: string, sessionId: string) {
    return this.request<QrPaymentSession>(
      `/orders/${encodeURIComponent(orderId)}/payments/qr/${encodeURIComponent(sessionId)}/cancel`,
      { method: "POST" },
      "device",
    );
  }

  submit(
    orderId: string,
    expectedVersion: number,
    authentication: OrderAuthentication = "device",
    context?: OrderRequestContext,
  ) {
    return this.request<ProductionOrder>(
      `/orders/${encodeURIComponent(orderId)}/submit`,
      { method: "POST", body: { expectedVersion } },
      authentication,
      context,
    );
  }

  transition(orderId: string, request: OrderTransitionRequest, authentication: OrderAuthentication = "staff") {
    return this.request<ProductionOrder>(
      `/orders/${encodeURIComponent(orderId)}/status`,
      { method: "POST", body: request },
      authentication,
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
    context?: OrderRequestContext,
  ): Promise<T> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new OrderClientError("offline", "Ordering requires an internet connection. Your cart is safe.", 0);
    }
    const requestId = crypto.randomUUID();
    const workflowAttemptId = context === undefined
      ? this.workflowAttemptId
      : context.workflowAttemptId ?? null;
    let token: string | null = null;
    if (authentication !== "none") {
      const credential = await this.resolveCredential(authentication, false, requestId);
      token = credential.token;
      if (!token) token = (await this.resolveCredential(authentication, true, requestId)).token;
      if (!token) throw unavailableSession(requestId);
    }
    let result = await this.execute(path, options, token, workflowAttemptId, requestId);
    if (result.response.status === 401 && authentication !== "none") {
      const latest = await this.resolveCredential(authentication, false, requestId);
      const refreshed = latest.token && latest.token !== token
        ? latest
        : await this.resolveCredential(authentication, true, requestId);
      if (!refreshed.token) throw unavailableSession(requestId);
      result = await this.execute(path, options, refreshed.token, workflowAttemptId, requestId);
      if (result.response.status === 401) await invalidateAuthentication(authentication);
    }
    if (result.response.status === 304) {
      throw new OrderClientError("server_error", "The order service returned a stale cached response. Please retry.", 304, requestId);
    }
    if (!result.response.ok) {
      throw toClientError(result.response.status, result.response.headers.get("x-request-id") ?? requestId, result.body);
    }
    if (result.body === null) {
      throw new OrderClientError("server_error", "The order service returned an empty response.", result.response.status, requestId);
    }
    return result.body as T;
  }

  private async resolveCredential(
    authentication: Exclude<OrderAuthentication, "none">,
    refresh: boolean,
    requestId: string,
  ) {
    const credential = await this.credentialProvider(authentication, refresh);
    if (credential.failure === "unavailable") {
      throw new OrderClientError("server_error", "The authentication service is temporarily unavailable.", 503, requestId);
    }
    if (credential.failure === "forbidden") {
      throw new OrderClientError("unauthorized", "This device is not authorized for Cashier access.", 403, requestId);
    }
    return credential;
  }

  private async execute(
    path: string,
    options: { method?: string; body?: unknown },
    token: string | null,
    workflowAttemptId: string | null,
    requestId: string,
  ) {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const fetchImpl = this.fetchImpl;
      const response = await fetchImpl(`/api/v1${path}`, {
        method: options.method ?? "GET",
        credentials: "include",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          accept: "application/json",
          "x-request-id": requestId,
          ...(workflowAttemptId ? { "x-workflow-attempt-id": workflowAttemptId } : {}),
          ...(options.body === undefined ? {} : { "content-type": "application/json" }),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
      return { response, body: parseBody(await response.text()) };
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

async function defaultCredentialProvider(
  authentication: Exclude<OrderAuthentication, "none">,
  refresh: boolean,
): Promise<OrderCredentialResult> {
  if (authentication === "staff") {
    const credential = refresh ? await refreshStaffSessionCredential() : await getStaffSessionCredential();
    return { token: credential.token, failure: credential.failure === "network" ? "unavailable" : credential.failure };
  }
  if (!refresh) return { token: readDeviceAccessToken(), failure: null };
  try {
    const token = await refreshDeviceAccessToken();
    return { token, failure: token ? null : "unauthenticated" };
  } catch (error) {
    if (error instanceof DeviceTokenRefreshError) {
      return { token: null, failure: error.kind === "forbidden" ? "forbidden" : "unavailable" };
    }
    throw error;
  }
}

async function invalidateAuthentication(authentication: Exclude<OrderAuthentication, "none">) {
  if (authentication === "device") markDeviceSessionInvalid();
  else await invalidateStaffSession();
}

function unavailableSession(requestId: string) {
  return new OrderClientError("unauthorized", "Your session is no longer available. Please sign in again.", 401, requestId);
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
      body.existingOrderId,
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
