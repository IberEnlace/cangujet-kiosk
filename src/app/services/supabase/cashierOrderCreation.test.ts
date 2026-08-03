import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cashier = readFileSync(new URL("../../pages/CashierDashboard.tsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../orders/OrderService.ts", import.meta.url), "utf8");
const currencyMigration = readFileSync(new URL("../../../../supabase/migrations/202607230005_align_menu_currency.sql", import.meta.url), "utf8");
const seed = readFileSync(new URL("../../../../scripts/supabase-menu.mjs", import.meta.url), "utf8");

test("cashier completion calls the production API before local success", () => {
  const handler = cashier.match(/const completeSale=async\(\)=>\{[\s\S]*?\n  \};/)?.[0] ?? "";
  assert.match(handler, /buildCashierCreatePayload/);
  assert.match(handler, /resolveCashierCreateAttempt/);
  assert.match(handler, /await cashierOrderService\.create\(\{/);
  assert.match(handler, /await cashierOrderService\.pay/);
  assert.match(handler, /await cashierOrderService\.submit/);
  assert.match(handler, /workflowAttemptId:attemptForRequest\.workflowAttemptId/);
  assert.doesNotMatch(handler, /branchId|restaurantId/);
  assert.ok(handler.indexOf("await cashierOrderService.create") < handler.indexOf("setOrderItems([])"));
});

test("cashier keeps the cart intact when secure creation fails", () => {
  const handler = cashier.match(/const completeSale=async\(\)=>\{[\s\S]*?\n  \};/)?.[0] ?? "";
  const failure = handler.match(/catch\(error\)\{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(failure, /toast\.error/);
  assert.doesNotMatch(failure, /setOrderItems|setRecentOrders|setCompletedReceipt/);
});

test("cashier sends database customization IDs to the server-owned pricing service", () => {
  assert.match(cashier, /customizationOptionIds=chosenOptions\.map\(option=>option\.databaseId\?\?option\.id\)/);
  assert.match(cashier, /modifierIds:item\.customizationOptionIds/);
  assert.match(service, /\/orders/);
});

test("cashier clear and success paths replace the complete request attempt", () => {
  assert.match(cashier, /const resetCashierAttempt=\(\)=>/);
  assert.match(cashier, /const clearCurrentOrder=\(\)=>\{setOrderItems\(\[\]\);setReceived\(""\);setCashOpen\(false\);resetCashierAttempt\(\)/);
  const handler = cashier.match(/const completeSale=async\(\)=>\{[\s\S]*?\n  \};/)?.[0] ?? "";
  assert.match(handler, /setReceived\(""\);resetCashierAttempt\(\)/);
});

test("cashier uses a scoped order client instead of the customer singleton workflow", () => {
  assert.match(cashier, /const cashierOrderService = new OrderService\(\)/);
  assert.doesNotMatch(cashier, /import \{ orderService \}/);
});

test("order client has no fake local success path", () => {
  assert.match(service, /\/api\/v1/);
  assert.doesNotMatch(service, /createDemoOrder|Math\.random/);
});

test("seeded product currency follows the single active branch currency", () => {
  assert.match(currencyMigration, /count\(distinct b\.currency\)/);
  assert.match(currencyMigration, /update public\.products/);
  assert.match(currencyMigration, /where currency <> v_currency/);
  assert.match(seed, /currency: menuCurrency/);
  assert.match(seed, /exactly one active branch currency/);
});
