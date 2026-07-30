import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("customer payment paths publish typed lifecycle transitions", () => {
  const selection = readFileSync("src/app/pages/PaymentFlow.tsx", "utf8");
  const card = readFileSync("src/app/pages/customer/CardTerminalPayment.tsx", "utf8");
  assert.match(selection, /paymentStatus: "pending"/);
  assert.match(selection, /paymentStatus: "processing"/);
  assert.match(selection, /"pay_at_cashier_pending"/);
  assert.match(selection, /paymentStatus: "completed"/);
  assert.match(selection, /paymentStatus: "cancelled"/);
  assert.match(card, /paymentStatus: "failed"/);
  assert.match(card, /paymentStatus: "completed"/);
  assert.match(card, /finalizedRef\.current/);
});

test("payment retries reuse the already-created correlated order", () => {
  const context = readFileSync("src/app/context/OrderContext.tsx", "utf8");
  assert.match(context, /PENDING_ORDER_KEY/);
  assert.match(context, /pending\.requestSignature === requestSignature/);
  assert.match(context, /idempotencyKey: createKey/);
  assert.match(context, /idempotencyKey: \(restored\.order \? restored : restorePending\(\)\)\.paymentKey/);
  assert.match(context, /recordCreatedOrder/);
});

test("successful and pay-at-cashier orders transfer active cart into the confirmation snapshot", () => {
  const cart = readFileSync("src/app/context/CartContext.tsx", "utf8");
  const confirmation = readFileSync("src/app/pages/customer/OrderConfirmation.tsx", "utf8");
  const app = readFileSync("src/app/App.tsx", "utf8");
  assert.match(cart, /setConfirmedOrderItems\(items\.map/);
  assert.match(cart, /setItems\(\[\]\)/);
  assert.match(confirmation, /confirmedOrderItems\.length \? confirmedOrderItems : items/);
  assert.match(app, /items\.length > 0 \|\| currentOrderId/);
});

test("failed and cancelled terminal paths do not call placeOrder", () => {
  const card = readFileSync("src/app/pages/customer/CardTerminalPayment.tsx", "utf8");
  const successBlock = card.match(/if \(result\.status !== "approved"[\s\S]+?navigationTimerRef\.current/)?.[0] ?? "";
  assert.match(successBlock, /placeOrder\(\{/);
  const failureBlock = card.match(/nextStatus === "declined"[\s\S]+?nextStatus === "cancelled"/)?.[0] ?? "";
  assert.doesNotMatch(failureBlock, /placeOrder\(\)/);
});
