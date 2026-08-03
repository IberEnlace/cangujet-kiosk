import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ProductionOrder, QrPaymentSession, QrPaymentWebhookEvent } from "../../shared/orders";
import type { QrPaymentRepository, QrPaymentScope } from "../repositories/qrPaymentRepository";
import { MockQrPaymentProvider, QrPaymentFailure, QrPaymentService, createQrPaymentProviderFromEnvironment, verifyWebhookSignature, type QrPaymentProvider } from "./qrPaymentService";

const SCOPE: QrPaymentScope = { restaurantId: "restaurant-1", branchId: "branch-1", deviceId: "device-1" };
const KEY = "11111111-1111-4111-8111-111111111111";

test("QR creation is idempotent and browser refresh reuses the active session", async () => {
  const repository = new MemoryQrRepository();
  const provider = new MemoryProvider();
  const service = qrService(repository, provider);
  const first = await service.create(SCOPE, repository.order.id, { idempotencyKey: KEY });
  const duplicate = await service.create(SCOPE, repository.order.id, { idempotencyKey: KEY });
  assert.equal(first.paymentSessionId, duplicate.paymentSessionId);
  assert.equal(duplicate.duplicate, true);
  assert.equal(provider.createCalls, 1);
});

test("expired QR can be replaced while cancellation never captures or submits", async () => {
  const repository = new MemoryQrRepository();
  const provider = new MemoryProvider();
  const service = qrService(repository, provider);
  const first = await service.create(SCOPE, repository.order.id, { idempotencyKey: KEY });
  repository.session = { ...first, status: "expired" };
  const next = await service.create(SCOPE, repository.order.id, { idempotencyKey: "22222222-2222-4222-8222-222222222222", replaceExpired: true });
  assert.notEqual(next.paymentSessionId, first.paymentSessionId);
  const cancelled = await service.cancel(SCOPE, next.orderId, next.paymentSessionId);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.order.status, "awaiting_payment");
});

test("webhook signatures are timestamp-bound and constant-format validated", () => {
  const body = Buffer.from('{"eventId":"evt-1"}');
  const timestamp = 1_800_000_000;
  const signature = createHmac("sha256", "secret").update(`${timestamp}.${body}`).digest("hex");
  assert.doesNotThrow(() => verifyWebhookSignature(body, `t=${timestamp},v1=${signature}`, "secret", 300, timestamp * 1_000));
  assert.throws(() => verifyWebhookSignature(body, `t=${timestamp},v1=${"0".repeat(64)}`, "secret", 300, timestamp * 1_000), QrPaymentFailure);
  assert.throws(() => verifyWebhookSignature(body, `t=${timestamp - 301},v1=${signature}`, "secret", 300, timestamp * 1_000), /Expired/);
});

test("paid webhook is server-authoritative and duplicate provider events remain idempotent", async () => {
  const repository = new MemoryQrRepository();
  const provider = new MemoryProvider();
  const service = qrService(repository, provider);
  await service.create(SCOPE, repository.order.id, { idempotencyKey: KEY });
  const event: QrPaymentWebhookEvent = {
    eventId: "evt-paid-1", type: "payment.paid", createdAt: new Date().toISOString(),
    data: { paymentReference: "QR-M110", providerSessionId: "provider-1", providerTransactionId: "txn-1", amount: "13.50", currency: "EUR" },
  };
  const raw = Buffer.from(JSON.stringify(event));
  const timestamp = Math.floor(Date.now() / 1_000);
  const signature = createHmac("sha256", "secret").update(`${timestamp}.${raw}`).digest("hex");
  const paid = await service.handleWebhook(raw, `t=${timestamp},v1=${signature}`);
  const duplicate = await service.handleWebhook(raw, `t=${timestamp},v1=${signature}`);
  assert.equal(paid.status, "paid");
  assert.equal(paid.order.status, "submitted");
  assert.equal(duplicate.paymentSessionId, paid.paymentSessionId);
  assert.equal(repository.webhookMutations, 1);
});

test("mock session creation generates a scannable local payload without an HTTP request", async () => {
  const repository = new MemoryQrRepository();
  let externalRequests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { externalRequests += 1; throw new Error("external_request_forbidden"); }) as typeof fetch;
  try {
    const service = qrService(repository, new MockQrPaymentProvider("http://localhost:5173"));
    const created = await service.create(SCOPE, repository.order.id, { idempotencyKey: KEY });
    assert.equal(created.status, "pending");
    assert.equal(created.providerName, "mock");
    assert.equal(created.qrPayload, `http://localhost:5173/#/mock-qr-payment/${created.paymentSessionId}`);
    assert.match(created.qrCode, /^data:image\/png;base64,/);
    assert.equal(externalRequests, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("mock provider configuration requires no URL, API key, webhook secret, or tunnel", () => {
  const configuration = createQrPaymentProviderFromEnvironment({
    QR_PAYMENT_PROVIDER: "mock",
    QR_PAYMENT_MOCK_BASE_URL: "http://localhost:5173",
    QR_PAYMENT_SESSION_TTL_SECONDS: "600",
  });
  assert.equal(configuration.provider.name, "mock");
  assert.equal(configuration.webhookSecret, "");
  assert.equal(configuration.sessionTtlSeconds, 600);
  assert.throws(() => createQrPaymentProviderFromEnvironment({ QR_PAYMENT_PROVIDER: "mock", NODE_ENV: "production" }), /disabled in production/);
});

test("mock success is idempotent and atomically makes the order visible to Kitchen", async () => {
  const repository = new MemoryQrRepository();
  const service = qrService(repository, new MockQrPaymentProvider("http://localhost:5173"));
  const created = await service.create(SCOPE, repository.order.id, { idempotencyKey: KEY });
  assert.equal(created.order.status, "awaiting_payment");
  assert.equal(repository.kitchenVisible, false);
  const paid = await service.mockSuccess(created.paymentSessionId);
  const duplicate = await service.mockSuccess(created.paymentSessionId);
  assert.equal(paid.status, "paid");
  assert.equal(paid.order.status, "submitted");
  assert.equal(repository.kitchenVisible, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(repository.mockSuccessMutations, 1);
});

test("mock failure, cancellation, and expiration never capture or submit", async () => {
  for (const outcome of ["failed", "cancelled", "expired"] as const) {
    const repository = new MemoryQrRepository();
    const service = qrService(repository, new MockQrPaymentProvider("http://localhost:5173"));
    const created = await service.create(SCOPE, repository.order.id, { idempotencyKey: KEY });
    if (outcome === "expired") repository.session = { ...created, expiresAt: new Date(Date.now() - 1_000).toISOString() };
    const result = outcome === "failed"
      ? await service.mockFail(created.paymentSessionId)
      : outcome === "cancelled"
        ? await service.mockCancel(created.paymentSessionId)
        : await service.getMock(created.paymentSessionId);
    assert.equal(result.status, outcome);
    assert.equal(result.order.status, "awaiting_payment");
    assert.equal(repository.kitchenVisible, false);
  }
});

test("mock endpoints are disabled for every non-mock provider", async () => {
  const service = qrService(new MemoryQrRepository(), new MemoryProvider());
  await assert.rejects(() => service.mockSuccess("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"), (error: unknown) => {
    assert.equal((error as QrPaymentFailure).status, 404);
    return true;
  });
});

test("QR migration enforces expiry, amount verification, atomic paid-submit, realtime, and no early kitchen visibility", () => {
  const sql = readFileSync("supabase/migrations/202608030003_qr_payment_workflow.sql", "utf8");
  assert.match(sql, /method::text='qr'/);
  assert.match(sql, /v_payment\.expires_at <= now\(\)/);
  assert.match(sql, /v_payment\.amount <> p_amount/);
  assert.match(sql, /status='captured',provider_status='paid'/);
  assert.match(sql, /set status='paid',payment_status='paid'/);
  assert.match(sql, /set status='submitted',placed_at=now\(\)/);
  assert.match(sql, /provider_event_ids/);
  assert.match(sql, /qr_payment_refresh_signals/);
  assert.doesNotMatch(sql, /allow_unpaid|awaiting_payment'.*'submitted'/);
  assert.match(sql, /apply_mock_qr_payment_outcome/);
  assert.match(sql, /provider='mock'/);
  assert.match(sql, /'paid','submitted','system','qr_mock'/);
  const enumSql = readFileSync("supabase/migrations/2026080300025_add_qr_payment_method.sql", "utf8");
  assert.match(enumSql, /alter type public\.order_payment_method add value if not exists 'qr'/i);
  assert.ok("2026080300025_add_qr_payment_method.sql" < "202608030003_qr_payment_workflow.sql");
});

function qrService(repository: MemoryQrRepository, provider: QrPaymentProvider) {
  return new QrPaymentService(repository, provider, {
    authorize: async () => ({ ...SCOPE, deviceType: "kiosk", deviceName: "Kiosk", configVersion: 1 }),
  } as never, "secret", 600, 300);
}

class MemoryProvider implements QrPaymentProvider {
  readonly name = "provider";
  createCalls = 0;
  async createSession(input: { expiresAt: string }) {
    this.createCalls += 1;
    return { providerSessionId: `provider-${this.createCalls}`, paymentReference: `QR-M110-${this.createCalls}`, qrPayload: `https://pay.test/${this.createCalls}`, qrCode: "https://pay.test/qr.png", expiresAt: input.expiresAt };
  }
  async cancelSession() {}
}

class MemoryQrRepository implements QrPaymentRepository {
  order = order();
  session: QrPaymentSession | null = null;
  events = new Set<string>();
  webhookMutations = 0;
  mockSuccessMutations = 0;
  kitchenVisible = false;
  async getOrder() { return this.order; }
  async findReusable() { return this.session && ["pending", "processing"].includes(this.session.status) ? this.session : null; }
  async create(input: any) {
    this.session = session(this.order, input.paymentReference, input.expiresAt, input.paymentSessionId, input.qrPayload, input.qrCode, input.providerName);
    return this.session;
  }
  async get() { return this.session; }
  async cancel() { this.session = { ...this.session!, status: "cancelled" }; return this.session; }
  async applyWebhook(event: QrPaymentWebhookEvent) {
    if (this.events.has(event.eventId)) return this.session;
    this.events.add(event.eventId); this.webhookMutations += 1;
    if (event.type === "payment.paid") {
      this.order = { ...this.order, status: "submitted", paymentStatus: "captured", paymentMethod: "qr", version: 3 };
      this.session = { ...this.session!, status: "paid", order: this.order };
      this.kitchenVisible = true;
    }
    return this.session;
  }
  async getMock() {
    if (this.session && Date.parse(this.session.expiresAt) <= Date.now() && ["pending", "processing"].includes(this.session.status)) {
      this.session = { ...this.session, status: "expired" };
    }
    return this.session;
  }
  async applyMockOutcome(_sessionId: string, outcome: "success" | "failed" | "cancelled") {
    if (!this.session) return null;
    if (this.session.status === "paid") return { ...this.session, duplicate: outcome === "success" };
    if (["failed", "cancelled", "expired"].includes(this.session.status)) return this.session;
    if (Date.parse(this.session.expiresAt) <= Date.now()) {
      this.session = { ...this.session, status: "expired" };
      return this.session;
    }
    if (outcome === "success") {
      this.mockSuccessMutations += 1;
      this.order = { ...this.order, status: "submitted", paymentStatus: "captured", paymentMethod: "qr", version: 3 };
      this.kitchenVisible = true;
      this.session = { ...this.session, status: "paid", order: this.order };
    } else {
      this.session = { ...this.session, status: outcome };
    }
    return this.session;
  }
}

function order(): ProductionOrder {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", orderNumber: "M110", status: "awaiting_payment", paymentStatus: null, paymentMethod: null,
    source: "kiosk", customerReference: "a".repeat(48), version: 1, notes: null, menuId: "menu", menuVersion: 1, currency: "EUR",
    subtotal: "12.50", taxTotal: "1.00", discountTotal: "0.00", total: "13.50", serviceMode: "dine_in", language: "en", items: [],
    placedAt: null, acceptedAt: null, preparingAt: null, readyAt: null, completedAt: null, cancelledAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function session(orderValue: ProductionOrder, reference: string, expiresAt: string, id: string, qrPayload = "https://pay.test", qrCode = "https://pay.test/qr.png", providerName = "provider"): QrPaymentSession {
  return { paymentSessionId: id, paymentReference: reference, orderId: orderValue.id, orderNumber: orderValue.orderNumber, status: "pending", qrPayload, qrCode, amount: orderValue.total, currency: orderValue.currency, expiresAt, providerName, duplicate: false, order: orderValue };
}
