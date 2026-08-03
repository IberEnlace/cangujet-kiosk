import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ProductionOrder } from "../../shared/orders";
import {
  PAY_AT_CASHIER_CONFIRMATION_KEY,
  beginPayAtCashierPrintRetry,
  claimPayAtCashierAutomaticPrint,
  clearPayAtCashierConfirmation,
  completePayAtCashierPrint,
  readPayAtCashierConfirmation,
  savePayAtCashierConfirmation,
} from "./orders/payAtCashierConfirmation";
import {
  PayAtCashierTicketPrinterService,
  renderPayAtCashierTicketHtml,
} from "./printer/PayAtCashierTicketPrinterService";

test("Pay at Cashier success stores the persisted order number and complete ticket fields", () => {
  const storage = new MemoryStorage();
  const snapshot = savePayAtCashierConfirmation(order(), storage);
  assert.equal(snapshot.orderId, "order-real-1");
  assert.equal(snapshot.orderNumber, "M110");
  assert.equal(snapshot.total, "13.50");
  assert.equal(snapshot.currency, "EUR");
  assert.equal(snapshot.paymentMethod, "pay_at_cashier");
  assert.equal(snapshot.paymentStatus, "pending");
  assert.deepEqual(snapshot.items, [{ name: "Snapshot Burger", quantity: 1, modifiers: ["Cheese"] }]);
  assert.deepEqual(readPayAtCashierConfirmation(storage), snapshot);
});

test("invalid or direct confirmation data is rejected instead of generating a fake ticket", () => {
  const storage = new MemoryStorage();
  storage.setItem(PAY_AT_CASHIER_CONFIRMATION_KEY, JSON.stringify({ orderNumber: "M999" }));
  assert.equal(readPayAtCashierConfirmation(storage), null);
  assert.throws(() => savePayAtCashierConfirmation({ ...order(), paymentStatus: "captured" }, storage), /not persisted/);
});

test("the automatic print claim succeeds exactly once across rerender and page refresh", () => {
  const storage = new MemoryStorage();
  savePayAtCashierConfirmation(order(), storage);
  const first = claimPayAtCashierAutomaticPrint(storage);
  const rerender = claimPayAtCashierAutomaticPrint(storage);
  const refreshed = claimPayAtCashierAutomaticPrint(storage);
  assert.equal(first?.printAttempts, 1);
  assert.equal(first?.printState, "printing");
  assert.equal(rerender, null);
  assert.equal(refreshed, null);
});

test("failed printing preserves the successful order and enables an explicit print retry", () => {
  const storage = new MemoryStorage();
  savePayAtCashierConfirmation(order(), storage);
  claimPayAtCashierAutomaticPrint(storage);
  const failed = completePayAtCashierPrint(false, storage);
  const retry = beginPayAtCashierPrintRetry(storage);
  assert.equal(failed?.orderId, "order-real-1");
  assert.equal(failed?.orderStatus, "awaiting_payment");
  assert.equal(retry?.printState, "printing");
  assert.equal(retry?.printAttempts, 2);
});

test("finishing removes only the short-lived confirmation snapshot", () => {
  const storage = new MemoryStorage();
  storage.setItem("unrelated", "keep");
  savePayAtCashierConfirmation(order(), storage);
  clearPayAtCashierConfirmation(storage);
  assert.equal(readPayAtCashierConfirmation(storage), null);
  assert.equal(storage.getItem("unrelated"), "keep");
});

test("printed ticket is 80mm, includes persisted items and totals, and exposes no internal identifiers", () => {
  const storage = new MemoryStorage();
  const snapshot = savePayAtCashierConfirmation(order(), storage);
  const html = renderPayAtCashierTicketHtml(snapshot);
  assert.match(html, /@page\{size:80mm auto/);
  assert.match(html, /MORROW/);
  assert.match(html, /PAY AT CASHIER/);
  assert.match(html, /M110/);
  assert.match(html, /Snapshot Burger × 1/);
  assert.match(html, /Cheese/);
  assert.match(html, /Payment Status: Pending/);
  assert.doesNotMatch(html, /order-real-1|customerReference|idempotency|branch_id|restaurant_id/);
});

test("development printer invokes one scheduled print and reports a blocked popup", async () => {
  const storage = new MemoryStorage();
  const snapshot = savePayAtCashierConfirmation(order(), storage);
  let writes = 0;
  let prints = 0;
  let scheduled: (() => void) | null = null;
  const target = {
    document: { open() {}, write() { writes += 1; }, close() {} },
    focus() {},
    print() { prints += 1; },
  };
  const printer = new PayAtCashierTicketPrinterService({ runtime: "development", openDevelopmentWindow: () => target as any, schedule: callback => { scheduled = callback; } });
  const result = printer.printTicket(snapshot);
  assert.equal(writes, 1);
  assert.equal(prints, 0);
  assert.ok(scheduled);
  (scheduled as () => void)();
  assert.deepEqual(await result, { success: true });
  assert.equal(prints, 1);
  const blocked = new PayAtCashierTicketPrinterService({ runtime: "development", openDevelopmentWindow: () => null });
  assert.deepEqual(await blocked.printTicket(snapshot), { success: false, errorCode: "print_window_blocked" });
});

test("confirmation UI starts countdown only when ready and guards finish navigation", () => {
  const page = readFileSync("src/app/pages/customer/PayAtCashierConfirmation.tsx", "utf8");
  const app = readFileSync("src/app/App.tsx", "utf8");
  assert.match(page, /PRINTING_ANIMATION_MS = 2_500/);
  assert.match(page, /READY_LIFETIME_SECONDS = 15/);
  assert.match(page, /if \(phase !== "ready"\) return/);
  assert.match(page, /window\.setTimeout\(finishSession, READY_LIFETIME_SECONDS \* 1_000\)/);
  assert.match(page, /finishOnceRef\.current/);
  assert.match(page, /clearPayAtCashierConfirmation\(\)/);
  assert.match(page, /if \(!snapshot\) \{ finishSession\(\); return; \}/);
  assert.match(app, /PayAtCashierConfirmation onReset=\{resetKiosk\}/);
  assert.match(app, /route === ROUTES\.payAtCashierConfirmation && readPayAtCashierConfirmation\(\)/);
});

test("deferred payment navigates to confirmation without submit or Idle and card flow is unchanged", () => {
  const payment = readFileSync("src/app/pages/PaymentFlow.tsx", "utf8");
  const card = readFileSync("src/app/pages/customer/CardTerminalPayment.tsx", "utf8");
  const branch = payment.match(/if \(id === "cashier"\) \{[\s\S]*?\n\s*return;/)?.[0] ?? "";
  assert.match(branch, /savePayAtCashierConfirmation\(deferredOrder\)/);
  assert.match(branch, /onPayAtCashierConfirmed\(\)/);
  assert.ok(branch.indexOf("savePayAtCashierConfirmation(deferredOrder)")
    < branch.indexOf("onPayAtCashierConfirmed()"));
  assert.ok(branch.indexOf("onPayAtCashierConfirmed()")
    < branch.indexOf("submission.clearOrderSession()"));
  assert.doesNotMatch(branch, /submitOrder|onNavigate\("portal"\)|idle/i);
  assert.match(card, /capturePayment\("card_terminal"/);
  assert.match(card, /await submission\.submitOrder\(\)/);
});

test("pay-at-cashier success commits the confirmation route directly", () => {
  const app = readFileSync("src/app/App.tsx", "utf8");
  const callback = app.match(/const payAtCashierConfirmed = useCallback\([\s\S]*?\}, \[\]\);/)?.[0] ?? "";
  assert.match(callback, /window\.history\.replaceState\(null, "", `#\$\{ROUTES\.payAtCashierConfirmation\}`\)/);
  assert.match(callback, /setRoute\(ROUTES\.payAtCashierConfirmation\)/);
  assert.match(app, /onPayAtCashierConfirmed=\{payAtCashierConfirmed\}/);
});

test("ticket-ready UI cannot remain blocked on the native printer promise", () => {
  const page = readFileSync("src/app/pages/customer/PayAtCashierConfirmation.tsx", "utf8");
  const idleHook = readFileSync("src/app/hooks/useKioskIdleReset.ts", "utf8");
  const app = readFileSync("src/app/App.tsx", "utf8");
  const printDispatch = page.match(/const printResult = printer\.printTicket[\s\S]*?withPrintTimeout\(printResult\)/)?.[0] ?? "";
  assert.match(printDispatch, /setPhase\("ready"\)/);
  assert.ok(printDispatch.indexOf('setPhase("ready")') < printDispatch.indexOf("await withPrintTimeout"));
  assert.match(page, /PRINT_RESULT_TIMEOUT_MS = 4_000/);
  assert.match(idleHook, /resetKey/);
  assert.match(app, /resetKey: route/);
});

function order(): ProductionOrder {
  return {
    id: "order-real-1", orderNumber: "M110", status: "awaiting_payment", paymentStatus: "pending",
    paymentMethod: "pay_at_cashier", source: "kiosk", customerReference: "a".repeat(48), version: 2,
    notes: null, menuId: "menu-1", menuVersion: 1, currency: "EUR", subtotal: "12.50",
    taxTotal: "1.00", discountTotal: "0.00", total: "13.50", serviceMode: "dine_in", language: "en",
    items: [{
      productId: "burger", productName: "Snapshot Burger", quantity: 1, unitPrice: "10.00",
      lineSubtotal: "12.50", taxTotal: "1.00", lineTotal: "13.50", taxRate: "0.080000",
      notes: null, sortOrder: 0, allergens: [], modifiers: [{
        modifierGroupId: "group", modifierId: "cheese", groupName: "Toppings", name: "Cheese",
        quantity: 1, unitPrice: "2.50", total: "2.50",
      }],
    }],
    placedAt: null, acceptedAt: null, preparingAt: null, readyAt: null, completedAt: null,
    cancelledAt: null, createdAt: "2026-08-03T12:00:00.000Z", updatedAt: "2026-08-03T12:00:01.000Z",
  };
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
