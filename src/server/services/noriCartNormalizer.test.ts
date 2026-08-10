import test from "node:test";
import assert from "node:assert/strict";
import { noriMenuProducts } from "../../app/services/noriMenuEngine";
import type { NoriSelectedCustomization } from "../types/noriChat";
import { NoriAgentService } from "./noriAgentService";
import { normalizeNoriRequestCart } from "./noriCartNormalizer";

function customization(): NoriSelectedCustomization {
  const product = noriMenuProducts.find(item => item.id === "burger-beef-classic")!;
  const group = product.customizationGroups.find(item => item.id === "sauce-choice")!;
  const option = group.options.find(item => item.id === "no-sauce")!;
  return {
    productId: product.id, groupId: group.id, optionId: option.id, optionName: option.name,
    priceAdjustment: option.priceAdjustment, nutritionAdjustment: option.nutritionAdjustment,
    allergensAdded: option.allergensAdded, allergensRemoved: option.allergensRemoved,
  };
}

function canonicalCart() {
  return [{
    productId: "burger-beef-classic", name: "cangujet Classic Beef Burger", quantity: 1, unitPrice: 8.9,
    customizations: { "sauce-choice": "No sauce" }, customizationObjects: [customization()],
    actionId: "pending-action-cart-contract",
  }];
}

test("cart normalizer preserves the complete frontend contract", () => {
  assert.deepEqual(normalizeNoriRequestCart(canonicalCart()), canonicalCart());
});
test("cart normalizer reads quantity from quantity", () => {
  assert.equal(normalizeNoriRequestCart([{ productId: "burger-beef-classic", quantity: 3, unitPrice: 8.9 }])[0]?.quantity, 3);
});
test("cart normalizer reads unitPrice from unitPrice", () => {
  assert.equal(normalizeNoriRequestCart([{ productId: "burger-beef-classic", quantity: 1, unitPrice: 8.9 }])[0]?.unitPrice, 8.9);
});
test("cart normalizer reads productId from productId", () => {
  assert.equal(normalizeNoriRequestCart([{ productId: "burger-beef-classic", quantity: 1 }])[0]?.productId, "burger-beef-classic");
});
test("customization map does not invalidate a cart item", () => {
  const result = normalizeNoriRequestCart([{ productId: "burger-beef-classic", quantity: 1, customizations: { "sauce-choice": "No sauce" } }]);
  assert.equal(result.length, 1); assert.equal(result[0]?.customizations?.["sauce-choice"], "No sauce");
});
test("customizationObjects do not invalidate a cart item", () => {
  const result = normalizeNoriRequestCart([{ productId: "burger-beef-classic", quantity: 1, customizationObjects: [customization()] }]);
  assert.equal(result.length, 1); assert.equal(result[0]?.customizationObjects?.[0]?.optionName, "No sauce");
  assert.equal(result[0]?.customizations?.["sauce-choice"], "No sauce");
});
test("customized burger appears in show-cart summary", async () => {
  const cart = normalizeNoriRequestCart(canonicalCart());
  const result = await new NoriAgentService().process({ message: "Show my cart.", cart, activeAllergens: [], language: "en" });
  assert.doesNotMatch(result.reply, /cart is empty/i); assert.match(result.reply, /cangujet Classic Beef Burger/); assert.match(result.reply, /No sauce/);
});
test("empty normalized cart returns the correct empty message", async () => {
  const result = await new NoriAgentService().process({ message: "Show my cart.", cart: normalizeNoriRequestCart([]), activeAllergens: [], language: "en" });
  assert.equal(result.reply, "Your cart is empty.");
});
test("legacy id qty and price aliases remain supported", () => {
  const result = normalizeNoriRequestCart([{ id: "burger-beef-classic", qty: 2, price: 8.9, customizations: [customization()] }]);
  assert.equal(result.length, 1); assert.equal(result[0]?.productId, "burger-beef-classic");
  assert.equal(result[0]?.quantity, 2); assert.equal(result[0]?.unitPrice, 8.9); assert.equal(result[0]?.customizations?.["sauce-choice"], "No sauce");
});
