import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import type {
  ProductionOrder,
  QrPaymentCreateRequest,
  QrPaymentSession,
  QrPaymentWebhookEvent,
} from "../../shared/orders";
import type { DeviceIdentityApplication } from "./deviceIdentityService";
import type { QrPaymentRepository, QrPaymentScope } from "../repositories/qrPaymentRepository";
import { createQrPaymentRepositoryFromEnvironment } from "../repositories/qrPaymentRepository";
import { createDeviceIdentityServiceFromEnvironment } from "../routes/deviceRoutes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class QrPaymentFailure extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = "QrPaymentFailure";
  }
}

export type ProviderQrSession = {
  providerSessionId: string;
  paymentReference: string;
  qrPayload: string;
  qrCode: string;
  expiresAt: string;
};

export interface QrPaymentProvider {
  readonly name: string;
  createSession(input: {
    order: ProductionOrder;
    paymentSessionId: string;
    idempotencyKey: string;
    expiresAt: string;
  }): Promise<ProviderQrSession>;
  cancelSession(session: QrPaymentSession): Promise<void>;
}

export class QrPaymentService {
  constructor(
    private readonly repository: QrPaymentRepository,
    private readonly provider: QrPaymentProvider,
    private readonly deviceIdentity: DeviceIdentityApplication,
    private readonly webhookSecret: string,
    private readonly sessionTtlSeconds = 600,
    private readonly webhookToleranceSeconds = 300,
  ) {}

  async authenticate(accessToken: string): Promise<QrPaymentScope> {
    let identity;
    try { identity = await this.deviceIdentity.authorize(accessToken); }
    catch { throw new QrPaymentFailure("unauthorized", 401, "Authentication is required."); }
    if (identity.deviceType !== "kiosk") throw new QrPaymentFailure("unauthorized", 403, "Kiosk access is required.");
    return { restaurantId: identity.restaurantId, branchId: identity.branchId, deviceId: identity.deviceId };
  }

  async create(scope: QrPaymentScope, orderId: string, request: QrPaymentCreateRequest) {
    assertUuid(request.idempotencyKey, "A valid QR payment attempt key is required.");
    const order = await this.repository.getOrder(scope, orderId);
    if (!order) throw new QrPaymentFailure("order_not_found", 404, "Order not found.");
    if (order.status !== "awaiting_payment") {
      throw new QrPaymentFailure("invalid_order_transition", 409, "This order is not awaiting payment.");
    }
    const reusable = await this.repository.findReusable(scope, order.id);
    if (reusable && !request.replaceExpired) return { ...reusable, duplicate: true };
    const expiresAt = new Date(Date.now() + this.sessionTtlSeconds * 1_000).toISOString();
    const paymentSessionId = randomUUID();
    let providerSession: ProviderQrSession;
    try {
      providerSession = await this.provider.createSession({ order, paymentSessionId, idempotencyKey: request.idempotencyKey, expiresAt });
    } catch {
      throw new QrPaymentFailure("payment_failed", 502, "The QR payment provider is temporarily unavailable.");
    }
    validateProviderSession(providerSession, expiresAt);
    return this.repository.create({
      ...scope,
      orderId: order.id,
      paymentSessionId,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: createHash("sha256").update(JSON.stringify({ orderId: order.id, replaceExpired: Boolean(request.replaceExpired) })).digest("hex"),
      providerName: this.provider.name,
      providerSessionId: providerSession.providerSessionId,
      paymentReference: providerSession.paymentReference,
      qrPayload: providerSession.qrPayload,
      qrCode: normalizeQrCode(providerSession.qrCode),
      expiresAt: providerSession.expiresAt,
      replaceExpired: Boolean(request.replaceExpired),
    });
  }

  get(scope: QrPaymentScope, orderId: string, sessionId: string) {
    assertUuid(sessionId, "A valid QR payment session is required.");
    return this.repository.get(scope, orderId, sessionId);
  }

  async cancel(scope: QrPaymentScope, orderId: string, sessionId: string) {
    const session = await this.get(scope, orderId, sessionId);
    if (!session) throw new QrPaymentFailure("order_not_found", 404, "QR payment session not found.");
    if (session.status === "paid") return session;
    try { await this.provider.cancelSession(session); }
    catch { throw new QrPaymentFailure("payment_failed", 502, "The QR payment could not be cancelled safely."); }
    return this.repository.cancel(scope, orderId, sessionId);
  }

  async handleWebhook(rawBody: Buffer, signatureHeader: string | undefined) {
    this.requireExternalProvider();
    verifyWebhookSignature(rawBody, signatureHeader, this.webhookSecret, this.webhookToleranceSeconds);
    const event = parseWebhookEvent(rawBody);
    const result = await this.repository.applyWebhook(event, {
      eventId: event.eventId,
      type: event.type,
      createdAt: event.createdAt,
    });
    if (!result) throw new QrPaymentFailure("order_not_found", 404, "Payment session not found.");
    return result;
  }

  async getMock(sessionId: string) {
    this.requireMockMode();
    assertUuid(sessionId, "A valid mock QR payment session is required.");
    const session = await this.repository.getMock(sessionId);
    if (!session) throw new QrPaymentFailure("order_not_found", 404, "Mock QR payment session not found.");
    return session;
  }

  async mockSuccess(sessionId: string) {
    return this.applyMockOutcome(sessionId, "success");
  }

  async mockFail(sessionId: string) {
    return this.applyMockOutcome(sessionId, "failed");
  }

  async mockCancel(sessionId: string) {
    return this.applyMockOutcome(sessionId, "cancelled");
  }

  private async applyMockOutcome(sessionId: string, outcome: "success" | "failed" | "cancelled") {
    this.requireMockMode();
    assertUuid(sessionId, "A valid mock QR payment session is required.");
    const session = await this.repository.applyMockOutcome(sessionId, outcome);
    if (!session) throw new QrPaymentFailure("order_not_found", 404, "Mock QR payment session not found.");
    return session;
  }

  private requireMockMode() {
    if (this.provider.name !== "mock") throw new QrPaymentFailure("order_not_found", 404, "Route not found.");
  }

  private requireExternalProvider() {
    if (this.provider.name === "mock") throw new QrPaymentFailure("order_not_found", 404, "Route not found.");
  }
}

export class MockQrPaymentProvider implements QrPaymentProvider {
  readonly name = "mock";

  constructor(private readonly baseUrl: string) {}

  async createSession(input: { order: ProductionOrder; paymentSessionId: string; expiresAt: string }) {
    const qrPayload = `${this.baseUrl.replace(/\/$/, "")}/#/mock-qr-payment/${input.paymentSessionId}`;
    const qrCode = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
      color: { dark: "#070A07", light: "#FFFFFFFF" },
    });
    return {
      providerSessionId: input.paymentSessionId,
      paymentReference: `MOCK-${input.order.orderNumber}-${input.paymentSessionId.slice(0, 8).toUpperCase()}`,
      qrPayload,
      qrCode,
      expiresAt: input.expiresAt,
    };
  }

  async cancelSession() {}
}

export class HttpQrPaymentProvider implements QrPaymentProvider {
  constructor(
    public readonly name: string,
    private readonly createUrl: string,
    private readonly apiKey: string,
    private readonly webhookUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async createSession(input: { order: ProductionOrder; idempotencyKey: string; expiresAt: string }) {
    const response = await this.fetchImpl(this.createUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}`, "idempotency-key": input.idempotencyKey },
      body: JSON.stringify({
        amount: input.order.total,
        currency: input.order.currency,
        reference: input.order.orderNumber,
        expiresAt: input.expiresAt,
        webhookUrl: this.webhookUrl,
        metadata: { orderId: input.order.id },
      }),
    });
    if (!response.ok) throw new Error(`provider_${response.status}`);
    const body = await response.json() as Record<string, unknown>;
    return {
      providerSessionId: text(body.providerSessionId),
      paymentReference: text(body.paymentReference),
      qrPayload: text(body.qrPayload),
      qrCode: text(body.qrCode ?? body.qrImageUrl),
      expiresAt: text(body.expiresAt),
    };
  }

  async cancelSession(session: QrPaymentSession) {
    const response = await this.fetchImpl(`${this.createUrl}/${encodeURIComponent(session.paymentReference)}/cancel`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ paymentSessionId: session.paymentSessionId }),
    });
    if (!response.ok && response.status !== 409) throw new Error(`provider_cancel_${response.status}`);
  }
}

export function createQrPaymentServiceFromEnvironment() {
  const repository = createQrPaymentRepositoryFromEnvironment();
  const deviceIdentity = createDeviceIdentityServiceFromEnvironment();
  const configuration = createQrPaymentProviderFromEnvironment();
  return new QrPaymentService(
    repository,
    configuration.provider,
    deviceIdentity,
    configuration.webhookSecret,
    configuration.sessionTtlSeconds,
    configuration.webhookToleranceSeconds,
  );
}

export function createQrPaymentProviderFromEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const mode = environment.QR_PAYMENT_PROVIDER?.trim().toLowerCase() || "external";
  const sessionTtlSeconds = positiveInteger(environment.QR_PAYMENT_SESSION_TTL_SECONDS, 600);
  if (mode === "mock") {
    if (environment.NODE_ENV === "production") throw new Error("Mock QR payments are disabled in production.");
    const baseUrl = environment.QR_PAYMENT_MOCK_BASE_URL?.trim() || "http://localhost:5173";
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseUrl.replace(/\/$/, ""))) {
      throw new Error("QR_PAYMENT_MOCK_BASE_URL must be a localhost URL.");
    }
    return {
      provider: new MockQrPaymentProvider(baseUrl) as QrPaymentProvider,
      webhookSecret: "",
      sessionTtlSeconds,
      webhookToleranceSeconds: 300,
    };
  }
  const createUrl = requiredEnvironment("QR_PAYMENT_PROVIDER_CREATE_URL", environment);
  const apiKey = requiredEnvironment("QR_PAYMENT_PROVIDER_API_KEY", environment);
  const webhookSecret = requiredEnvironment("QR_PAYMENT_WEBHOOK_SECRET", environment);
  const webhookUrl = requiredEnvironment("QR_PAYMENT_WEBHOOK_URL", environment);
  if (environment.NODE_ENV === "production" && !createUrl.startsWith("https://")) throw new Error("QR provider URL must use HTTPS.");
  return {
    provider: new HttpQrPaymentProvider(environment.QR_PAYMENT_PROVIDER_NAME?.trim() || "qr_provider", createUrl, apiKey, webhookUrl) as QrPaymentProvider,
    webhookSecret,
    sessionTtlSeconds,
    webhookToleranceSeconds: positiveInteger(environment.QR_PAYMENT_WEBHOOK_TOLERANCE_SECONDS, 300),
  };
}

export function verifyWebhookSignature(rawBody: Buffer, header: string | undefined, secret: string, toleranceSeconds: number, now = Date.now()) {
  if (!secret || !header) throw new QrPaymentFailure("unauthorized", 401, "Invalid payment webhook signature.");
  const parts = Object.fromEntries(header.split(",").map(part => part.trim().split("=", 2)));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(Math.floor(now / 1_000) - timestamp) > toleranceSeconds) {
    throw new QrPaymentFailure("unauthorized", 401, "Expired payment webhook signature.");
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
  const provided = parts.v1 ?? "";
  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = /^[a-f0-9]{64}$/i.test(provided) ? Buffer.from(provided, "hex") : Buffer.alloc(0);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new QrPaymentFailure("unauthorized", 401, "Invalid payment webhook signature.");
  }
}

function parseWebhookEvent(rawBody: Buffer): QrPaymentWebhookEvent {
  let value: unknown;
  try { value = JSON.parse(rawBody.toString("utf8")); }
  catch { throw new QrPaymentFailure("invalid_order_request", 400, "Invalid payment webhook payload."); }
  const event = value as Partial<QrPaymentWebhookEvent>;
  const allowed = ["payment.pending", "payment.processing", "payment.paid", "payment.expired", "payment.cancelled", "payment.failed"];
  if (!event || typeof event !== "object" || !event.eventId || event.eventId.length > 200
    || !event.createdAt || !Number.isFinite(Date.parse(event.createdAt)) || !allowed.includes(event.type ?? "") || !event.data) {
    throw new QrPaymentFailure("invalid_order_request", 400, "Invalid payment webhook event.");
  }
  if (!event.data.paymentReference || event.data.paymentReference.length > 200
    || !/^\d{1,12}(\.\d{1,2})?$/.test(event.data.amount ?? "") || !/^[A-Z]{3}$/.test(event.data.currency ?? "")) {
    throw new QrPaymentFailure("invalid_order_request", 400, "Invalid payment webhook data.");
  }
  return event as QrPaymentWebhookEvent;
}

function validateProviderSession(value: ProviderQrSession, maximumExpiresAt: string) {
  const expiry = Date.parse(value.expiresAt);
  if (!value.providerSessionId || value.providerSessionId.length > 200
    || !value.paymentReference || value.paymentReference.length > 200
    || !value.qrPayload || value.qrPayload.length > 4_096
    || !value.qrCode || !Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.parse(maximumExpiresAt) + 5_000) {
    throw new QrPaymentFailure("payment_failed", 502, "The QR payment provider returned an invalid session.");
  }
}

function normalizeQrCode(value: string) {
  if (value.startsWith("<svg") && value.length <= 200_000) return `data:image/svg+xml;base64,${Buffer.from(value).toString("base64")}`;
  if (/^data:image\/(png|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(value) && value.length <= 300_000) return value;
  if (/^https:\/\//.test(value) && value.length <= 2_048) return value;
  throw new QrPaymentFailure("payment_failed", 502, "The QR payment provider returned an unsafe QR image.");
}

function assertUuid(value: string, message: string) {
  if (!UUID.test(value)) throw new QrPaymentFailure("invalid_order_request", 400, message);
}

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function requiredEnvironment(name: string, environment: NodeJS.ProcessEnv = process.env) { const value = environment[name]?.trim(); if (!value) throw new Error(`${name} is required.`); return value; }
function positiveInteger(value: string | undefined, fallback: number) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : fallback; }
