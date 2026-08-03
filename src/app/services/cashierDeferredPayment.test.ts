import assert from "node:assert/strict";
import test from "node:test";
import type { OrderPaymentRequest, ProductionOrder } from "../../shared/orders";
import { completeDeferredCashierPayment } from "./orders/CashierDeferredPaymentService";
import type { CashierAttempt } from "./orders/cashierAttempt";

test("cashier cash capture persists paid before submit and reuses the resolved payment key", async () => {
  const calls: string[] = [];
  const client = clientHarness(calls);
  const attempt = cashierAttempt("payment-1");
  const result = await completeDeferredCashierPayment({
    client,
    order: deferredOrder(),
    method: "cash",
    amountReceived: "20",
    attempt,
  });
  assert.deepEqual(calls, ["pay:payment-1:cash:20.00", "submit:2"]);
  assert.equal(result.paidOrder.status, "paid");
  assert.equal(result.submitted.status, "submitted");
  assert.equal(result.attempt.paymentKey, "payment-1");
});

test("changing amount or method rotates only the deferred payment key", async () => {
  const original = cashierAttempt("payment-1", "signature-old");
  let resolved: CashierAttempt | null = null;
  await completeDeferredCashierPayment({
    client: clientHarness([]),
    order: deferredOrder(),
    method: "cash",
    amountReceived: "25.00",
    attempt: original,
    onAttemptResolved: value => { resolved = value; },
  });
  assert.notEqual(resolved!.paymentKey, original.paymentKey);
  assert.equal(resolved!.createKey, original.createKey);
  assert.equal(resolved!.workflowAttemptId, original.workflowAttemptId);
});

test("cashier card-terminal capture uses its external reference and submits", async () => {
  const calls: string[] = [];
  await completeDeferredCashierPayment({
    client: clientHarness(calls),
    order: deferredOrder(),
    method: "card_terminal",
    externalReference: "terminal-approved-1",
    attempt: cashierAttempt("payment-card"),
  });
  assert.deepEqual(calls, ["pay:payment-card:card_terminal:terminal-approved-1", "submit:2"]);
});

test("failed payment never submits and leaves the deferred order unchanged", async () => {
  const original = deferredOrder();
  const calls: string[] = [];
  const client = clientHarness(calls, true);
  await assert.rejects(completeDeferredCashierPayment({
    client,
    order: original,
    method: "cash",
    amountReceived: "20.00",
    attempt: cashierAttempt("payment-fail"),
  }), /declined/);
  assert.deepEqual(calls, ["pay:payment-fail:cash:20.00"]);
  assert.equal(original.status, "awaiting_payment");
});

test("paid recovery retries submit without duplicating the payment", async () => {
  const calls: string[] = [];
  const paid = { ...deferredOrder(), status: "paid" as const, paymentStatus: "captured" as const, paymentMethod: "cash" as const, version: 2 };
  const result = await completeDeferredCashierPayment({
    client: clientHarness(calls),
    order: paid,
    method: "cash",
    amountReceived: "20.00",
    attempt: cashierAttempt("payment-existing"),
  });
  assert.deepEqual(calls, ["submit:2"]);
  assert.equal(result.submitted.status, "submitted");
});

function clientHarness(calls: string[], failPayment = false) {
  return {
    pay: async (_orderId: string, request: OrderPaymentRequest) => {
      calls.push(request.method === "card_terminal"
        ? `pay:${request.idempotencyKey}:${request.method}:${request.externalReference}`
        : `pay:${request.idempotencyKey}:${request.method}:${request.amountReceived}`);
      if (failPayment) throw new Error("declined");
      const order = { ...deferredOrder(), status: "paid" as const, paymentStatus: "captured" as const, paymentMethod: request.method, version: 2 };
      return { order, paymentId: "payment-row-1", paymentStatus: "captured" as const, amount: order.total, change: "6.50" };
    },
    submit: async (_orderId: string, version: number) => {
      calls.push(`submit:${version}`);
      return { ...deferredOrder(), status: "submitted" as const, paymentStatus: "captured" as const, version: version + 1 };
    },
  };
}

function cashierAttempt(paymentKey: string, paymentSignature = "") : CashierAttempt {
  return {
    requestSignature: "deferred-order-1",
    createKey: "create-unused",
    paymentSignature,
    paymentKey,
    workflowAttemptId: "cashier-workflow-1",
  };
}

function deferredOrder(): ProductionOrder {
  return {
    id: "order-1", orderNumber: "K101", status: "awaiting_payment", paymentStatus: "pending",
    paymentMethod: "pay_at_cashier", source: "kiosk", customerReference: "a".repeat(48), version: 1,
    notes: null, menuId: "menu-1", menuVersion: 1, currency: "EUR", subtotal: "12.50",
    taxTotal: "1.00", discountTotal: "0.00", total: "13.50", serviceMode: "dine_in",
    language: "en", items: [], placedAt: null, acceptedAt: null, preparingAt: null,
    readyAt: null, completedAt: null, cancelledAt: null,
    createdAt: "2026-08-03T10:00:00.000Z", updatedAt: "2026-08-03T10:00:00.000Z",
  };
}
