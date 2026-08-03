import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express, { type Request } from "express";
import type { QrPaymentSession } from "../../shared/orders";
import { createPaymentWebhookRouter, createQrPaymentRouter } from "../routes/qrPaymentRoutes";
import { QrPaymentFailure } from "./qrPaymentService";

test("QR HTTP routes create, restore, cancel, and accept only delegated webhook handling", async () => {
  const calls: string[] = [];
  const service = {
    authenticate: async () => ({ restaurantId: "r", branchId: "b", deviceId: "d" }),
    create: async () => { calls.push("create"); return session(); },
    get: async () => { calls.push("get"); return session(); },
    cancel: async () => { calls.push("cancel"); return { ...session(), status: "cancelled" }; },
    handleWebhook: async (raw: Buffer) => { calls.push(`webhook:${raw.length}`); return { ...session(), status: "paid" }; },
    getMock: async () => { calls.push("mock:get"); return session(); },
    mockSuccess: async () => { calls.push("mock:success"); return { ...session(), status: "paid" }; },
    mockFail: async () => { calls.push("mock:fail"); return { ...session(), status: "failed" }; },
    mockCancel: async () => { calls.push("mock:cancel"); return { ...session(), status: "cancelled" }; },
  };
  const app = express();
  app.use(express.json({ verify: (request, _response, buffer) => { (request as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); } }));
  app.use("/api/v1", createQrPaymentRouter(() => service as never));
  app.use(createPaymentWebhookRouter(() => service as never));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server_address_missing");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const create = await fetch(`${base}/api/v1/orders/order-1/payments/qr`, { method: "POST", headers: { authorization: "Bearer kiosk", "content-type": "application/json" }, body: JSON.stringify({ idempotencyKey: "key" }) });
    assert.equal(create.status, 201);
    const get = await fetch(`${base}/api/v1/orders/order-1/payments/qr/session-1`, { headers: { authorization: "Bearer kiosk" } });
    assert.equal(get.status, 200);
    const cancel = await fetch(`${base}/api/v1/orders/order-1/payments/qr/session-1/cancel`, { method: "POST", headers: { authorization: "Bearer kiosk" } });
    assert.equal(cancel.status, 200);
    const webhook = await fetch(`${base}/webhooks/payment`, { method: "POST", headers: { "content-type": "application/json", "x-payment-signature": "delegated" }, body: JSON.stringify({ eventId: "evt" }) });
    assert.equal(webhook.status, 200);
    assert.equal((await fetch(`${base}/api/v1/qr-payments/session-1`)).status, 200);
    assert.equal((await fetch(`${base}/api/v1/qr-payments/session-1/mock-success`, { method: "POST" })).status, 200);
    assert.equal((await fetch(`${base}/api/v1/qr-payments/session-1/mock-fail`, { method: "POST" })).status, 200);
    assert.equal((await fetch(`${base}/api/v1/qr-payments/session-1/cancel`, { method: "POST" })).status, 200);
    assert.deepEqual(calls, ["create", "get", "cancel", "webhook:17", "mock:get", "mock:success", "mock:fail", "mock:cancel"]);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("mock HTTP endpoints return 404 when the service is outside mock mode", async () => {
  const service = { mockSuccess: async () => { throw new QrPaymentFailure("order_not_found", 404, "Route not found."); } };
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createQrPaymentRouter(() => service as never));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server_address_missing");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/qr-payments/session-1/mock-success`, { method: "POST" });
    assert.equal(response.status, 404);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

function session(): QrPaymentSession {
  return {
    paymentSessionId: "session-1", paymentReference: "QR-M110", orderId: "order-1", orderNumber: "M110",
    status: "pending", qrPayload: "payload", qrCode: "https://pay.test/qr.png", amount: "13.50", currency: "EUR",
    expiresAt: new Date(Date.now() + 600_000).toISOString(), providerName: "provider", duplicate: false, order: {} as never,
  };
}
