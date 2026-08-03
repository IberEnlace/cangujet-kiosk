import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const paymentFlow = readFileSync("src/app/pages/PaymentFlow.tsx", "utf8");
const cardFlow = readFileSync("src/app/pages/customer/CardTerminalPayment.tsx", "utf8");
const ticket = readFileSync("src/app/pages/customer/PayAtCashierConfirmation.tsx", "utf8");
const cashier = readFileSync("src/app/pages/CashierDashboard.tsx", "utf8");
const client = readFileSync("src/app/services/orders/OrderService.ts", "utf8");
const migration = readFileSync("supabase/migrations/202608030001_pay_at_cashier_deferred_workflow.sql", "utf8");
const productionMigration = readFileSync("supabase/migrations/202607300003_production_order_management.sql", "utf8");

test("kiosk deferred branch stops before paid/submit and preserves the persisted ticket identity", () => {
  const branch = paymentFlow.match(/if \(id === "cashier"\) \{[\s\S]*?\n\s*return;/)?.[0] ?? "";
  assert.match(branch, /capturePayment\("pay_at_cashier"\)/);
  assert.match(branch, /paymentStatus !== "pending"/);
  assert.match(branch, /savePayAtCashierConfirmation\(deferredOrder\)/);
  assert.match(branch, /placeOrder\(\{ id: deferredOrder\.id, number: deferredOrder\.orderNumber/);
  assert.doesNotMatch(branch, /submitOrder/);
  assert.match(ticket, /snapshot\.orderNumber/);
  assert.match(ticket, /Pay at Cashier/);
});

test("cashier has a searchable pending view with cash and card-terminal collection", () => {
  assert.match(client, /\/cashier\/pending-orders/);
  assert.match(cashier, /Pending Kiosk Payments/);
  assert.match(cashier, /pendingSearch/);
  assert.match(cashier, /method:pendingMethod/);
  assert.match(cashier, /MockPaymentTerminalService/);
  assert.match(cashier, /completeDeferredCashierPayment/);
  assert.match(cashier, /pendingMethod==="cash"\?pendingReceived/);
});

test("database pending query is server-scoped and kitchen remains production-only", () => {
  assert.match(migration, /o\.restaurant_id = p_restaurant_id/);
  assert.match(migration, /o\.branch_id = p_branch_id/);
  assert.match(migration, /o\.source = 'kiosk'/);
  assert.match(migration, /o\.status = 'awaiting_payment'/);
  assert.match(migration, /o\.cancelled_at is null/);
  assert.match(migration, /intent\.method = 'pay_at_cashier'/);
  assert.match(productionMigration, /p_audience = 'kitchen'[\s\S]*o\.status in \('submitted', 'accepted', 'preparing', 'ready'\)/);
  assert.doesNotMatch(productionMigration.match(/p_audience = 'kitchen'[\s\S]*?\)\)/)?.[0] ?? "", /awaiting_payment/);
});

test("existing kiosk card flow still captures paid then submits", () => {
  assert.match(cardFlow, /capturePayment\("card_terminal"/);
  assert.match(cardFlow, /paid\.status !== "paid"/);
  assert.match(cardFlow, /await submission\.submitOrder\(\)/);
  assert.match(cardFlow, /submitted\.status !== "submitted"/);
});
