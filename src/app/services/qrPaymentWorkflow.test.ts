import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { QrPaymentSession } from "../../shared/orders";
import { clearQrPaymentSession, prepareQrPaymentAttempt, readQrPaymentAttempt, saveQrPaymentSession } from "./orders/qrPaymentSession";

test("QR attempt survives refresh and reuses its creation key", () => {
  const storage = new MemoryStorage();
  const first = prepareQrPaymentAttempt("order-1", false, storage);
  assert.equal(prepareQrPaymentAttempt("order-1", false, storage).createKey, first.createKey, "timeout before a response must preserve the key");
  saveQrPaymentSession(session(), first.createKey, storage);
  const restored = readQrPaymentAttempt(storage);
  assert.equal(restored?.createKey, first.createKey);
  assert.equal(restored?.session?.paymentSessionId, "session-1");
  assert.equal(prepareQrPaymentAttempt("order-1", false, storage).createKey, first.createKey);
  assert.notEqual(prepareQrPaymentAttempt("order-1", true, storage).createKey, first.createKey);
  clearQrPaymentSession(storage);
  assert.equal(readQrPaymentAttempt(storage), null);
});

test("frontend QR flow is realtime-first, polls every two seconds only as fallback, and never marks itself paid", () => {
  const page = readFileSync("src/app/pages/customer/QrPayment.tsx", "utf8");
  const realtime = readFileSync("src/app/services/supabase/realtimeOrderService.ts", "utf8");
  const payment = readFileSync("src/app/pages/PaymentFlow.tsx", "utf8");
  assert.match(payment, /createQrPayment/);
  assert.doesNotMatch(payment, /Simulate completed payment|setTimeout\(.*paymentStatus: "completed"/s);
  assert.match(page, /FALLBACK_POLL_MS = 2_000/);
  assert.match(page, /connection === "connected"/);
  assert.match(page, /session\.status !== "paid" \|\| session\.order\.status !== "submitted"/);
  assert.match(page, /SUCCESS_DELAY_MS = 2_000/);
  assert.match(page, /Generate New QR/);
  assert.match(page, /Cancel Payment/);
  assert.match(realtime, /qr_payment_refresh_signals/);
  const mockPage = readFileSync("src/app/pages/customer/MockQrPayment.tsx", "utf8");
  assert.match(mockPage, /Development Mode — No Real Money/);
  assert.match(mockPage, /Simulate Payment Success/);
  assert.match(mockPage, /Simulate Failure/);
  assert.match(mockPage, /Cancel Payment/);
  assert.match(mockPage, /mockQrPaymentClient\.get/);
});

test("QR success uses the existing order confirmation receipt and remains absent from kitchen until submitted", () => {
  const app = readFileSync("src/app/App.tsx", "utf8");
  const page = readFileSync("src/app/pages/customer/QrPayment.tsx", "utf8");
  const migration = readFileSync("supabase/migrations/202608030003_qr_payment_workflow.sql", "utf8");
  assert.match(app, /QrPayment onComplete=\{qrPaymentCompleted\}/);
  assert.match(app, /qrPaymentCompleted = useCallback\(\(\) => navigateTo\(ROUTES\.orderConfirmation\)/);
  assert.match(app, /MockQrPayment sessionId=\{mockQrSessionId\(\)\}/);
  assert.match(page, /placeOrder\(/);
  assert.match(migration, /set status='submitted'/);
});

function session(): QrPaymentSession {
  return { paymentSessionId: "session-1", paymentReference: "QR-M110", orderId: "order-1", orderNumber: "M110", status: "pending", qrPayload: "payload", qrCode: "https://pay.test/qr.png", amount: "13.50", currency: "EUR", expiresAt: new Date(Date.now() + 600_000).toISOString(), providerName: "provider", duplicate: false, order: {} as never };
}

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
