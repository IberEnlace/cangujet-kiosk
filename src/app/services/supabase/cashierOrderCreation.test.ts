import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cashier = readFileSync(new URL("../../pages/CashierDashboard.tsx", import.meta.url), "utf8");
const service = readFileSync(new URL("./orderService.ts", import.meta.url), "utf8");
const currencyMigration = readFileSync(new URL("../../../../supabase/migrations/202607230005_align_menu_currency.sql", import.meta.url), "utf8");
const seed = readFileSync(new URL("../../../../scripts/supabase-menu.mjs", import.meta.url), "utf8");

test("cashier completion calls the shared secure order service before local success", () => {
  const handler = cashier.match(/const completeSale=async\(\)=>\{[\s\S]*?\n  \};/)?.[0] ?? "";
  assert.match(handler, /await createOrder\(\{/);
  assert.match(handler, /source:"cashier"/);
  assert.match(handler, /branchId:profile\?\.branch_id/);
  assert.ok(handler.indexOf("await createOrder") < handler.indexOf("setRecentOrders"));
  assert.ok(handler.indexOf("if(!result.ok)") < handler.indexOf("setOrderItems([])"));
});

test("cashier keeps the cart intact when secure creation fails", () => {
  const handler = cashier.match(/const completeSale=async\(\)=>\{[\s\S]*?\n  \};/)?.[0] ?? "";
  const failure = handler.match(/if\(!result\.ok\)\{[\s\S]*?return;\s*\}/)?.[0] ?? "";
  assert.match(failure, /toast\.error/);
  assert.doesNotMatch(failure, /setOrderItems|setRecentOrders|setCompletedReceipt/);
});

test("cashier sends database customization IDs and the service resolves stable source IDs", () => {
  assert.match(cashier, /customizationOptionIds=chosenOptions\.map\(option=>option\.databaseId\?\?option\.id\)/);
  assert.match(service, /resolveCustomizationOptionIds\(requestedItems\)/);
  assert.match(service, /product_customization_groups/);
  assert.match(service, /product_customization_options/);
});

test("customer and demo paths retain their existing defaults", () => {
  assert.match(service, /p_source: input\.source \?\? "kiosk"/);
  assert.match(service, /if \(!isSupabaseConfigured \|\| !supabase\) return createDemoOrder\(input\)/);
});

test("seeded product currency follows the single active branch currency", () => {
  assert.match(currencyMigration, /count\(distinct b\.currency\)/);
  assert.match(currencyMigration, /update public\.products/);
  assert.match(currencyMigration, /where currency <> v_currency/);
  assert.match(seed, /currency: menuCurrency/);
  assert.match(seed, /exactly one active branch currency/);
});
