import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CartItem } from "../../app/context/CartContext";
import { noriMenuProducts } from "../../app/services/noriMenuEngine";
import {
  applyNoriAddActionToCartSnapshot,
  executeNoriCartActions,
  mapNoriAddActionToCartItem,
  serializeNoriCart,
} from "../../app/services/noriCartActions";
import type { NoriAction, NoriSelectedCustomization } from "../types/noriChat";

function noSauceSelection(): NoriSelectedCustomization {
  const product = noriMenuProducts.find(item => item.id === "burger-beef-classic")!;
  const group = product.customizationGroups.find(item => item.id === "sauce-choice")!;
  const option = group.options.find(item => item.id === "no-sauce")!;
  return {
    productId: product.id, groupId: group.id, optionId: option.id, optionName: option.name,
    priceAdjustment: option.priceAdjustment, nutritionAdjustment: option.nutritionAdjustment,
    allergensAdded: option.allergensAdded, allergensRemoved: option.allergensRemoved,
  };
}

function addAction(actionId = "frontend-action-1"): Extract<NoriAction, { type: "add_to_cart" }> {
  return {
    type: "add_to_cart", actionId, productId: "burger-beef-classic", quantity: 1,
    customizations: [noSauceSelection()], unitPrice: 8.9, label: "Add burger with No sauce",
  };
}

test("frontend response add_to_cart action calls the CartContext adapter", () => {
  let calls = 0;
  const results = executeNoriCartActions([addAction()], { addItem: () => { calls += 1; } }, { executedActionIds: new Set() });
  assert.equal(calls, 1); assert.equal(results[0]?.status, "success");
});
test("frontend resolves burger-beef-classic by product id", () => {
  const mapped = mapNoriAddActionToCartItem(addAction());
  assert.equal(mapped?.id, "burger-beef-classic"); assert.equal(mapped?.name, "Morrow Classic Beef Burger");
});
test("frontend preserves the full customization object", () => {
  const customization = mapNoriAddActionToCartItem(addAction())?.noriCustomizations?.[0];
  assert.equal(customization?.groupId, "sauce-choice"); assert.equal(customization?.optionId, "no-sauce");
  assert.deepEqual(customization?.allergensRemoved, ["Eggs", "Mustard", "Soy"]);
});
test("frontend preserves the No sauce option name", () => {
  const mapped = mapNoriAddActionToCartItem(addAction());
  assert.equal(mapped?.customizations?.["sauce-choice"], "No sauce");
  assert.equal(mapped?.noriCustomizations?.[0]?.optionName, "No sauce");
});
test("frontend preserves unitPrice 8.9", () => {
  assert.equal(mapNoriAddActionToCartItem(addAction())?.price, 8.9);
});
test("frontend preserves adjusted nutrition", () => {
  const product = noriMenuProducts.find(item => item.id === "burger-beef-classic")!;
  const mapped = mapNoriAddActionToCartItem(addAction());
  assert.equal(mapped?.adjustedNutrition?.calories, product.cal - 120);
  assert.equal(mapped?.calories, product.cal - 120);
});
test("frontend ignores a duplicate actionId", () => {
  const ids = new Set<string>(); let calls = 0; const adapter = { addItem: () => { calls += 1; } };
  executeNoriCartActions([addAction()], adapter, { executedActionIds: ids });
  executeNoriCartActions([addAction()], adapter, { executedActionIds: ids });
  assert.equal(calls, 1);
});
test("failed product resolution does not mark the action executed", () => {
  const ids = new Set<string>();
  const invalid = { ...addAction("missing-action"), productId: "missing-product" };
  const result = executeNoriCartActions([invalid], { addItem: () => { throw new Error("must not add"); } }, { executedActionIds: ids });
  assert.equal(result[0]?.status, "failed"); assert.equal(ids.has("missing-action"), false);
});
test("next Nori request serialization contains the updated cart", () => {
  const updated = applyNoriAddActionToCartSnapshot([], addAction())!;
  const payload = serializeNoriCart(updated);
  assert.equal(payload.length, 1); assert.equal(payload[0]?.productId, "burger-beef-classic"); assert.equal(payload[0]?.quantity, 1);
});
test("show-cart request source is not an empty stale cart", () => {
  const updated = applyNoriAddActionToCartSnapshot([], addAction())!;
  const payload = { message: "Show my cart.", cart: serializeNoriCart(updated) };
  assert.notDeepEqual(payload.cart, []); assert.equal(payload.cart[0]?.customizations?.["sauce-choice"], "No sauce");
});
test("latest cart ref snapshot replaces a formerly empty snapshot", () => {
  const cartRef: { current: CartItem[] } = { current: [] };
  cartRef.current = applyNoriAddActionToCartSnapshot(cartRef.current, addAction())!;
  assert.equal(serializeNoriCart(cartRef.current)[0]?.unitPrice, 8.9);
});
test("reply text without structured actions does not mutate CartContext", () => {
  let calls = 0;
  executeNoriCartActions([], { addItem: () => { calls += 1; } }, { executedActionIds: new Set() });
  assert.equal(calls, 0);
});

test("actual response executor updates CartContext and the next request snapshot immediately", () => {
  const cartRef: { current: CartItem[] } = { current: [] };
  const contextItems: CartItem[] = [];
  let addCalls = 0;
  const addItem = (item: Omit<CartItem, "qty">) => {
    addCalls += 1;
    contextItems.push({ ...item, qty: 1 });
  };
  const executedActionIds = new Set<string>();
  const response = { actions: [addAction()] };

  executeNoriCartActions(response.actions, { addItem }, { executedActionIds, cartRef });
  const nextPayload = { message: "Show my cart.", cart: serializeNoriCart(cartRef.current) };

  assert.equal(addCalls, 1);
  assert.equal(contextItems[0]?.id, "burger-beef-classic");
  assert.equal(cartRef.current[0]?.id, "burger-beef-classic");
  assert.deepEqual(nextPayload.cart, [{
    productId: "burger-beef-classic",
    name: "Morrow Classic Beef Burger",
    quantity: 1,
    unitPrice: 8.9,
    customizations: { "sauce-choice": "No sauce" },
    customizationObjects: [noSauceSelection()],
    actionId: "frontend-action-1",
  }]);

  executeNoriCartActions(response.actions, { addItem }, { executedActionIds, cartRef });
  assert.equal(addCalls, 1);
  assert.equal(cartRef.current[0]?.qty, 1);
});

test("customer assistant and cart route share the single application CartProvider", () => {
  const appSource = readFileSync("src/app/App.tsx", "utf8");
  const providerMounts = appSource.match(/<CartProvider>/g) ?? [];
  assert.equal(providerMounts.length, 1);
  assert.match(appSource, /<CartProvider>.*<NoriConversationProvider><Application \/><\/NoriConversationProvider>.*<\/CartProvider>/s);
  assert.match(appSource, /route === ROUTES\.kiosk/);
  assert.match(appSource, /route === ROUTES\.cart/);
});

test("clear-cart confirmation action executes once", () => {
  let clears = 0;
  const ids = new Set<string>();
  const action: NoriAction = {
    type: "clear_cart", actionId: "clear-1", productId: "", quantity: 0,
    customizations: [], adjustedUnitPrice: 0, label: "Clear cart",
  };
  executeNoriCartActions([action], { addItem: () => undefined, clearCart: () => { clears += 1; } }, { executedActionIds: ids });
  executeNoriCartActions([action], { addItem: () => undefined, clearCart: () => { clears += 1; } }, { executedActionIds: ids });
  assert.equal(clears, 1);
});

test("interrupted clear confirmation without a clear action does not clear the cart", () => {
  let clears = 0;
  executeNoriCartActions([], { addItem: () => undefined, clearCart: () => { clears += 1; } }, { executedActionIds: new Set() });
  assert.equal(clears, 0);
});
