import assert from "node:assert/strict";
import test from "node:test";
import type { QrPaymentSession } from "../../shared/orders";
import { MockQrPaymentClient } from "./orders/MockQrPaymentService";

test("mock payment page restores session state and sends each local simulation action", async () => {
  const calls: Array<{ path: string; method: string }> = [];
  const client = new MockQrPaymentClient(async (input, init) => {
    calls.push({ path: String(input), method: init?.method ?? "GET" });
    return new Response(JSON.stringify(session()), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal((await client.get("session-1")).orderNumber, "M110");
  await client.success("session-1");
  await client.fail("session-1");
  await client.cancel("session-1");
  assert.deepEqual(calls, [
    { path: "/api/v1/qr-payments/session-1", method: "GET" },
    { path: "/api/v1/qr-payments/session-1/mock-success", method: "POST" },
    { path: "/api/v1/qr-payments/session-1/mock-fail", method: "POST" },
    { path: "/api/v1/qr-payments/session-1/cancel", method: "POST" },
  ]);
});

function session(): QrPaymentSession {
  return {
    paymentSessionId: "session-1", paymentReference: "MOCK-M110", orderId: "order-1", orderNumber: "M110",
    status: "pending", qrPayload: "http://localhost:5173/#/mock-qr-payment/session-1", qrCode: "data:image/png;base64,AA==",
    amount: "13.50", currency: "EUR", expiresAt: new Date(Date.now() + 600_000).toISOString(), providerName: "mock",
    duplicate: false, order: {} as never,
  };
}
